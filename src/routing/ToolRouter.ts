// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

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
import type { ToolSchema, EvaluationResult } from './types/toolResults';
import {
  UnknownToolError,
  InvalidArgumentsError,
  ExpressionUserDeclinedError,
  AutomationLevelRestrictedError,
  StepOperationsDisabledError,
} from '../errors';
import { TOOL_NAMES } from './toolNames';

/**
 * Type for tool handler functions.
 *
 * Note: Uses 'any' for args and result for compatibility with diverse handler signatures.
 * Type safety is enforced at two levels:
 * 1. Input validation: All args are validated by Zod schemas before reaching handlers
 * 2. Output structure: All handlers return { success, message?, error?, ...data } pattern
 *
 * See routing/types/toolArguments.ts for Zod schemas and specific arg types.
 * See individual tool files (Breakpoints.ts, etc.) for result types.
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
  getToolSchemas(): ToolSchema[] {
    const automationLevel = this.configManager.getConfig().automationLevel;
    const allowStepOperations = this.configManager.getConfig().allowStepOperations;

    // Tools available in all modes (inspection and breakpoints)
    const commonTools: ToolSchema[] = [...breakpointSchemas, ...inspectionSchemas];

    // Tools only available in full automation mode
    const fullAutomationTools: ToolSchema[] = [...debugControlSchemas];

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
  async routeToolCall(toolName: string, args: unknown, server?: Server): Promise<any> {
    const handler = this.toolHandlers.get(toolName);

    if (!handler) {
      throw new UnknownToolError(toolName, Array.from(this.toolHandlers.keys()));
    }

    this.ensureToolEnabled(toolName);

    // Validate input against Zod schema if available (type-safe lookup)
    let validatedArgs = args;
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

        throw new InvalidArgumentsError(toolName, issues);
      }

      validatedArgs = parsed.data;
    }

    // Special handling for evaluate_expression with security validation
    if (toolName === TOOL_NAMES.evaluateExpression && server) {
      return await this.handleEvaluateExpressionWithValidation(
        validatedArgs as EvaluateExpressionArgs,
        server
      );
    }

    return await handler(validatedArgs);
  }

  private ensureToolEnabled(toolName: string): void {
    const { automationLevel, allowStepOperations } = this.configManager.getConfig();
    const fullAutomationTools = new Set<string>(debugControlSchemas.map((schema) => schema.name));
    const stepOperationTools = new Set<string>(stepOperationSchemas.map((schema) => schema.name));

    if (
      (fullAutomationTools.has(toolName) || stepOperationTools.has(toolName)) &&
      automationLevel !== 'full'
    ) {
      throw new AutomationLevelRestrictedError(toolName, automationLevel, 'full');
    }

    if (stepOperationTools.has(toolName) && !allowStepOperations) {
      throw new StepOperationsDisabledError(toolName);
    }
  }

  /**
   * Initializes the tool handler registry with all available tool handlers.
   * Uses a Map-based approach for O(1) lookup and better maintainability.
   */
  private initializeToolHandlers(): Map<string, ToolHandler> {
    return new Map<string, ToolHandler>([
      // Breakpoint tools
      [
        TOOL_NAMES.setBreakpoint,
        (args: SetBreakpointArgs) => this.toolRegistry.breakpoints.setBreakpoint(args),
      ],
      [
        TOOL_NAMES.removeBreakpoint,
        (args: RemoveBreakpointArgs) => this.toolRegistry.breakpoints.removeBreakpoint(args),
      ],
      [TOOL_NAMES.listBreakpoints, () => this.toolRegistry.breakpoints.listBreakpoints()],
      [
        TOOL_NAMES.toggleBreakpoint,
        (args: ToggleBreakpointArgs) => this.toolRegistry.breakpoints.toggleBreakpoint(args),
      ],
      [TOOL_NAMES.removeAllBreakpoints, () => this.toolRegistry.breakpoints.removeAllBreakpoints()],

      // Inspection tools
      [
        TOOL_NAMES.getVariables,
        (args: GetVariablesArgs) => this.toolRegistry.inspection.getVariables(args),
      ],
      [
        TOOL_NAMES.getCallStack,
        (args: GetCallStackArgs) => this.toolRegistry.inspection.getCallStack(args),
      ],
      [
        TOOL_NAMES.evaluateExpression,
        (args: EvaluateExpressionArgs) => this.toolRegistry.inspection.evaluateExpression(args),
      ],
      [TOOL_NAMES.getThreads, () => this.toolRegistry.inspection.getThreads()],
      [TOOL_NAMES.getDebugState, () => this.toolRegistry.inspection.getDebugState()],
      [
        TOOL_NAMES.getConsoleOutput,
        (args: GetConsoleOutputArgs) => this.toolRegistry.inspection.getConsoleOutput(args),
      ],
      [TOOL_NAMES.clearConsoleOutput, () => this.toolRegistry.inspection.clearConsoleOutput()],

      // Debug control tools (full automation only)
      [
        TOOL_NAMES.startDebugging,
        (args: StartDebuggingArgs) => this.toolRegistry.debugControl.startDebugging(args),
      ],
      [TOOL_NAMES.stopDebugging, () => this.toolRegistry.debugControl.stopDebugging()],
      [TOOL_NAMES.continueExecution, () => this.toolRegistry.debugControl.continueExecution()],
      [TOOL_NAMES.pause, () => this.toolRegistry.debugControl.pause()],
      [TOOL_NAMES.restart, () => this.toolRegistry.debugControl.restart()],
      [
        TOOL_NAMES.waitForBreakpoint,
        (args: WaitForBreakpointArgs) => {
          const automationLevel = this.configManager.getConfig().automationLevel;
          return this.toolRegistry.inspection.waitForBreakpoint({
            timeout: args?.timeout,
            automationLevel,
          });
        },
      ],

      // Step operations (opt-in)
      [TOOL_NAMES.stepOver, () => this.toolRegistry.debugControl.stepOver()],
      [TOOL_NAMES.stepInto, () => this.toolRegistry.debugControl.stepInto()],
      [TOOL_NAMES.stepOut, () => this.toolRegistry.debugControl.stepOut()],
    ]);
  }

  /**
   * Handles evaluate_expression with security validation and elicitation.
   * If the expression fails validation, requests user approval via MCP elicitation.
   */
  private async handleEvaluateExpressionWithValidation(
    args: EvaluateExpressionArgs,
    server: Server
  ): Promise<EvaluationResult> {
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
        // User declined
        throw new ExpressionUserDeclinedError(args.expression, validationResult.reason);
      } else {
        // User cancelled or other action
        return {
          success: false,
          error: `Expression evaluation cancelled by user.`,
        };
      }
    } catch (error: unknown) {
      // Re-throw our custom errors
      if (error instanceof ExpressionUserDeclinedError) {
        return {
          success: false,
          error: `Expression validation failed: ${validationResult.reason}. User declined to proceed.`,
        };
      }

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
        error: `${elicitationMessage}\n\nClient does not support user confirmation (elicitation). To allow this expression, set debugssy.expressionValidationLevel to "disabled" in settings.`,
        validationFailure: {
          reason: validationResult.reason,
          riskLevel: validationResult.riskLevel,
          expression: args.expression,
        },
      };
    }
  }
}
