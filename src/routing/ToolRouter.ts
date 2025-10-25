// SPDX-License-Identifier: Apache-2.0

import { ToolRegistry } from '../tools';
import { ConfigManager } from '../config';
import { breakpointSchemas, inspectionSchemas, debugControlSchemas, stepOperationSchemas } from './schemas';
import {
    SetBreakpointArgs,
    RemoveBreakpointArgs,
    ToggleBreakpointArgs,
    GetVariablesArgs,
    EvaluateExpressionArgs,
    WaitForBreakpointArgs,
    GetConsoleOutputArgs,
    GetCallStackArgs,
    StartDebuggingArgs,
    Validators,
    ValidatorKey
} from './types/toolArguments';

/**
 * Type for tool handler functions
 */
type ToolHandler = (args: any) => Promise<any>;

/**
 * Handles tool registration and routing for the MCP server.
 * Provides tool schemas and executes tool calls using a registry pattern.
 */
export class ToolRouter {
    private toolHandlers: Map<string, ToolHandler>;

    constructor(
        private toolRegistry: ToolRegistry,
        private configManager: ConfigManager
    ) {
        this.toolHandlers = this.initializeToolHandlers();
    }

    /**
     * Initializes the tool handler registry with all available tool handlers.
     * Uses a Map-based approach for O(1) lookup and better maintainability.
     */
    private initializeToolHandlers(): Map<string, ToolHandler> {
        return new Map<string, ToolHandler>([
            // Breakpoint tools
            ['set_breakpoint', (args: SetBreakpointArgs) => 
                this.toolRegistry.breakpoints.setBreakpoint(args)],
            ['remove_breakpoint', (args: RemoveBreakpointArgs) => 
                this.toolRegistry.breakpoints.removeBreakpoint(args)],
            ['list_breakpoints', () => 
                this.toolRegistry.breakpoints.listBreakpoints()],
            ['toggle_breakpoint', (args: ToggleBreakpointArgs) => 
                this.toolRegistry.breakpoints.toggleBreakpoint(args)],
            ['remove_all_breakpoints', () => 
                this.toolRegistry.breakpoints.removeAllBreakpoints()],

            // Inspection tools
            ['get_variables', (args: GetVariablesArgs) => 
                this.toolRegistry.inspection.getVariables(args)],
            ['get_call_stack', (args: GetCallStackArgs) => 
                this.toolRegistry.inspection.getCallStack(args)],
            ['evaluate_expression', (args: EvaluateExpressionArgs) => 
                this.toolRegistry.inspection.evaluateExpression(args)],
            ['get_threads', () => 
                this.toolRegistry.inspection.getThreads()],
            ['get_debug_state', () => 
                this.toolRegistry.inspection.getDebugState()],
            ['get_console_output', (args: GetConsoleOutputArgs) => 
                this.toolRegistry.inspection.getConsoleOutput(args)],
            ['clear_console_output', () => 
                this.toolRegistry.inspection.clearConsoleOutput()],

            // Debug control tools (full automation only)
            ['start_debugging', (args: StartDebuggingArgs) => 
                this.toolRegistry.debugControl.startDebugging(args)],
            ['stop_debugging', () => 
                this.toolRegistry.debugControl.stopDebugging()],
            ['continue', () => 
                this.toolRegistry.debugControl.continueExecution()],
            ['pause', () => 
                this.toolRegistry.debugControl.pause()],
            ['restart', () => 
                this.toolRegistry.debugControl.restart()],
            ['wait_for_breakpoint', (args: WaitForBreakpointArgs) => {
                const automationLevel = this.configManager.getConfig().automationLevel;
                return this.toolRegistry.inspection.waitForBreakpoint({
                    timeout: args?.timeout,
                    automationLevel
                });
            }],

            // Step operations (opt-in)
            ['step_over', () => 
                this.toolRegistry.debugControl.stepOver()],
            ['step_into', () => 
                this.toolRegistry.debugControl.stepInto()],
            ['step_out', () => 
                this.toolRegistry.debugControl.stepOut()]
        ]);
    }

    /**
     * Returns the list of available tools based on automation level.
     * Schemas are now organized in separate modules for better maintainability.
     */
    getToolSchemas(): any[] {
        const automationLevel = this.configManager.getConfig().automationLevel;
        const allowStepOperations = this.configManager.getConfig().allowStepOperations;
        
        // Tools available in all modes (inspection and breakpoints)
        const commonTools = [
            ...breakpointSchemas,
            ...inspectionSchemas
        ];
        
        // Tools only available in full automation mode
        const fullAutomationTools = [
            ...debugControlSchemas
        ];
        
        // Conditionally add step operations if enabled
        if (allowStepOperations) {
            fullAutomationTools.push(...stepOperationSchemas);
        }
        
        // Return tools based on automation level
        return automationLevel === 'full' 
            ? [...commonTools, ...fullAutomationTools]
            : commonTools;
    }

    /**
     * Routes a tool call to the appropriate handler and returns the result.
     * Uses Map-based lookup for O(1) performance and better maintainability.
     * Validates arguments using Zod schemas per MCP security best practices.
     */
    async routeToolCall(toolName: string, args: any): Promise<any> {
        const handler = this.toolHandlers.get(toolName);
        
        if (!handler) {
            throw new Error(`Unknown tool: ${toolName}`);
        }
        
        // Validate input against Zod schema if available (type-safe lookup)
        if (toolName in Validators) {
            const validator = Validators[toolName as ValidatorKey];
            const parsed = validator.safeParse(args || {});
            
            if (!parsed.success) {
                // Format validation errors for MCP clients
                const issues = parsed.error.issues.map(issue => {
                    const path = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : '';
                    return `${issue.message}${path}`;
                }).join('; ');
                
                throw new Error(`Invalid arguments for tool '${toolName}': ${issues}`);
            }
            
            args = parsed.data;
        }
        
        return await handler(args);
    }
}

