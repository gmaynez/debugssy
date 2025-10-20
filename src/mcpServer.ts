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
    private transports: Map<string, StreamableHTTPServerTransport> = new Map();

    constructor(
        private port: number,
        private toolRegistry: ToolRegistry,
        private configManager: ConfigManager
    ) {
        this.app = express();
        this.app.use(express.json());

        this.mcpServer = new Server(
            {
                name: 'debugsy',
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
        // List available tools
        this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    // Debug Control Tools
                    {
                        name: 'start_debugging',
                        description: 'Start a debugging session with the specified configuration',
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
                        name: 'stop_debugging',
                        description: 'Stop the current debugging session',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'continue',
                        description: 'Continue execution in the current debug session',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'step_over',
                        description: 'Step over the current line',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'step_into',
                        description: 'Step into the current function',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'step_out',
                        description: 'Step out of the current function',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'pause',
                        description: 'Pause execution in the current debug session',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'restart',
                        description: 'Restart the current debug session',
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
                    },
                    {
                        name: 'wait_for_breakpoint',
                        description: 'Wait for execution to pause at a breakpoint (full automation mode only). Blocks until next breakpoint is hit or timeout occurs.',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                timeout: {
                                    type: 'number',
                                    description: 'Timeout in milliseconds (default: 10000)'
                                }
                            }
                        }
                    }
                ]
            };
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
        // Main MCP endpoint
        this.app.all('/mcp', async (req, res) => {
            try {
                const sessionId = (req.query.sessionId as string) || this.generateSessionId();
                
                let transport = this.transports.get(sessionId);
                
                if (!transport) {
                    transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => sessionId
                    });
                    
                    this.transports.set(sessionId, transport);
                    
                    // Handle transport close
                    res.on('close', () => {
                        this.transports.delete(sessionId);
                    });
                    
                    // Connect the MCP server to this transport
                    await this.mcpServer.connect(transport);
                }
                
                // Handle the HTTP request
                await transport.handleRequest(req, res);
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
                server: 'debugsy-mcp',
                version: '0.1.0',
                activeSessions: this.transports.size
            });
        });
    }

    private generateSessionId(): string {
        return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.httpServer = this.app.listen(this.port, 'localhost', () => {
                    console.log(`MCP Server listening on http://localhost:${this.port}/mcp`);
                    vscode.window.showInformationMessage(
                        `Debugsy MCP Server started on port ${this.port}`
                    );
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
        // Close all transports
        for (const transport of this.transports.values()) {
            await transport.close();
        }
        this.transports.clear();

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

