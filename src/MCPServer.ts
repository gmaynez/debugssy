// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import express from 'express';
import { Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  CompleteRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './tools';
import { ConfigManager } from './Config';
import {
  CURRENT_MCP_PROTOCOL_VERSION,
  EXTENSION_VERSION,
  MCP_SERVER_READY_DELAY_MS,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from './constants';
import { McpRequestValidator } from './security/McpRequestValidator';
import { ToolRouter } from './routing/ToolRouter';
import { PromptHandler } from './routing/PromptHandler';
import { CompletionProvider } from './routing/CompletionProvider';
import { ResourceProvider } from './routing/ResourceProvider';
import { Logger } from './utils/Logger';
import { isDebugssyError, formatErrorMessage, getErrorCode } from './errors';

/**
 * Main MCP server class that orchestrates the debugging tools and prompts.
 * Refactored to use composition and delegation for better separation of concerns:
 * - McpRequestValidator: Handles origin and protocol validation
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
 *    - Uses an async mutex to serialize initialization requests properly
 *    - First request acquires lock and processes; concurrent requests receive HTTP 503
 *    - After ONE successful initialization, all subsequent init attempts are rejected with 503
 *    - This matches MCP SDK behavior (one init per transport instance)
 *    - SSE fallback requests bypass the lock as they're concurrent-safe by design
 *    - Prevents "Server already initialized" errors while keeping fallback mechanisms responsive
 *
 * 3. Multiple Client Instances:
 *    - Some MCP clients (like Cursor) create multiple client instances for the same server
 *    - When "Server already initialized" is reported by the transport, we return HTTP 503 to trigger client backoff
 *    - Avoids tearing down established sessions while nudging clients to retry instead of spinning up extra instances
 *
 * 4. Resource Management:
 *    - Tracks all pending timers and in-flight requests for proper cleanup
 *    - Graceful shutdown waits for in-flight requests to complete (with timeout)
 *    - dispose() cancels all pending timers and releases locks
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

  // Resource tracking for proper cleanup
  private pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private inflightRequests: Set<Promise<void>> = new Set();
  private isDisposed: boolean = false;

  // Metrics for monitoring server health and behavior
  private metrics = {
    initAttempts: 0,
    initSuccesses: 0,
    initRejections503: 0,
    concurrentInitRejections: 0,
    alreadyInitializedErrors: 0,
  };

  // Async mutex for serializing initialization requests
  private initLock: Promise<void> = Promise.resolve();
  private initLockRelease: (() => void) | null = null;
  private isInitLockHeld: boolean = false;
  private hasSuccessfulInit: boolean = false;

  // Extracted components for better separation of concerns
  private securityValidator: McpRequestValidator;
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
    this.securityValidator = new McpRequestValidator();
    this.toolRouter = new ToolRouter(toolRegistry, configManager);
    this.promptHandler = new PromptHandler(configManager);
    this.completionProvider = new CompletionProvider();
    this.resourceProvider = new ResourceProvider();

    this.initializeMCPServer();
    this.setupHTTPRoutes();
  }

  /**
   * Starts the MCP server on the configured port.
   * @param options - Optional configuration for startup behavior
   * @param options.silent - If true, suppresses startup notification message
   * @returns Promise that resolves when server is fully started and ready
   */
  async start(options?: { silent?: boolean }): Promise<void> {
    // Reset ready flag and initialization state during startup
    this.isTransportReady = false;
    this.hasSuccessfulInit = false;

    // Reset metrics on fresh start
    this.metrics = {
      initAttempts: 0,
      initSuccesses: 0,
      initRejections503: 0,
      concurrentInitRejections: 0,
      alreadyInitializedErrors: 0,
    };

    // Initialize transport before starting HTTP server
    this.transport = new StreamableHTTPServerTransport({
      // Generate cryptographically secure session IDs using crypto.randomUUID()
      // Per MCP Security Best Practices 2025-11-25: "Generated session IDs (e.g., UUIDs) SHOULD use secure random number generators"
      // Session IDs must contain only visible ASCII characters (0x21 to 0x7E)
      sessionIdGenerator: () => {
        return `mcp-session-${randomUUID()}`;
      },
    });
    await this.mcpServer.connect(this.transport);
    this.logger.info('MCP transport initialized');

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.port, 'localhost', async () => {
          this.logger.info(`MCP Server listening on http://localhost:${this.port}/mcp`);

          // Small delay to ensure transport is fully ready to accept connections
          // This prevents race conditions when connecting immediately after startup notification
          await new Promise((resolve) => {
            this.scheduleTimer(() => resolve(undefined), MCP_SERVER_READY_DELAY_MS);
          });

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

  /**
   * Stops the MCP server and closes all connections.
   * Waits for in-flight requests to complete (with 5 second timeout).
   * @returns Promise that resolves when server is fully stopped
   */
  async stop(): Promise<void> {
    // Mark as not ready immediately to stop accepting new requests
    this.isTransportReady = false;
    this.hasSuccessfulInit = false;

    // Wait for in-flight requests to complete (with timeout)
    if (this.inflightRequests.size > 0) {
      this.logger.info(
        `Waiting for ${this.inflightRequests.size} in-flight request(s) to complete...`
      );
      try {
        await Promise.race([
          Promise.allSettled(Array.from(this.inflightRequests)),
          new Promise((resolve) => {
            this.scheduleTimer(() => resolve(undefined), 5000); // 5 second timeout
          }),
        ]);
      } catch (error) {
        this.logger.warn('Some requests did not complete before timeout:', error);
      }
    }

    // Release any pending init lock
    if (this.initLockRelease) {
      this.initLockRelease();
      this.initLockRelease = null;
    }
    this.isInitLockHeld = false;

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
   * Cancels all pending timers and releases initialization locks.
   * Should be called when the MCP server is being permanently shut down.
   * Note: Call stop() before dispose() for graceful shutdown.
   */
  dispose(): void {
    this.isDisposed = true;

    // Cancel all pending timers
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();

    // Note: inflightRequests are already awaited in stop()
    // Just clear the set to prevent any new tracking
    this.inflightRequests.clear();

    // Release init lock if held
    if (this.initLockRelease) {
      this.initLockRelease();
      this.initLockRelease = null;
    }
    this.isInitLockHeld = false;

    // Dispose component resources
    this.toolRouter.dispose();
    this.completionProvider.dispose();
  }

  /**
   * Updates the server port by stopping, reconfiguring, and restarting.
   * Creates a fresh MCP Server instance to ensure clean state.
   * @param newPort - The new port number to listen on
   * @returns Promise that resolves when server is restarted on new port
   */
  async updatePort(newPort: number): Promise<void> {
    await this.stop();
    this.port = newPort;
    this.initializeMCPServer(); // Recreate MCP Server instance with fresh state
    await this.start({ silent: true }); // Silent mode - caller will show notification
  }

  /**
   * Gets the current automation level setting.
   * @returns The current automation level ("assisted" or "full")
   */
  getCurrentAutomationLevel(): 'assisted' | 'full' {
    return this.currentAutomationLevel;
  }

  /**
   * Gets current server metrics for monitoring and diagnostics.
   * @returns Object containing initialization attempt counts and rejection metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Handles changes to the automation level by notifying connected clients.
   * Triggers tools/list_changed notification so clients refresh their tool list.
   * @param newLevel - The new automation level to apply
   * @returns Promise that resolves when notification is sent
   */
  async handleAutomationLevelChange(newLevel: 'assisted' | 'full'): Promise<void> {
    this.logger.info(
      `Automation level changed from '${this.currentAutomationLevel}' to '${newLevel}'`
    );

    const oldLevel = this.currentAutomationLevel;
    this.currentAutomationLevel = newLevel;

    // Note: ToolRouter already reads automation level dynamically from configManager
    // on each getToolSchemas() call, so no need to update it explicitly.

    await this.notifyToolListChanged(`automation level ${oldLevel} → ${newLevel}`);
  }

  /**
   * Handles changes to the step operations setting by notifying connected clients.
   * Triggers tools/list_changed notification so clients refresh their tool list.
   * @param enabled - Whether step operations are now enabled or disabled
   * @returns Promise that resolves when notification is sent
   */
  async handleStepOperationsChange(enabled: boolean): Promise<void> {
    this.logger.info(`Step operations ${enabled ? 'enabled' : 'disabled'}`);

    // Note: ToolRouter already reads allowStepOperations dynamically from configManager
    // on each getToolSchemas() call, so no need to update it explicitly.

    await this.notifyToolListChanged(`step operations ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Acquires the initialization lock to serialize concurrent init requests.
   * Returns a release function that must be called when done.
   */
  private async acquireInitLock(): Promise<() => void> {
    // Wait for any existing lock to be released
    await this.initLock;

    // Mark lock as held
    this.isInitLockHeld = true;

    // Create a new lock that others will wait on
    let release: () => void;
    this.initLock = new Promise((resolve) => {
      release = () => {
        this.isInitLockHeld = false;
        resolve();
      };
    });

    return release!;
  }

  /**
   * Schedules a timer and tracks it for cleanup.
   * Returns the timer ID for potential early cancellation.
   */
  private scheduleTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      if (!this.isDisposed) {
        callback();
      }
    }, delayMs);
    this.pendingTimers.add(timer);
    return timer;
  }

  /**
   * Tracks an in-flight request for graceful shutdown.
   */
  private trackRequest(requestPromise: Promise<void>): void {
    this.inflightRequests.add(requestPromise);
    requestPromise.finally(() => {
      this.inflightRequests.delete(requestPromise);
    });
  }

  private initializeMCPServer(): void {
    // Create a fresh MCP Server instance
    this.mcpServer = new Server(
      {
        name: 'debugssy',
        version: EXTENSION_VERSION,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
          completions: {},
          // Note: elicitation is a CLIENT capability, not a server capability.
          // The server uses server.elicitInput() which works if the client supports elicitation.
        },
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
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        // Handle custom Debugssy errors with additional context
        if (isDebugssyError(error)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: error.message,
                    code: getErrorCode(error),
                    details: error.details,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          };
        }

        // Handle generic errors
        const errorMessage = formatErrorMessage(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: false,
                  error: errorMessage,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
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
        return await this.resourceProvider.readResource(uri);
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
            hasMore: false,
          },
        };
      }

      try {
        const result = await this.completionProvider.getCompletions(
          ref.name,
          argument.name,
          argument.value || ''
        );

        return {
          completion: result,
        };
      } catch (error: unknown) {
        this.logger.error('Error providing completions:', error);
        return {
          completion: {
            values: [],
            total: 0,
            hasMore: false,
          },
        };
      }
    });
  }

  private setupHTTPRoutes(): void {
    // Security: Validate Origin header and Protocol Version
    // Delegated to McpRequestValidator
    this.app.use('/mcp', this.securityValidator.createMiddleware());

    // Main MCP endpoint - StreamableHTTPServerTransport handles sessions internally
    this.app.all('/mcp', async (req, res) => {
      try {
        // Check if transport is ready - return 503 to trigger client retry
        if (!this.isTransportReady || !this.transport) {
          this.metrics.initRejections503++;
          this.logger.warn(
            `MCP request received before transport is ready (rejection #${this.metrics.initRejections503})`
          );
          if (!res.headersSent) {
            res.status(503).json({
              error: 'Service temporarily unavailable - transport initializing',
              jsonrpc: '2.0',
              id: null,
              retryAfter: 1, // Suggest retry after 1 second
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
          // Use cryptographically secure UUID for request IDs (consistent with session ID generation)
          const requestId = randomUUID().substring(0, 8);
          this.metrics.initAttempts++;
          this.logger.info(
            `[${requestId}] Init request received, isSSE=${isSSERequest}, total attempts: ${this.metrics.initAttempts}`
          );

          // Track this request for graceful shutdown
          const requestPromise = (async () => {
            // Allow SSE requests to bypass serialization
            // SSE is a fallback mechanism that should always work concurrently
            if (!isSSERequest) {
              // Try to acquire the initialization lock
              // This serializes concurrent init requests properly
              let release: (() => void) | null = null;
              try {
                // Check if an initialization has already succeeded
                // MCP transport only allows ONE initialization per server instance
                if (this.hasSuccessfulInit) {
                  this.metrics.initRejections503++;
                  this.logger.info(
                    `[${requestId}] Rejecting init - transport already initialized by another client (rejection #${this.metrics.initRejections503})`
                  );
                  if (!res.headersSent) {
                    res.status(503).json({
                      error: 'Server busy with another initialization - please retry',
                      jsonrpc: '2.0',
                      id: null,
                      retryAfter: 1,
                    });
                  }
                  return;
                }

                // Check if lock is already held by another request
                if (this.isInitLockHeld) {
                  // Another init is in progress - reject with 503
                  this.metrics.concurrentInitRejections++;
                  this.logger.info(
                    `[${requestId}] Rejecting concurrent init - lock held (concurrent rejection #${this.metrics.concurrentInitRejections})`
                  );
                  if (!res.headersSent) {
                    res.status(503).json({
                      error: 'Server busy with another initialization - please retry',
                      jsonrpc: '2.0',
                      id: null,
                      retryAfter: 1,
                    });
                  }
                  return;
                }

                // Acquire the lock
                release = await this.acquireInitLock();
                this.initLockRelease = release;
                this.logger.debug(
                  `[${requestId}] Processing initialization request (lock acquired)`
                );

                // Double-check transport is still available
                if (!this.transport) {
                  throw new Error('Transport became unavailable during initialization');
                }

                // Handle the request
                await this.transport.handleRequest(req, res);
                this.logger.debug(`[${requestId}] Transport completed successfully`);

                // Mark that an initialization has succeeded
                // This prevents subsequent init attempts from trying
                this.hasSuccessfulInit = true;
                this.metrics.initSuccesses++;
                this.logger.info(
                  `[${requestId}] Initialization successful (success #${this.metrics.initSuccesses})`
                );
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`[${requestId}] Transport error:`, errorMessage);

                // Check if this is a "Server already initialized" error from the MCP transport
                // This can happen when MCP clients create multiple instances for the same server
                if (errorMessage.includes('Server already initialized')) {
                  this.metrics.alreadyInitializedErrors++;
                  this.logger.debug(
                    `[${requestId}] Transport already initialized (error #${this.metrics.alreadyInitializedErrors})`
                  );

                  if (!res.headersSent) {
                    res.status(503).json({
                      error: 'Server busy with another initialization - please retry',
                      jsonrpc: '2.0',
                      id: null,
                      retryAfter: 1,
                    });
                  }
                  return;
                }

                throw error;
              } finally {
                // Release the lock
                if (release) {
                  // Small delay to ensure response is fully sent before allowing next init
                  // This prevents race conditions in quick succession scenarios
                  this.scheduleTimer(() => {
                    if (release) {
                      release();
                      this.initLockRelease = null;
                      this.logger.debug(`[${requestId}] Lock released`);
                    }
                  }, 10);
                }
              }
            } else {
              // SSE requests bypass the lock entirely
              this.logger.debug(`[${requestId}] Processing SSE initialization request (no lock)`);
              try {
                // Double-check transport is still available
                if (!this.transport) {
                  throw new Error('Transport became unavailable during initialization');
                }

                await this.transport.handleRequest(req, res);
                this.logger.debug(`[${requestId}] SSE transport completed successfully`);
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logger.error(`[${requestId}] SSE transport error:`, errorMessage);
                throw error;
              }
            }
          })();

          this.trackRequest(requestPromise);
          await requestPromise;
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
            id: null,
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
        supportedProtocolVersions: SUPPORTED_MCP_PROTOCOL_VERSIONS,
      });
    });
  }

  private async notifyToolListChanged(reason: string): Promise<void> {
    // Notify connected clients about the tools/list_changed
    // Per MCP Dynamic Servers pattern: notify clients when capabilities change
    // so they can refresh their tool list without reconnecting
    try {
      await this.mcpServer.notification({
        method: 'notifications/tools/list_changed',
        params: {},
      });
      this.logger.info(`Notified clients: tools changed due to ${reason}`);
    } catch (error: unknown) {
      // Notification may fail if no clients are connected - this is fine
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`Could not notify clients (likely none connected): ${errorMessage}`);
    }
  }
}
