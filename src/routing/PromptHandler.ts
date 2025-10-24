import { ConfigManager } from '../config';

interface PromptArguments {
    [key: string]: string | undefined;
}

/**
 * Handles prompt registration and generation for the MCP server.
 * Provides prompt schemas and generates prompt content based on user input.
 */
export class PromptHandler {
    constructor(private configManager: ConfigManager) {}

    /**
     * Returns the list of available prompts based on automation level.
     */
    getPromptSchemas(): any[] {
        const automationLevel = this.configManager.getConfig().automationLevel;
        
        const commonPrompts = [
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
            }
        ];

        const fullAutomationPrompts = [
            {
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
            }
        ];

        return automationLevel === 'full' 
            ? [...commonPrompts, ...fullAutomationPrompts]
            : commonPrompts;
    }

    /**
     * Generates prompt content based on the prompt name and arguments.
     */
    generatePrompt(promptName: string, args: PromptArguments = {}): any {
        const automationLevel = this.configManager.getConfig().automationLevel;

        switch (promptName) {
            case 'debug-crash':
                return this.generateDebugCrashPrompt(args, automationLevel);
            
            case 'trace-variable':
                return this.generateTraceVariablePrompt(args, automationLevel);
            
            case 'inspect-function':
                return this.generateInspectFunctionPrompt(args, automationLevel);
            
            case 'debug-loop':
                return this.generateDebugLoopPrompt(args, automationLevel);
            
            case 'auto-debug-session':
                if (automationLevel !== 'full') {
                    throw new Error('auto-debug-session prompt requires full automation mode');
                }
                return this.generateAutoDebugSessionPrompt(args);
            
            default:
                throw new Error(`Unknown prompt: ${promptName}`);
        }
    }

    private generateDebugCrashPrompt(args: PromptArguments, automationLevel: string): any {
        const errorMsg = args.errorMessage || 'unknown error';
        const filePath = args.filePath ? ` in ${args.filePath}` : '';
        
        const debugStartHint = automationLevel === 'assisted' 
            ? 'Ask me to start debugging and reproduce the error'
            : 'Check MCP resources for launch.json, then use start_debugging with the appropriate configuration';
        
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `I need help debugging a crash/exception${filePath}. Error: "${errorMsg}"\n\nPlease help me:\n1. Set a breakpoint where the error occurs\n2. ${debugStartHint}\n3. Use get_call_stack (with maxDepth if deep) to see the execution path\n4. Examine variables at the point of failure with get_variables (scope: "Local" to reduce verbosity)\n5. Check console output with get_console_output if relevant\n6. Help me understand what's causing the error`
                    }
                }
            ]
        };
    }

    private generateTraceVariablePrompt(args: PromptArguments, automationLevel: string): any {
        const varName = args.variableName || 'variable';
        const expected = args.expectedValue ? ` (expected: ${args.expectedValue})` : '';
        const actual = args.actualValue ? ` but is actually ${args.actualValue}` : '';
        
        const executionHint = automationLevel === 'assisted' 
            ? 'Guide me through stepping and inspecting'
            : 'Step through execution automatically, checking launch.json resource for debug configuration if needed';
        
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `I need to trace the variable "${varName}"${expected}${actual}.\n\nPlease help me:\n1. Set breakpoints at key points where this variable is assigned or modified\n2. ${executionHint}\n3. Use get_variables (scope: "Local") and evaluate_expression (simple expressions) to track its value\n4. Identify where the value becomes incorrect\n5. Explain what's causing the wrong value`
                    }
                }
            ]
        };
    }

    private generateInspectFunctionPrompt(args: PromptArguments, automationLevel: string): any {
        const funcName = args.functionName || 'function';
        const filePath = args.filePath || 'the file';
        const issue = args.issue ? `\nIssue: ${args.issue}` : '';
        
        const debugStartHint = automationLevel === 'assisted' 
            ? 'Ask me to trigger the function'
            : 'Check MCP resources for launch.json, start debugging, and wait for the breakpoint';
        
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `I need to inspect the function "${funcName}" in ${filePath}.${issue}\n\nPlease help me:\n1. Set a breakpoint at the function entry point\n2. ${debugStartHint}\n3. Use get_variables (scope: "Local") to inspect input parameters\n4. Step through the function with ${automationLevel === 'assisted' ? 'guidance on when to step' : 'step_over/step_into'}\n5. Evaluate expressions to verify intermediate calculations (keep them simple)\n6. Inspect the return value\n7. Explain the function's behavior`
                    }
                }
            ]
        };
    }

    private generateDebugLoopPrompt(args: PromptArguments, automationLevel: string): any {
        const location = args.loopLocation || 'the loop';
        const expected = args.expectedIterations ? ` It should run ${args.expectedIterations} times.` : '';
        
        const debugStartHint = automationLevel === 'assisted' 
            ? 'Ask me to start debugging'
            : 'Check MCP resources for launch.json, then start debugging';
        
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `I have a loop issue at ${location}.${expected}\n\nPlease help me:\n1. Set a conditional breakpoint inside the loop (e.g., condition: "i > 100" to catch excessive iterations)\n2. ${debugStartHint}\n3. When the breakpoint hits, use get_variables (scope: "Local") to inspect loop variables\n4. Use evaluate_expression (keep it simple) to check loop conditions\n5. Check the call stack with get_call_stack (maxDepth: 10) to see how we got here\n6. Explain why the loop isn't behaving as expected`
                    }
                }
            ]
        };
    }

    private generateAutoDebugSessionPrompt(args: PromptArguments): any {
        const issue = args.issue || 'unknown issue';
        const entryPoint = args.entryPoint ? ` starting from ${args.entryPoint}` : '';
        
        return {
            messages: [
                {
                    role: 'user',
                    content: {
                        type: 'text',
                        text: `I need help debugging: "${issue}"${entryPoint}\n\nPlease run a full automated debugging session:\n1. FIRST: List MCP resources to find available launch.json files\n2. Read the launch.json resource (debugssy:///{workspaceName}/launch.json) to see available debug configurations\n3. Set strategic breakpoints at likely problem areas\n4. Use start_debugging with the appropriate configuration name from launch.json\n5. Use wait_for_breakpoint to pause at each breakpoint, then get_debug_state to verify location\n6. At each stop, inspect variables (use scope filter "Local" to reduce verbosity) and evaluate expressions\n7. Use continue to proceed to the next breakpoint\n8. Systematically narrow down the root cause\n9. Explain your findings and suggest a fix\n10. Call stop_debugging when done`
                    }
                }
            ]
        };
    }
}

