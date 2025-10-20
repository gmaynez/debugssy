import * as vscode from 'vscode';
import express from 'express';
import { Server as HTTPServer } from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './tools';
import { ConfigManager } from './config';

export class MCPServer {
    private app: express.Application;
    private httpServer: HTTPServer | undefined;
    private mcpServer: Server;
    private transport: StreamableHTTPServerTransport | undefined;

    constructor(
        private port: number,
        private toolRegistry: ToolRegistry,
        private configManager: ConfigManager
    ) {
        this.app = express();
        // Note: Do NOT use express.json() middleware as it consumes the request stream
        // StreamableHTTPServerTransport needs to read the raw stream

        this.mcpServer = new Server(
            {
                name: 'debugssy',
                version: '0.1.0'
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );

        this.setupToolHandlers();
        this.setupHTTPRoutes();
    }

    private setupToolHandlers(): void {
        // List available tools - dynamically filtered based on automation mode
        this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
            const automationLevel = this.configManager.getConfig().automationLevel;
            
            // Tools available in all modes
            const commonTools = [
                // Debug Control Tools (assisted mode versions)
                {
                    name: 'stop_debugging',
                    description: 'Stop the current debugging session',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'continue',
                    description: automationLevel === 'assisted' 
                        ? 'Prompt user to click Continue button in VS Code debugger UI'
                        : 'Continue execution in the current debug session',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'step_over',
                    description: automationLevel === 'assisted'
                        ? 'Prompt user to click Step Over button in VS Code debugger UI'
                        : 'Step over the current line',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'step_into',
                    description: automationLevel === 'assisted'
                        ? 'Prompt user to click Step Into button in VS Code debugger UI'
                        : 'Step into the current function',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'step_out',
                    description: automationLevel === 'assisted'
                        ? 'Prompt user to click Step Out button in VS Code debugger UI'
                        : 'Step out of the current function',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'pause',
                    description: automationLevel === 'assisted'
                        ? 'Prompt user to click Pause button in VS Code debugger UI'
                        : 'Pause execution in the current debug session',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'restart',
                    description: automationLevel === 'assisted'
                        ? 'Prompt user to click Restart button in VS Code debugger UI'
                        : 'Restart the current debug session',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                // Breakpoint Tools
                {
                    name: 'set_breakpoint',
                    description: 'Set a breakpoint at the specified file and line',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filePath: {
                                type: 'string',
                                description: 'Absolute path to the file'
                            },
                            line: {
                                type: 'number',
                                description: 'Line number (1-based)'
                            },
                            condition: {
                                type: 'string',
                                description: 'Optional condition expression'
                            },
                            hitCondition: {
                                type: 'string',
                                description: 'Optional hit count condition'
                            },
                            logMessage: {
                                type: 'string',
                                description: 'Optional log message (creates a logpoint)'
                            }
                        },
                        required: ['filePath', 'line']
                    }
                },
                {
                    name: 'remove_breakpoint',
                    description: 'Remove a breakpoint at the specified location',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filePath: {
                                type: 'string',
                                description: 'Absolute path to the file'
                            },
                            line: {
                                type: 'number',
                                description: 'Line number (1-based)'
                            }
                        },
                        required: ['filePath', 'line']
                    }
                },
                {
                    name: 'list_breakpoints',
                    description: 'List all breakpoints in the workspace',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'toggle_breakpoint',
                    description: 'Toggle a breakpoint enabled/disabled state',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            filePath: {
                                type: 'string',
                                description: 'Absolute path to the file'
                            },
                            line: {
                                type: 'number',
                                description: 'Line number (1-based)'
                            }
                        },
                        required: ['filePath', 'line']
                    }
                },
                {
                    name: 'remove_all_breakpoints',
                    description: 'Remove all breakpoints from the workspace',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                // Inspection Tools
                {
                    name: 'get_variables',
                    description: 'Get variables from the current stack frame',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            scope: {
                                type: 'string',
                                description: 'Optional scope name to filter (e.g., "Local", "Global")'
                            },
                            frameId: {
                                type: 'number',
                                description: 'Optional frame ID (defaults to current frame)'
                            }
                        }
                    }
                },
                {
                    name: 'get_call_stack',
                    description: 'Get the current call stack',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'evaluate_expression',
                    description: 'Evaluate an expression in the current debug context',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            expression: {
                                type: 'string',
                                description: 'Expression to evaluate'
                            },
                            frameId: {
                                type: 'number',
                                description: 'Optional frame ID (defaults to current frame)'
                            }
                        },
                        required: ['expression']
                    }
                },
                {
                    name: 'get_threads',
                    description: 'Get all threads in the current debug session',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                },
                {
                    name: 'get_debug_state',
                    description: 'Get current debug session state including execution state (running/paused), current location if paused, and reason for stopping',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                }
            ];
            
            // Tools only available in full automation mode
            const fullAutomationTools = [
                {
                    name: 'start_debugging',
                    description: 'Start a debugging session with the specified configuration. Requires full automation mode.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            workspaceFolder: {
                                type: 'string',
                                description: 'Name or path of the workspace folder'
                            },
                            name: {
                                type: 'string',
                                description: 'Name of the debug configuration from launch.json'
                            },
                            configuration: {
                                type: 'object',
                                description: 'Full debug configuration object (alternative to name)'
                            }
                        }
                    }
                },
                {
                    name: 'wait_for_breakpoint',
                    description: 'Wait for execution to pause at a breakpoint. Blocks until next breakpoint is hit or timeout occurs. Requires full automation mode.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            timeout: {
                                type: 'number',
                                description: 'Timeout in milliseconds (optional). If not provided, uses debugssy.waitForBreakpointTimeout setting (default: 10000ms)'
                            }
                        }
                    }
                }
            ];
            
            // Return tools based on automation level
            const tools = automationLevel === 'full' 
                ? [...commonTools, ...fullAutomationTools]
                : commonTools;
            
            return { tools };
        });

        // Handle tool calls
        this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                let result;

                switch (name) {
                    // Debug Control
                    case 'start_debugging':
                        result = await this.toolRegistry.debugControl.startDebugging(args || {});
                        break;
                    case 'stop_debugging':
                        result = await this.toolRegistry.debugControl.stopDebugging();
                        break;
                    case 'continue':
                        result = await this.toolRegistry.debugControl.continueExecution();
                        break;
                    case 'step_over':
                        result = await this.toolRegistry.debugControl.stepOver();
                        break;
                    case 'step_into':
                        result = await this.toolRegistry.debugControl.stepInto();
                        break;
                    case 'step_out':
                        result = await this.toolRegistry.debugControl.stepOut();
                        break;
                    case 'pause':
                        result = await this.toolRegistry.debugControl.pause();
                        break;
                    case 'restart':
                        result = await this.toolRegistry.debugControl.restart();
                        break;

                    // Breakpoints
                    case 'set_breakpoint':
                        result = await this.toolRegistry.breakpoints.setBreakpoint(args as any || {});
                        break;
                    case 'remove_breakpoint':
                        result = await this.toolRegistry.breakpoints.removeBreakpoint(args as any || {});
                        break;
                    case 'list_breakpoints':
                        result = await this.toolRegistry.breakpoints.listBreakpoints();
                        break;
                    case 'toggle_breakpoint':
                        result = await this.toolRegistry.breakpoints.toggleBreakpoint(args as any || {});
                        break;
                    case 'remove_all_breakpoints':
                        result = await this.toolRegistry.breakpoints.removeAllBreakpoints();
                        break;

                    // Inspection
                    case 'get_variables':
                        result = await this.toolRegistry.inspection.getVariables(args as any || {});
                        break;
                    case 'get_call_stack':
                        result = await this.toolRegistry.inspection.getCallStack();
                        break;
                    case 'evaluate_expression':
                        result = await this.toolRegistry.inspection.evaluateExpression(args as any || {});
                        break;
                    case 'get_threads':
                        result = await this.toolRegistry.inspection.getThreads();
                        break;
                    case 'get_debug_state':
                        result = await this.toolRegistry.inspection.getDebugState();
                        break;
                    case 'wait_for_breakpoint': {
                        const automationLevel = this.configManager.getConfig().automationLevel;
                        result = await this.toolRegistry.inspection.waitForBreakpoint({
                            timeout: (args as any)?.timeout,
                            automationLevel
                        });
                        break;
                    }

                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }

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

    private setupHTTPRoutes(): void {
        // Security: Validate Origin header to prevent DNS rebinding attacks
        // This is a MUST according to MCP specification
        this.app.use('/mcp', (req, res, next) => {
            const origin = req.headers.origin;
            
            // Allow requests with no origin (e.g., from non-browser clients like Claude Desktop)
            // or from localhost origins only
            if (origin) {
                try {
                    const url = new URL(origin);
                    const isLocalhost = 
                        url.hostname === 'localhost' || 
                        url.hostname === '127.0.0.1' ||
                        url.hostname === '[::1]';
                    
                    if (!isLocalhost) {
                        console.warn(`Rejected request from non-localhost origin: ${origin}`);
                        res.status(403).json({ 
                            error: 'Forbidden: Invalid origin. Only localhost origins are allowed.' 
                        });
                        return;
                    }
                } catch (e) {
                    console.warn(`Rejected request with invalid origin: ${origin}`);
                    res.status(403).json({ 
                        error: 'Forbidden: Invalid origin format.' 
                    });
                    return;
                }
            }
            
            // MCP Protocol Version validation (MCP spec 2025-06-18)
            // Clients MUST include MCP-Protocol-Version header
            // For backwards compatibility, assume 2025-03-26 if not present
            const protocolVersion = req.headers['mcp-protocol-version'] as string;
            const supportedVersions = ['2025-03-26', '2025-06-18'];
            
            if (protocolVersion && !supportedVersions.includes(protocolVersion)) {
                console.warn(`Rejected request with unsupported protocol version: ${protocolVersion}`);
                res.status(400).json({ 
                    error: `Bad Request: Unsupported MCP protocol version '${protocolVersion}'. Supported versions: ${supportedVersions.join(', ')}` 
                });
                return;
            }
            // If no version header present, assume 2025-03-26 for backwards compatibility
            // Per spec: "the server SHOULD assume protocol version 2025-03-26"
            
            next();
        });

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
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                server: 'debugssy-mcp',
                version: '0.1.0',
                transportInitialized: !!this.transport,
                transport: 'streamable-http',
                protocolVersion: '2025-06-18',
                supportedProtocolVersions: ['2025-03-26', '2025-06-18']
            });
        });
    }

    async start(): Promise<void> {
        // Initialize transport before starting HTTP server
        this.transport = new StreamableHTTPServerTransport({
            // Generate cryptographically secure session IDs
            // Must contain only visible ASCII characters (0x21 to 0x7E)
            sessionIdGenerator: () => {
                const timestamp = Date.now().toString(36);
                const randomPart = Math.random().toString(36).substring(2, 15);
                const randomPart2 = Math.random().toString(36).substring(2, 15);
                return `session-${timestamp}-${randomPart}${randomPart2}`;
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
                    await new Promise(r => setTimeout(r, 100));
                    
                    vscode.window.showInformationMessage(
                        `Debugssy MCP Server started on port ${this.port}`
                    );
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
        // Close transport
        if (this.transport) {
            await this.transport.close();
            this.transport = undefined;
        }

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
        await this.start();
    }
}

