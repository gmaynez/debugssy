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
  InitializeRequestSchema,
  JSONRPCRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './tools';
import { ConfigManager } from './Config';
import {
  CURRENT_MCP_PROTOCOL_VERSION,
  EXTENSION_VERSION,
  MCP_SERVER_READY_DELAY_MS,
  MAX_MCP_REQUEST_BODY_BYTES,
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
 * Requests before transport readiness receive HTTP 503. Sessionless POSTs must
 * contain one schema-valid initialize request and valid transport headers before
 * they may replace an existing connection. Replacement and initialization share
 * a mutex; concurrent initialize requests receive HTTP 503. Other methods and
 * established-session requests are delegated to the SDK without replacement.
 * Timers and in-flight initialization requests are tracked for graceful shutdown.
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
    sessionReplacements: 0,
  };

  // Async mutex for serializing initialization requests
  private initLock: Promise<void> = Promise.resolve();
  private initLockRelease: (() => void) | null = null;
  private isInitLockHeld: boolean = false;
  private hasSuccessfulInit: boolean = false;
  private sessionGeneration = 0;

  // Extracted components for better separation of concerns
  private securityValidator: McpRequestValidator;
  private toolRouter: ToolRouter;
  private promptHandler: PromptHandler;
  private completionProvider: CompletionProvider;
  private resourceProvider: ResourceProvider;
  private logger: Logger;
  private configManager: ConfigManager;

  constructor(
    private port: number,
    toolRegistry: ToolRegistry,
    configManager: ConfigManager
  ) {
    this.logger = Logger.getInstance();
    this.configManager = configManager;
    this.currentAutomationLevel = configManager.getConfig().automationLevel;
    this.app = express();
    // POST bodies are parsed once and passed explicitly to the SDK transport.
    // This lets us validate initialization before replacing an existing session.

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
      sessionReplacements: 0,
    };

    // Initialize transport before starting HTTP server
    this.transport = this.createTransport();
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

        this.httpServer.on('error', async (error: Error & { code?: string }) => {
          this.isTransportReady = false;

          // Close transport that was connected before listen() failed
          if (this.transport) {
            try {
              await this.transport.close();
            } catch (closeError) {
              this.logger.warn('Error closing transport after listen failure:', closeError);
            }
            this.transport = undefined;
          }

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
   * Waits for in-flight init requests to complete (with 5 second timeout).
   * Note: Regular tool calls are handled by the transport layer during close().
   * @returns Promise that resolves when server is fully stopped
   */
  async stop(): Promise<void> {
    // Mark as not ready immediately to stop accepting new requests
    this.isTransportReady = false;
    this.hasSuccessfulInit = false;

    // Wait for in-flight init requests to complete (with timeout)
    // Note: Only init requests are tracked; tool calls are handled by transport.close()
    if (this.inflightRequests.size > 0) {
      this.logger.info(
        `Waiting for ${this.inflightRequests.size} in-flight init request(s) to complete...`
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
      // Clear stale promises after timeout to prevent retention across restart cycles
      this.inflightRequests.clear();
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
    // Reserve the next position before awaiting, so concurrent callers cannot
    // both capture the same resolved lock and enter the critical section.
    const previousLock = this.initLock;
    let release: () => void;
    this.initLock = new Promise((resolve) => {
      let released = false;
      release = () => {
        if (released) {
          return;
        }
        released = true;
        this.isInitLockHeld = false;
        resolve();
      };
    });
    await previousLock;
    this.isInitLockHeld = true;
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
   * Resets session state to allow new connections.
   * Called when a session is properly closed via DELETE request,
   * or when replacing a stale session.
   */
  private resetSessionState(): void {
    this.sessionGeneration++;
    this.hasSuccessfulInit = false;
    // Session closure must not unlock a concurrent initialization. Its owner
    // releases the mutex in finally; stop/dispose handle shutdown separately.
    this.logger.debug('Session state reset - ready for new connections');
  }

  /**
   * Creates a new transport instance with standard configuration.
   * Used for initial setup and session replacement.
   */
  private createTransport(): StreamableHTTPServerTransport {
    return new StreamableHTTPServerTransport({
      maxRequestBodySize: MAX_MCP_REQUEST_BODY_BYTES,
      sessionIdGenerator: () => {
        return `mcp-session-${randomUUID()}`;
      },
      onsessioninitialized: (sessionId) => {
        this.logger.info(`MCP session initialized: ${sessionId}`);
      },
      onsessionclosed: (sessionId) => {
        this.logger.info(`MCP session closed via DELETE: ${sessionId}`);
        if (this.transport?.sessionId === sessionId) {
          this.resetSessionState();
        }
      },
    });
  }

  /**
   * Recreates the transport to reset its internal state.
   * This is necessary for session replacement because the MCP SDK's transport
   * maintains internal state (_initialized) that can't be reset externally.
   */
  private async recreateTransport(): Promise<void> {
    this.sessionGeneration++;
    // Close the old transport to clean up SSE connections
    if (this.transport) {
      await this.transport.close();
    }

    // Create and connect new transport
    this.transport = this.createTransport();
    await this.mcpServer.connect(this.transport);
    this.logger.debug('Transport recreated with fresh state');
  }

  /**
   * Tracks an in-flight request for graceful shutdown.
   */
  private trackRequest(requestPromise: Promise<void>): void {
    this.inflightRequests.add(requestPromise);
    const removeRequest = () => this.inflightRequests.delete(requestPromise);
    void requestPromise.then(removeRequest, removeRequest);
  }

  private sendJsonRpcError(
    res: express.Response,
    status: number,
    error: string,
    extra: Record<string, unknown> = {}
  ): void {
    if (res.headersSent) {
      return;
    }
    res.status(status).json({
      error,
      jsonrpc: '2.0',
      id: null,
      ...extra,
    });
  }

  private ensureTransportReady(res: express.Response): StreamableHTTPServerTransport | null {
    if (!this.isTransportReady || !this.transport) {
      this.metrics.initRejections503++;
      this.logger.warn(
        `MCP request received before transport is ready (rejection #${this.metrics.initRejections503})`
      );
      this.sendJsonRpcError(res, 503, 'Service temporarily unavailable - transport initializing', {
        retryAfter: 1,
      });
      return null;
    }

    return this.transport;
  }

  private async handleMcpRequest(req: express.Request, res: express.Response): Promise<void> {
    try {
      const transport = this.ensureTransportReady(res);
      if (!transport) {
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const isInitRequest = !sessionId && req.method === 'POST';

      if (isInitRequest) {
        await this.handleInitRequest(req, res, transport);
        return;
      }

      await this.forwardToTransport(transport, req, res);
    } catch (error: unknown) {
      this.logger.error('Error handling MCP request:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.sendJsonRpcError(res, 500, errorMessage);
    }
  }

  private async handleInitRequest(
    req: express.Request,
    res: express.Response,
    transport: StreamableHTTPServerTransport
  ): Promise<void> {
    const requestId = randomUUID().substring(0, 8);
    this.metrics.initAttempts++;
    this.logger.info(
      `[${requestId}] Init request received, total attempts: ${this.metrics.initAttempts}`
    );

    const requestPromise = this.handleSerializedInitRequest(req, res, transport, requestId);

    this.trackRequest(requestPromise);
    await requestPromise;
  }

  private async handleSerializedInitRequest(
    req: express.Request,
    res: express.Response,
    _transport: StreamableHTTPServerTransport,
    requestId: string
  ): Promise<void> {
    let release: (() => void) | null = null;

    try {
      if (!this.validateInitializationRequest(req, res)) {
        return;
      }

      if (this.isInitLockHeld) {
        this.metrics.concurrentInitRejections++;
        this.logger.info(
          `[${requestId}] Rejecting concurrent init - lock held (concurrent rejection #${this.metrics.concurrentInitRejections})`
        );
        this.sendJsonRpcError(res, 503, 'Server busy with another initialization - please retry', {
          retryAfter: 1,
        });
        return;
      }

      // Reserve synchronously before acquireInitLock yields.
      this.isInitLockHeld = true;
      release = await this.acquireInitLock();
      this.initLockRelease = release;
      this.logger.debug(`[${requestId}] Processing initialization request (lock acquired)`);

      // Only a validated initialize request can replace a transport, under the
      // lock. A closed SDK transport also needs recreation after DELETE.
      if (this.hasSuccessfulInit || this.transport?.sessionId) {
        this.metrics.sessionReplacements++;
        this.hasSuccessfulInit = false;
        await this.recreateTransport();
      }

      if (!this.transport) {
        throw new Error('Transport became unavailable during initialization');
      }

      const transport = this.transport;
      const generation = this.sessionGeneration;
      await this.forwardToTransport(transport, req, res);
      this.logger.debug(`[${requestId}] Transport completed successfully`);

      // SDK validation failures resolve normally after writing an HTTP error.
      // A resolved promise alone does not establish an initialized session.
      if (
        this.transport === transport &&
        this.sessionGeneration === generation &&
        transport.sessionId &&
        res.statusCode < 400
      ) {
        this.hasSuccessfulInit = true;
        this.metrics.initSuccesses++;
        this.logger.info(
          `[${requestId}] Initialization successful (success #${this.metrics.initSuccesses})`
        );
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${requestId}] Transport error:`, errorMessage);

      if (errorMessage.includes('Server already initialized')) {
        this.metrics.alreadyInitializedErrors++;
        this.logger.debug(
          `[${requestId}] Transport already initialized (error #${this.metrics.alreadyInitializedErrors})`
        );

        this.sendJsonRpcError(res, 503, 'Server busy with another initialization - please retry', {
          retryAfter: 1,
        });
        return;
      }

      throw error;
    } finally {
      if (release) {
        release();
        this.initLockRelease = null;
      }
    }
  }

  private forwardToTransport(
    transport: StreamableHTTPServerTransport,
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    const body: unknown = req.body;
    return body === undefined
      ? transport.handleRequest(req, res)
      : transport.handleRequest(req, res, body);
  }

  private validateInitializationRequest(req: express.Request, res: express.Response): boolean {
    if (req.method !== 'POST') {
      this.sendJsonRpcError(res, 400, 'Initialization requires a POST request');
      return false;
    }
    const accept = req.headers.accept;
    if (!accept?.includes('application/json') || !accept.includes('text/event-stream')) {
      this.sendJsonRpcError(res, 406, 'Client must accept application/json and text/event-stream');
      return false;
    }
    const contentType = req.headers['content-type'];
    if (contentType?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      this.sendJsonRpcError(res, 415, 'Content-Type must be application/json');
      return false;
    }
    const body: unknown = req.body;
    // The SDK accepts a singleton initialization batch, but rejects mixed batches.
    const message: unknown = Array.isArray(body) && body.length === 1 ? body[0] : body;
    if (
      !JSONRPCRequestSchema.safeParse(message).success ||
      !InitializeRequestSchema.safeParse(message).success
    ) {
      this.sendJsonRpcError(res, 400, 'A sessionless POST must contain a valid initialize request');
      return false;
    }
    return true;
  }

  private handleHealthCheck(_req: express.Request, res: express.Response): void {
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
  }

  private initializeMCPServer(): void {
    // Create a fresh MCP Server instance
    this.mcpServer = new Server(
      {
        name: 'debugssy',
        version: EXTENSION_VERSION,
        description:
          'MCP server for VS Code debugging - provides tools for breakpoints, variable inspection, and debug control via the Debug Adapter Protocol (DAP)',
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
              text: this.stringifyMcpPayload(result),
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
                text: this.stringifyMcpPayload({
                  success: false,
                  error: error.message,
                  code: getErrorCode(error),
                  details: error.details,
                }),
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
              text: this.stringifyMcpPayload({
                success: false,
                error: errorMessage,
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  private stringifyMcpPayload(payload: unknown): string {
    const { minifyResponses } = this.configManager.getConfig();
    return minifyResponses ? JSON.stringify(payload) : JSON.stringify(payload, null, 2);
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

      return await this.resourceProvider.readResource(uri);
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

    this.app.use('/mcp', express.json({ limit: MAX_MCP_REQUEST_BODY_BYTES }));

    // Main MCP endpoint - StreamableHTTPServerTransport handles sessions internally
    this.app.all('/mcp', async (req, res) => {
      await this.handleMcpRequest(req, res);
    });

    this.app.use(
      '/mcp',
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        const status =
          error instanceof Error && 'status' in error && error.status === 413 ? 413 : 400;
        this.sendJsonRpcError(
          res,
          status,
          status === 413 ? 'Request body too large' : 'Invalid JSON request body'
        );
      }
    );

    // Health check endpoint - allows clients to poll for readiness
    this.app.get('/health', (req, res) => {
      this.handleHealthCheck(req, res);
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
