import * as vscode from 'vscode';
import express from 'express';
import { Server as HTTPServer } from 'http';
import { randomUUID } from 'crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry } from './tools';
import { ConfigManager } from './config';

export class MCPServer {
    private app: express.Application;
    private httpServer: HTTPServer | undefined;
    private mcpServer!: Server; // Initialized in initializeMCPServer(), called from constructor
    private transport: StreamableHTTPServerTransport | undefined;
    private currentAutomationLevel: 'assisted' | 'full';

    constructor(
        private port: number,
        private toolRegistry: ToolRegistry,
        private configManager: ConfigManager
    ) {
        this.currentAutomationLevel = configManager.getConfig().automationLevel;
        this.app = express();
        // Note: Do NOT use express.json() middleware as it consumes the request stream
        // StreamableHTTPServerTransport needs to read the raw stream

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
                    prompts: {}
                }
            }
        );

        this.setupToolHandlers();
        this.setupPromptHandlers();
    }

    private setupToolHandlers(): void {
        // List available tools - dynamically filtered based on automation mode
        this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
            const automationLevel = this.configManager.getConfig().automationLevel;
            
            // Tools available in all modes (inspection, breakpoints, and stop as safety feature)
            const commonTools = [
                // Stop debugging - available in all modes as a safety escape hatch
                {
                    name: 'stop_debugging',
                    description: 'Stop the current debugging session',
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
                // Start/wait tools
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
                },
                // Execution control tools (not exposed in assisted mode - user controls via VS Code UI)
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

    private setupPromptHandlers(): void {
        // List available prompts
        this.mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
            const automationLevel = this.configManager.getConfig().automationLevel;
            
            return {
                prompts: [
                    {
                        name: 'debug-crash',
                        description: 'Debug a crash or exception by setting breakpoints and inspecting the call stack',
                        arguments: [
                            {
                                name: 'errorMessage',
                                description: 'The error message or description of the crash',
                                required: true
                            },
                            {
                                name: 'filePath',
                                description: 'File where the error occurs (if known)',
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'trace-variable',
                        description: 'Trace a variable\'s value through execution to find where it becomes incorrect',
                        arguments: [
                            {
                                name: 'variableName',
                                description: 'Name of the variable to trace',
                                required: true
                            },
                            {
                                name: 'expectedValue',
                                description: 'What the variable value should be',
                                required: false
                            },
                            {
                                name: 'actualValue',
                                description: 'What the variable value actually is (if known)',
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'inspect-function',
                        description: 'Inspect a function\'s behavior by setting breakpoints and examining inputs/outputs',
                        arguments: [
                            {
                                name: 'functionName',
                                description: 'Name of the function to inspect',
                                required: true
                            },
                            {
                                name: 'filePath',
                                description: 'File containing the function',
                                required: true
                            },
                            {
                                name: 'issue',
                                description: 'Description of the issue with the function',
                                required: false
                            }
                        ]
                    },
                    {
                        name: 'debug-loop',
                        description: 'Debug an infinite loop or unexpected loop behavior using conditional breakpoints',
                        arguments: [
                            {
                                name: 'loopLocation',
                                description: 'Description of where the loop is (file and approximate line)',
                                required: true
                            },
                            {
                                name: 'expectedIterations',
                                description: 'How many times the loop should run',
                                required: false
                            }
                        ]
                    },
                    ...(automationLevel === 'full' ? [{
                        name: 'auto-debug-session',
                        description: 'Automatically start a full debugging session with breakpoints and inspection (full automation mode only)',
                        arguments: [
                            {
                                name: 'issue',
                                description: 'Description of the bug or issue to debug',
                                required: true
                            },
                            {
                                name: 'entryPoint',
                                description: 'Main file or function to start debugging from',
                                required: false
                            }
                        ]
                    }] : [])
                ]
            };
        });

        // Get a specific prompt
        this.mcpServer.setRequestHandler(GetPromptRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            const automationLevel = this.configManager.getConfig().automationLevel;

            switch (name) {
                case 'debug-crash': {
                    const errorMsg = args?.errorMessage || 'unknown error';
                    const filePath = args?.filePath ? ` in ${args.filePath}` : '';
                    
                    return {
                        messages: [
                            {
                                role: 'user',
                                content: {
                                    type: 'text',
                                    text: `I need help debugging a crash/exception${filePath}. Error: "${errorMsg}"\n\nPlease help me:\n1. Set a breakpoint where the error occurs\n2. ${automationLevel === 'assisted' ? 'Ask me to start debugging and reproduce the error' : 'Start debugging and wait for the error'}\n3. Inspect the call stack with get_call_stack\n4. Examine variables at the point of failure with get_variables\n5. Help me understand what's causing the error`
                                }
                            }
                        ]
                    };
                }

                case 'trace-variable': {
                    const varName = args?.variableName || 'variable';
                    const expected = args?.expectedValue ? ` (expected: ${args.expectedValue})` : '';
                    const actual = args?.actualValue ? ` but is actually ${args.actualValue}` : '';
                    
                    return {
                        messages: [
                            {
                                role: 'user',
                                content: {
                                    type: 'text',
                                    text: `I need to trace the variable "${varName}"${expected}${actual}.\n\nPlease help me:\n1. Set breakpoints at key points where this variable is assigned or modified\n2. ${automationLevel === 'assisted' ? 'Guide me through stepping and inspecting' : 'Step through execution automatically'}\n3. Use get_variables and evaluate_expression to track its value\n4. Identify where the value becomes incorrect\n5. Explain what's causing the wrong value`
                                }
                            }
                        ]
                    };
                }

                case 'inspect-function': {
                    const funcName = args?.functionName || 'function';
                    const filePath = args?.filePath || 'the file';
                    const issue = args?.issue ? `\nIssue: ${args.issue}` : '';
                    
                    return {
                        messages: [
                            {
                                role: 'user',
                                content: {
                                    type: 'text',
                                    text: `I need to inspect the function "${funcName}" in ${filePath}.${issue}\n\nPlease help me:\n1. Set a breakpoint at the function entry point\n2. ${automationLevel === 'assisted' ? 'Ask me to trigger the function' : 'Start debugging and wait for the breakpoint'}\n3. Use get_variables to inspect input parameters\n4. Step through the function with ${automationLevel === 'assisted' ? 'guidance on when to step' : 'step_over/step_into'}\n5. Evaluate expressions to verify intermediate calculations\n6. Inspect the return value\n7. Explain the function's behavior`
                                }
                            }
                        ]
                    };
                }

                case 'debug-loop': {
                    const location = args?.loopLocation || 'the loop';
                    const expected = args?.expectedIterations ? ` It should run ${args.expectedIterations} times.` : '';
                    
                    return {
                        messages: [
                            {
                                role: 'user',
                                content: {
                                    type: 'text',
                                    text: `I have a loop issue at ${location}.${expected}\n\nPlease help me:\n1. Set a conditional breakpoint inside the loop (e.g., condition: "i > 100" to catch excessive iterations)\n2. ${automationLevel === 'assisted' ? 'Ask me to start debugging' : 'Start debugging'}\n3. When the breakpoint hits, use get_variables to inspect loop variables\n4. Use evaluate_expression to check loop conditions\n5. Check the call stack with get_call_stack to see how we got here\n6. Explain why the loop isn't behaving as expected`
                                }
                            }
                        ]
                    };
                }

                case 'auto-debug-session': {
                    if (automationLevel !== 'full') {
                        throw new Error('auto-debug-session prompt requires full automation mode');
                    }
                    
                    const issue = args?.issue || 'unknown issue';
                    const entryPoint = args?.entryPoint ? ` starting from ${args.entryPoint}` : '';
                    
                    return {
                        messages: [
                            {
                                role: 'user',
                                content: {
                                    type: 'text',
                                    text: `I need help debugging: "${issue}"${entryPoint}\n\nPlease run a full automated debugging session:\n1. Set strategic breakpoints at likely problem areas\n2. Use start_debugging to launch the program\n3. Use wait_for_breakpoint to pause at each breakpoint\n4. At each stop, inspect variables and evaluate expressions\n5. Use continue to proceed to the next breakpoint\n6. Systematically narrow down the root cause\n7. Explain your findings and suggest a fix\n8. Call stop_debugging when done`
                                }
                            }
                        ]
                    };
                }

                default:
                    throw new Error(`Unknown prompt: ${name}`);
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
                    await new Promise(r => setTimeout(r, 100));
                    
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
        this.currentAutomationLevel = newLevel;
        
        // Restart the server with a fresh MCP Server instance to ensure clean state
        // This prevents "Server not initialized" errors from stale connections
        await this.stop();
        this.initializeMCPServer(); // Recreate MCP Server instance with fresh state
        await this.start({ silent: true }); // Silent mode - caller will show consolidated notification
    }
}

