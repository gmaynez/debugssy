import { ToolRegistry } from '../tools';
import { ConfigManager } from '../config';

// Tool argument interfaces
interface SetBreakpointArgs {
    filePath: string;
    line: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
}

interface RemoveBreakpointArgs {
    filePath: string;
    line: number;
}

interface ToggleBreakpointArgs {
    filePath: string;
    line: number;
}

interface GetVariablesArgs {
    scope?: string;
    frameId?: number;
}

interface EvaluateExpressionArgs {
    expression: string;
    frameId?: number;
}

interface WaitForBreakpointArgs {
    timeout?: number;
}

/**
 * Handles tool registration and routing for the MCP server.
 * Provides tool schemas and executes tool calls.
 */
export class ToolRouter {
    constructor(
        private toolRegistry: ToolRegistry,
        private configManager: ConfigManager
    ) {}

    /**
     * Returns the list of available tools based on automation level.
     */
    getToolSchemas(): any[] {
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
                description: 'Continue execution until the next breakpoint. This is the recommended way to navigate between inspection points.',
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
        
        // Step operations (opt-in via allowStepOperations setting)
        const stepOperations = [
            {
                name: 'step_over',
                description: 'Step over the current line. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'step_into',
                description: 'Step into the current function. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            },
            {
                name: 'step_out',
                description: 'Step out of the current function. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            }
        ];
        
        // Conditionally add step operations if enabled
        const allowStepOperations = this.configManager.getConfig().allowStepOperations;
        if (allowStepOperations) {
            fullAutomationTools.push(...stepOperations);
        }
        
        // Return tools based on automation level
        return automationLevel === 'full' 
            ? [...commonTools, ...fullAutomationTools]
            : commonTools;
    }

    /**
     * Routes a tool call to the appropriate handler and returns the result.
     */
    async routeToolCall(toolName: string, args: any): Promise<any> {
        switch (toolName) {
            // Debug Control
            case 'start_debugging':
                return await this.toolRegistry.debugControl.startDebugging(args || {});
            case 'stop_debugging':
                return await this.toolRegistry.debugControl.stopDebugging();
            case 'continue':
                return await this.toolRegistry.debugControl.continueExecution();
            case 'step_over':
                return await this.toolRegistry.debugControl.stepOver();
            case 'step_into':
                return await this.toolRegistry.debugControl.stepInto();
            case 'step_out':
                return await this.toolRegistry.debugControl.stepOut();
            case 'pause':
                return await this.toolRegistry.debugControl.pause();
            case 'restart':
                return await this.toolRegistry.debugControl.restart();

            // Breakpoints
            case 'set_breakpoint':
                return await this.toolRegistry.breakpoints.setBreakpoint(
                    args as unknown as SetBreakpointArgs
                );
            case 'remove_breakpoint':
                return await this.toolRegistry.breakpoints.removeBreakpoint(
                    args as unknown as RemoveBreakpointArgs
                );
            case 'list_breakpoints':
                return await this.toolRegistry.breakpoints.listBreakpoints();
            case 'toggle_breakpoint':
                return await this.toolRegistry.breakpoints.toggleBreakpoint(
                    args as unknown as ToggleBreakpointArgs
                );
            case 'remove_all_breakpoints':
                return await this.toolRegistry.breakpoints.removeAllBreakpoints();

            // Inspection
            case 'get_variables':
                return await this.toolRegistry.inspection.getVariables(
                    args as unknown as GetVariablesArgs
                );
            case 'get_call_stack':
                return await this.toolRegistry.inspection.getCallStack();
            case 'evaluate_expression':
                return await this.toolRegistry.inspection.evaluateExpression(
                    args as unknown as EvaluateExpressionArgs
                );
            case 'get_threads':
                return await this.toolRegistry.inspection.getThreads();
            case 'get_debug_state':
                return await this.toolRegistry.inspection.getDebugState();
            case 'wait_for_breakpoint': {
                const automationLevel = this.configManager.getConfig().automationLevel;
                const waitArgs = args as unknown as WaitForBreakpointArgs;
                return await this.toolRegistry.inspection.waitForBreakpoint({
                    timeout: waitArgs?.timeout,
                    automationLevel
                });
            }

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
}

