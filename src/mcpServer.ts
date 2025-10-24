import * as vscode from 'vscode';
import express from 'express';
import { Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema, CompleteRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './tools';
import { ConfigManager } from './config';
import { MCP_SERVER_READY_DELAY_MS, CURRENT_MCP_PROTOCOL_VERSION } from './constants';
import { SecurityValidator } from './security/SecurityValidator';
import { ToolRouter } from './routing/ToolRouter';
import { PromptHandler } from './routing/PromptHandler';
import { CompletionProvider } from './routing/CompletionProvider';
import { ResourceProvider } from './routing/ResourceProvider';

/**
 * Main MCP server class that orchestrates the debugging tools and prompts.
 * Refactored to use composition and delegation for better separation of concerns:
 * - SecurityValidator: Handles origin and protocol validation
 * - ToolRouter: Manages tool schemas and routing
 * - PromptHandler: Manages prompt schemas and generation
 * - CompletionProvider: Provides autocomplete suggestions for prompt arguments
 */
export class MCPServer {
    private app: express.Application;
    private httpServer: HTTPServer | undefined;
    private mcpServer!: Server; // Initialized in initializeMCPServer(), called from constructor
    private transport: StreamableHTTPServerTransport | undefined;
    private currentAutomationLevel: 'assisted' | 'full';
    
    // Extracted components for better separation of concerns
    private securityValidator: SecurityValidator;
    private toolRouter: ToolRouter;
    private promptHandler: PromptHandler;
    private completionProvider: CompletionProvider;
    private resourceProvider: ResourceProvider;

    constructor(
        private port: number,
        toolRegistry: ToolRegistry,
        configManager: ConfigManager
    ) {
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
                version: '0.1.0'
            },
            {
                capabilities: {
                    tools: {},
                    prompts: {},
                    resources: {},
                    completion: {}
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

        // Handle tool calls - delegated to ToolRouter
        this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                const result = await this.toolRouter.routeToolCall(name, args);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify({
                                success: false,
                                error: error.message
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
            } catch (error: any) {
                throw new Error(`Failed to read resource: ${error.message}`);
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
            } catch (error: any) {
                console.error('Error providing completions:', error);
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
                // Let the transport handle the request - it manages sessions internally
                // The transport will:
                // - Send Mcp-Session-Id header on initialization responses
                // - Expect Mcp-Session-Id header on subsequent requests
                // - Return 404 for expired sessions
                // - Handle DELETE requests for session termination
                await this.transport!.handleRequest(req, res);
                
            } catch (error: any) {
                console.error('Error handling MCP request:', error);
                if (!res.headersSent) {
                    res.status(500).json({ error: error.message });
                }
            }
        });

        // Health check endpoint
        this.app.get('/health', (_req, res) => {
            res.json({
                status: 'ok',
                server: 'debugssy-mcp',
                version: '0.1.0',
                transportInitialized: !!this.transport,
                transport: 'streamable-http',
                protocolVersion: CURRENT_MCP_PROTOCOL_VERSION,
                supportedProtocolVersions: ['2025-03-26', '2025-06-18']
            });
        });
    }

    async start(options?: { silent?: boolean }): Promise<void> {
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
        console.log('MCP transport initialized');

        return new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(this.port, 'localhost', async () => {
                    console.log(`MCP Server listening on http://localhost:${this.port}/mcp`);
                    
                    // Small delay to ensure transport is fully ready to accept connections
                    // This prevents race conditions when connecting immediately after startup notification
                    await new Promise(r => setTimeout(r, MCP_SERVER_READY_DELAY_MS));
                    
                    // Only show notification if not in silent mode (e.g., during initial startup)
                    if (!options?.silent) {
                        vscode.window.showInformationMessage(
                            `Debugssy MCP Server started on port ${this.port}`
                        );
                    }
                    console.log('MCP Server fully ready to accept connections');
                    resolve();
                });

                this.httpServer.on('error', (error: any) => {
                    if (error.code === 'EADDRINUSE') {
                        vscode.window.showErrorMessage(
                            `Port ${this.port} is already in use. Please change the port in settings.`
                        );
                    }
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    async stop(): Promise<void> {
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
                    console.log('MCP Server stopped');
                    resolve();
                });
            });
        }
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
        console.log(`Automation level changed from '${this.currentAutomationLevel}' to '${newLevel}'`);
        
        const oldLevel = this.currentAutomationLevel;
        this.currentAutomationLevel = newLevel;
        
        // Note: ToolRouter already reads automation level dynamically from configManager
        // on each getToolSchemas() call, so no need to update it explicitly.
        
        await this.notifyToolListChanged(`automation level ${oldLevel} → ${newLevel}`);
    }

    async handleStepOperationsChange(enabled: boolean): Promise<void> {
        console.log(`Step operations ${enabled ? 'enabled' : 'disabled'}`);
        
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
            console.log(`Notified clients: tools changed due to ${reason}`);
        } catch (error: any) {
            // Notification may fail if no clients are connected - this is fine
            console.log(`Could not notify clients (likely none connected): ${error.message}`);
        }
    }
}
