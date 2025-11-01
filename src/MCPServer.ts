// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import express from 'express';
import { Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, CompleteRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './tools';
import { ConfigManager } from './Config';
import { MCP_SERVER_READY_DELAY_MS, CURRENT_MCP_PROTOCOL_VERSION, EXTENSION_VERSION } from './constants';
import { SecurityValidator } from './security/SecurityValidator';
import { ToolRouter } from './routing/ToolRouter';
import { PromptHandler } from './routing/PromptHandler';
import { CompletionProvider } from './routing/CompletionProvider';
import { ResourceProvider } from './routing/ResourceProvider';
import { Logger } from './utils/Logger';

/**
 * Main MCP server class that orchestrates the debugging tools and prompts.
 * Refactored to use composition and delegation for better separation of concerns:
 * - SecurityValidator: Handles origin and protocol validation
 * - ToolRouter: Manages tool schemas and routing
 * - PromptHandler: Manages prompt schemas and generation
 * - CompletionProvider: Provides autocomplete suggestions for prompt arguments
 * - ResourceProvider: Provides resource listing and reading
 * 
 * Race Condition Handling:
 * The server includes comprehensive protection against race conditions:
 * 
 * 1. Early Connection Attempts:
 *    - Requests arriving before transport initialization receive HTTP 503
 *    - Triggers MCP client retry logic with exponential backoff
 * 
 * 2. Concurrent Initialization Requests:
 *    - Detects multiple simultaneous initialization attempts (no Mcp-Session-Id header)
 *    - First request processes immediately; subsequent ones receive HTTP 503 with a retry hint
 *    - SSE fallback requests are permitted even when another initialization is running
 *    - Prevents "Server already initialized" errors while keeping fallback mechanisms responsive
 * 
 * 3. Multiple Client Instances:
 *    - Some MCP clients (like Cursor) create multiple client instances for the same server
 *    - When "Server already initialized" is reported by the transport, we return HTTP 503 to trigger client backoff
 *    - Avoids tearing down established sessions while nudging clients to retry instead of spinning up extra instances
 * 
 * This handles the common scenario where MCP clients like Cursor start before the
 * VS Code extension has fully initialized, and make multiple rapid retry attempts.
 */
export class MCPServer {
    private app: express.Application;
    private httpServer: HTTPServer | undefined;
    private mcpServer!: Server; // Initialized in initializeMCPServer(), called from constructor
    private transport: StreamableHTTPServerTransport | undefined;
    private currentAutomationLevel: 'assisted' | 'full';
    private isTransportReady: boolean = false;
    private initializationInProgress: boolean = false;
    
    // Extracted components for better separation of concerns
    private securityValidator: SecurityValidator;
    private toolRouter: ToolRouter;
    private promptHandler: PromptHandler;
    private completionProvider: CompletionProvider;
    private resourceProvider: ResourceProvider;
    private logger: Logger;

    constructor(
        private port: number,
        toolRegistry: ToolRegistry,
        configManager: ConfigManager
    ) {
        this.logger = Logger.getInstance();
        this.currentAutomationLevel = configManager.getConfig().automationLevel;
        this.app = express();
        // Note: Do NOT use express.json() middleware as it consumes the request stream
        // StreamableHTTPServerTransport needs to read the raw stream

        // Initialize components
        this.securityValidator = new SecurityValidator();
        this.toolRouter = new ToolRouter(toolRegistry, configManager);
        this.promptHandler = new PromptHandler(configManager);
        this.completionProvider = new CompletionProvider();
        this.resourceProvider = new ResourceProvider();

        this.initializeMCPServer();
        this.setupHTTPRoutes();
    }

    private initializeMCPServer(): void {
        // Create a fresh MCP Server instance
        this.mcpServer = new Server(
            {
                name: 'debugssy',
                version: EXTENSION_VERSION
            },
            {
                capabilities: {
                    tools: {},
                    prompts: {},
                    resources: {},
                    completion: {},
                    // Enable elicitation for user confirmation of potentially unsafe operations
                    elicitation: {}
                }
            }
        );

        this.setupToolHandlers();
        this.setupPromptHandlers();
        this.setupResourceHandlers();
        this.setupCompletionHandler();
    }

    private setupToolHandlers(): void {
        // List available tools - delegated to ToolRouter
        this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = this.toolRouter.getToolSchemas();
            return { tools };
        });

        // Handle tool calls - delegated to ToolRouter with elicitation support
        this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                // Pass the server instance to enable elicitation via server.elicitInput()
                const result = await this.toolRouter.routeToolCall(name, args, this.mcpServer);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: errorMessage
                            }, null, 2)
                        }
                    ],
                    isError: true
                };
            }
        });
    }

    private setupPromptHandlers(): void {
        // List available prompts - delegated to PromptHandler
        this.mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
            const prompts = this.promptHandler.getPromptSchemas();
            return { prompts };
        });

        // Get a specific prompt - delegated to PromptHandler
        this.mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            return this.promptHandler.generatePrompt(name, args);
        });
    }

    private setupResourceHandlers(): void {
        // List available resources - delegated to ResourceProvider
        this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
            const resources = await this.resourceProvider.listResources();
            return { resources };
        });

        // Handle resource reading - delegated to ResourceProvider
        this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
            const { uri } = request.params;

            try {
                const result = await this.resourceProvider.readResource(uri);
                return result;
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                throw new Error(`Failed to read resource: ${errorMessage}`);
            }
        });
    }

    private setupCompletionHandler(): void {
        // Provide completions for prompt arguments - delegated to CompletionProvider
        this.mcpServer.setRequestHandler(CompleteRequestSchema, async (request) => {
            const { ref, argument } = request.params;

            // Only provide completions for prompts (not resources or other ref types)
            if (ref.type !== 'ref/prompt') {
                return {
                    completion: {
                        values: [],
                        total: 0,
                        hasMore: false
                    }
                };
            }

            try {
                const result = await this.completionProvider.getCompletions(
                    ref.name,
                    argument.name,
                    argument.value || ''
                );

                return {
                    completion: result
                };
            } catch (error: unknown) {
                this.logger.error('Error providing completions:', error);
                return {
                    completion: {
                        values: [],
                        total: 0,
                        hasMore: false
                    }
                };
            }
        });
    }

    private setupHTTPRoutes(): void {
        // Security: Validate Origin header and Protocol Version
        // Delegated to SecurityValidator
        this.app.use('/mcp', this.securityValidator.createMiddleware());

        // Main MCP endpoint - StreamableHTTPServerTransport handles sessions internally
        this.app.all('/mcp', async (req, res) => {
            try {
                // Check if transport is ready - return 503 to trigger client retry
                if (!this.isTransportReady || !this.transport) {
                    this.logger.warn('MCP request received before transport is ready');
                    if (!res.headersSent) {
                        res.status(503).json({ 
                            error: 'Service temporarily unavailable - transport initializing',
                            jsonrpc: '2.0',
                            id: null,
                            retryAfter: 1 // Suggest retry after 1 second
                        });
                    }
                    return;
                }

                // Detect initialization requests (no Mcp-Session-Id header)
                // and serialize them to prevent "Server already initialized" errors
                const sessionId = req.headers['mcp-session-id'] as string | undefined;
                const isInitRequest = !sessionId;
                
                // Check if this is an SSE request (fallback mechanism)
                // SSE requests should always be allowed, even during initialization
                const acceptHeader = req.headers['accept'] as string | undefined;
                const isSSERequest = req.method === 'GET' && acceptHeader?.includes('text/event-stream');

                if (isInitRequest) {
                    const requestId = Math.random().toString(36).substring(7);
                    this.logger.info(`[${requestId}] Init request received, flag=${this.initializationInProgress}, isSSE=${isSSERequest}`);
                    
                    // Allow SSE requests to bypass concurrent initialization check
                    // SSE is a fallback mechanism that should always work
                    if (!isSSERequest && this.initializationInProgress) {
                        this.logger.info(`[${requestId}] Rejecting concurrent init - server busy`);
                        if (!res.headersSent) {
                            res.status(503).json({
                                error: 'Server busy with another initialization - please retry',
                                jsonrpc: '2.0',
                                id: null,
                                retryAfter: 1
                            });
                        }
                        return;
                    }
                    
                    // Set flag immediately before any async operations (only for non-SSE requests)
                    // SSE requests don't set the flag as they're meant to be concurrent-safe fallbacks
                    if (!isSSERequest) {
                        this.initializationInProgress = true;
                        this.logger.info(`[${requestId}] Processing initialization request (flag now true)`);
                    } else {
                        this.logger.info(`[${requestId}] Processing SSE initialization request (not setting flag)`);
                    }

                    try {
                        // Let the transport handle the request - it manages sessions internally
                        await this.transport.handleRequest(req, res);
                        this.logger.info(`[${requestId}] Transport completed successfully`);
                    } catch (error: unknown) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        this.logger.error(`[${requestId}] Transport error:`, errorMessage);
                        
                        // Check if this is a "Server already initialized" error from the MCP transport
                        // This can happen when MCP clients create multiple instances for the same server
                        if (errorMessage.includes('Server already initialized')) {
                            this.logger.info(`[${requestId}] Transport reported server already initialized (isSSE=${isSSERequest})`);

                            if (!res.headersSent) {
                                res.status(503).json({
                                    error: 'Server busy with another initialization - please retry',
                                    jsonrpc: '2.0',
                                    id: null,
                                    retryAfter: 1
                                });
                            }
                            return;
                        }

                        throw error;
                    } finally {
                        // Reset flag on next tick (setTimeout 0) to allow truly concurrent requests
                        // (same millisecond) to be caught, but fast enough for SSE fallbacks
                        // Only reset if this was a non-SSE request that set the flag
                        if (!isSSERequest) {
                            this.logger.info(`[${requestId}] Will reset flag on next tick`);
                            setTimeout(() => {
                                this.logger.info(`[${requestId}] Resetting flag`);
                                this.initializationInProgress = false;
                            }, 0);
                        } else {
                            this.logger.info(`[${requestId}] SSE request completed (flag unchanged)`);
                        }
                    }
                    return; // Exit early to prevent duplicate handling
                }

                // Handle non-initialization requests (with session ID) normally
                // These bypass the queue and process immediately
                await this.transport.handleRequest(req, res);
                
            } catch (error: unknown) {
                this.logger.error('Error handling MCP request:', error);

                if (!res.headersSent) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                    res.status(500).json({ 
                        error: errorMessage,
                        jsonrpc: '2.0',
                        id: null
                    });
                }
            }
        });

        // Health check endpoint - allows clients to poll for readiness
        this.app.get('/health', (_req, res) => {
            const isReady = this.isTransportReady && !!this.transport;
            res.status(isReady ? 200 : 503).json({
                status: isReady ? 'ready' : 'initializing',
                server: 'debugssy-mcp',
                version: EXTENSION_VERSION,
                transportInitialized: !!this.transport,
                transportReady: this.isTransportReady,
                transport: 'streamable-http',
                protocolVersion: CURRENT_MCP_PROTOCOL_VERSION,
                supportedProtocolVersions: ['2025-03-26', '2025-06-18']
            });
        });
    }

    async start(options?: { silent?: boolean }): Promise<void> {
        // Reset ready flag during initialization
        this.isTransportReady = false;
        
        // Initialize transport before starting HTTP server
        this.transport = new StreamableHTTPServerTransport({
            // Generate cryptographically secure session IDs using crypto.randomUUID()
            // Per MCP Security Best Practices 2025-06-18: "Generated session IDs (e.g., UUIDs) SHOULD use secure random number generators"
            // Session IDs must contain only visible ASCII characters (0x21 to 0x7E)
            sessionIdGenerator: () => {
                return `mcp-session-${randomUUID()}`;
            }
        });
        await this.mcpServer.connect(this.transport);
        this.logger.info('MCP transport initialized');

        return new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(this.port, 'localhost', async () => {
                    this.logger.info(`MCP Server listening on http://localhost:${this.port}/mcp`);
                    
                    // Small delay to ensure transport is fully ready to accept connections
                    // This prevents race conditions when connecting immediately after startup notification
                    await new Promise(r => setTimeout(r, MCP_SERVER_READY_DELAY_MS));
                    
                    // Mark transport as ready - now safe to accept MCP requests
                    this.isTransportReady = true;
                    
                    // Only show notification if not in silent mode (e.g., during initial startup)
                    if (!options?.silent) {
                        vscode.window.showInformationMessage(
                            `Debugssy MCP Server started on port ${this.port}`
                        );
                    }
                    this.logger.info('MCP Server fully ready to accept connections');
                    resolve();
                });

                this.httpServer.on('error', (error: any) => {
                    this.isTransportReady = false;
                    if (error.code === 'EADDRINUSE') {
                        vscode.window.showErrorMessage(
                            `Port ${this.port} is already in use. Please change the port in settings.`
                        );
                    }
                    reject(error);
                });
            } catch (error) {
                this.isTransportReady = false;
                reject(error);
            }
        });
    }

    async stop(): Promise<void> {
        // Mark as not ready immediately to stop accepting new requests
        this.isTransportReady = false;
        this.initializationInProgress = false;
        
        // Close MCP Server and transport
        if (this.transport) {
            await this.transport.close();
            this.transport = undefined;
        }
        
        // Note: We don't call mcpServer.close() here because the MCP SDK Server
        // doesn't have a close method. Instead, we recreate the instance on restart
        // via initializeMCPServer() to ensure clean state.

        // Close HTTP server
        if (this.httpServer) {
            return new Promise((resolve) => {
                this.httpServer!.close(() => {
                    this.logger.info('MCP Server stopped');
                    resolve();
                });
            });
        }
    }
    
    /**
     * Disposes all resources including ToolRouter and its ExpressionValidator.
     * Should be called when the MCP server is being permanently shut down.
     */
    dispose(): void {
        this.toolRouter.dispose();
    }

    async updatePort(newPort: number): Promise<void> {
        await this.stop();
        this.port = newPort;
        this.initializeMCPServer(); // Recreate MCP Server instance with fresh state
        await this.start({ silent: true }); // Silent mode - caller will show notification
    }

    getCurrentAutomationLevel(): 'assisted' | 'full' {
        return this.currentAutomationLevel;
    }

    async handleAutomationLevelChange(newLevel: 'assisted' | 'full'): Promise<void> {
        this.logger.info(`Automation level changed from '${this.currentAutomationLevel}' to '${newLevel}'`);
        
        const oldLevel = this.currentAutomationLevel;
        this.currentAutomationLevel = newLevel;
        
        // Note: ToolRouter already reads automation level dynamically from configManager
        // on each getToolSchemas() call, so no need to update it explicitly.
        
        await this.notifyToolListChanged(`automation level ${oldLevel} → ${newLevel}`);
    }

    async handleStepOperationsChange(enabled: boolean): Promise<void> {
        this.logger.info(`Step operations ${enabled ? 'enabled' : 'disabled'}`);
        
        // Note: ToolRouter already reads allowStepOperations dynamically from configManager
        // on each getToolSchemas() call, so no need to update it explicitly.
        
        await this.notifyToolListChanged(`step operations ${enabled ? 'enabled' : 'disabled'}`);
    }

    private async notifyToolListChanged(reason: string): Promise<void> {
        // Notify connected clients about the tools/list_changed
        // Per MCP Dynamic Servers pattern: notify clients when capabilities change
        // so they can refresh their tool list without reconnecting
        try {
            await this.mcpServer.notification({
                method: 'notifications/tools/list_changed',
                params: {}
            });
            this.logger.info(`Notified clients: tools changed due to ${reason}`);
        } catch (error: unknown) {
            // Notification may fail if no clients are connected - this is fine
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.debug(`Could not notify clients (likely none connected): ${errorMessage}`);
        }
    }
}
