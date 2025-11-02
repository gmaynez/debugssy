// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ToolRegistry } from '../tools';
import { ConfigManager } from '../Config';
import { ExpressionValidator } from '../security/ExpressionValidator';
import {
  breakpointSchemas,
  inspectionSchemas,
  debugControlSchemas,
  stepOperationSchemas,
} from './schemas';
import { Logger } from '../utils/Logger';
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
  ValidatorKey,
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
  private expressionValidator: ExpressionValidator;
  private logger: Logger;

  constructor(
    private toolRegistry: ToolRegistry,
    private configManager: ConfigManager
  ) {
    this.toolHandlers = this.initializeToolHandlers();
    this.expressionValidator = new ExpressionValidator();
    this.logger = Logger.getInstance();
  }

  /**
   * Disposes resources and cleans up the expression validator.
   */
  dispose(): void {
    this.expressionValidator.dispose();
  }

  /**
   * Returns the list of available tools based on automation level.
   * Schemas are now organized in separate modules for better maintainability.
   */
  getToolSchemas(): any[] {
    const automationLevel = this.configManager.getConfig().automationLevel;
    const allowStepOperations = this.configManager.getConfig().allowStepOperations;

    // Tools available in all modes (inspection and breakpoints)
    const commonTools = [...breakpointSchemas, ...inspectionSchemas];

    // Tools only available in full automation mode
    const fullAutomationTools = [...debugControlSchemas];

    // Conditionally add step operations if enabled
    if (allowStepOperations) {
      fullAutomationTools.push(...stepOperationSchemas);
    }

    // Return tools based on automation level
    return automationLevel === 'full' ? [...commonTools, ...fullAutomationTools] : commonTools;
  }

  /**
   * Routes a tool call to the appropriate handler and returns the result.
   * Uses Map-based lookup for O(1) performance and better maintainability.
   * Validates arguments using Zod schemas per MCP security best practices.
   *
   * For evaluate_expression, applies security validation and uses elicitation
   * to request user approval if the expression may have side effects.
   */
  async routeToolCall(toolName: string, args: any, server?: Server): Promise<any> {
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
        const issues = parsed.error.issues
          .map((issue) => {
            const path = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : '';
            return `${issue.message}${path}`;
          })
          .join('; ');

        throw new Error(`Invalid arguments for tool '${toolName}': ${issues}`);
      }

      args = parsed.data;
    }

    // Special handling for evaluate_expression with security validation
    if (toolName === 'evaluate_expression' && server) {
      return await this.handleEvaluateExpressionWithValidation(
        args as EvaluateExpressionArgs,
        server
      );
    }

    return await handler(args);
  }

  /**
   * Initializes the tool handler registry with all available tool handlers.
   * Uses a Map-based approach for O(1) lookup and better maintainability.
   */
  private initializeToolHandlers(): Map<string, ToolHandler> {
    return new Map<string, ToolHandler>([
      // Breakpoint tools
      [
        'set_breakpoint',
        (args: SetBreakpointArgs) => this.toolRegistry.breakpoints.setBreakpoint(args),
      ],
      [
        'remove_breakpoint',
        (args: RemoveBreakpointArgs) => this.toolRegistry.breakpoints.removeBreakpoint(args),
      ],
      ['list_breakpoints', () => this.toolRegistry.breakpoints.listBreakpoints()],
      [
        'toggle_breakpoint',
        (args: ToggleBreakpointArgs) => this.toolRegistry.breakpoints.toggleBreakpoint(args),
      ],
      ['remove_all_breakpoints', () => this.toolRegistry.breakpoints.removeAllBreakpoints()],

      // Inspection tools
      [
        'get_variables',
        (args: GetVariablesArgs) => this.toolRegistry.inspection.getVariables(args),
      ],
      [
        'get_call_stack',
        (args: GetCallStackArgs) => this.toolRegistry.inspection.getCallStack(args),
      ],
      [
        'evaluate_expression',
        (args: EvaluateExpressionArgs) => this.toolRegistry.inspection.evaluateExpression(args),
      ],
      ['get_threads', () => this.toolRegistry.inspection.getThreads()],
      ['get_debug_state', () => this.toolRegistry.inspection.getDebugState()],
      [
        'get_console_output',
        (args: GetConsoleOutputArgs) => this.toolRegistry.inspection.getConsoleOutput(args),
      ],
      ['clear_console_output', () => this.toolRegistry.inspection.clearConsoleOutput()],

      // Debug control tools (full automation only)
      [
        'start_debugging',
        (args: StartDebuggingArgs) => this.toolRegistry.debugControl.startDebugging(args),
      ],
      ['stop_debugging', () => this.toolRegistry.debugControl.stopDebugging()],
      ['continue', () => this.toolRegistry.debugControl.continueExecution()],
      ['pause', () => this.toolRegistry.debugControl.pause()],
      ['restart', () => this.toolRegistry.debugControl.restart()],
      [
        'wait_for_breakpoint',
        (args: WaitForBreakpointArgs) => {
          const automationLevel = this.configManager.getConfig().automationLevel;
          return this.toolRegistry.inspection.waitForBreakpoint({
            timeout: args?.timeout,
            automationLevel,
          });
        },
      ],

      // Step operations (opt-in)
      ['step_over', () => this.toolRegistry.debugControl.stepOver()],
      ['step_into', () => this.toolRegistry.debugControl.stepInto()],
      ['step_out', () => this.toolRegistry.debugControl.stepOut()],
    ]);
  }

  /**
   * Handles evaluate_expression with security validation and elicitation.
   * If the expression fails validation, requests user approval via MCP elicitation.
   */
  private async handleEvaluateExpressionWithValidation(
    args: EvaluateExpressionArgs,
    server: Server
  ): Promise<any> {
    const session = vscode.debug.activeDebugSession;
    const validationLevel = this.configManager.getConfig().expressionValidationLevel;

    // Skip validation if disabled in settings
    if (validationLevel === 'disabled') {
      return await this.toolRegistry.inspection.evaluateExpression(args);
    }

    // Validate the expression
    const validationResult = this.expressionValidator.validateExpression(args.expression, session);

    // If validation passes, execute immediately
    if (validationResult.allowed) {
      return await this.toolRegistry.inspection.evaluateExpression(args);
    }

    // Check if we should elicit based on validation level and risk level
    const shouldElicit = this.expressionValidator.shouldElicit(
      validationResult.riskLevel,
      validationLevel
    );

    // If below threshold, allow without elicitation
    if (!shouldElicit) {
      return await this.toolRegistry.inspection.evaluateExpression(args);
    }

    // Validation failed - request user approval via elicitation
    // Use server.elicitInput() as shown in SDK examples
    try {
      const elicitationMessage = this.expressionValidator.formatElicitationMessage(
        args.expression,
        validationResult
      );

      // Send elicitation request to client using the SDK's elicitInput helper
      const elicitResponse = await server.elicitInput({
        message: elicitationMessage,
        requestedSchema: {
          type: 'object',
          properties: {
            understood: {
              type: 'boolean',
              title: 'I understand the risks',
              description: 'Check this box to confirm you understand the risks and want to proceed',
            },
          },
          required: ['understood'],
        },
      });

      // Handle user response
      if (elicitResponse.action === 'accept' && elicitResponse.content?.understood) {
        // User approved - execute the expression
        const result = await this.toolRegistry.inspection.evaluateExpression(args);

        // Add a warning to the result
        return {
          ...result,
          _warning: 'Expression executed with user approval despite validation failure',
        };
      } else if (elicitResponse.action === 'decline') {
        // User declined - return error
        return {
          success: false,
          error: `Expression validation failed: ${validationResult.reason}. User declined to proceed.`,
        };
      } else {
        // User cancelled or other action
        return {
          success: false,
          error: `Expression evaluation cancelled by user.`,
        };
      }
    } catch (error: unknown) {
      // Elicitation not supported by client or other error
      // Fall back to blocking the expression with detailed info
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Elicitation failed, blocking expression:', errorMessage);
      const elicitationMessage = this.expressionValidator.formatElicitationMessage(
        args.expression,
        validationResult
      );
      return {
        success: false,
        error: `${elicitationMessage}\n\nClient does not support user confirmation (elicitation). To allow this expression, set debugssy.enableExpressionValidation to false in settings.`,
        validationFailure: {
          reason: validationResult.reason,
          riskLevel: validationResult.riskLevel,
          expression: args.expression,
        },
      };
    }
  }
}
