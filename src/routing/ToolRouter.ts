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
  InspectBreakpointArgs,
  GetVariablesArgs,
  EvaluateExpressionArgs,
  WaitForBreakpointArgs,
  GetConsoleOutputArgs,
  GetCallStackArgs,
  StartDebuggingArgs,
  Validators,
  ValidatorKey,
} from './types/toolArguments';
import type { ToolSchema, EvaluationResult, ToolResult } from './types/toolResults';
import {
  UnknownToolError,
  InvalidArgumentsError,
  AutomationLevelRestrictedError,
  StepOperationsDisabledError,
} from '../errors';
import { TOOL_NAMES } from './toolNames';

/**
 * Type for tool handler functions.
 *
 * Args are typed as `unknown` because the registry stores handlers with
 * heterogeneous signatures. Type safety is enforced at two levels:
 * 1. Input validation: All args are validated by Zod schemas before reaching handlers
 * 2. Output structure: All handlers return { success, message?, error?, data? } pattern
 *
 * See routing/types/toolArguments.ts for Zod schemas and specific arg types.
 * See individual tool files (Breakpoints.ts, etc.) for result types.
 */
type ToolHandler<Result extends ToolResult = ToolResult> = (
  args: unknown,
  server?: Server
) => Promise<Result>;

interface ExpressionApproval extends EvaluationResult {
  allowForSession?: boolean;
}

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
  async routeToolCall(toolName: string, args: unknown, server?: Server): Promise<ToolResult> {
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

    // Protected handlers validate expressions even without an elicitation server.
    return await handler(validatedArgs, server);
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
   * Wraps a typed tool implementation into a generic handler.
   * The cast is safe because inputs are Zod-validated in routeToolCall
   * before reaching the handler.
   */
  private handler<Args, Result extends ToolResult>(
    fn: (args: Args, server?: Server) => Promise<Result>
  ): ToolHandler<Result> {
    return (args: unknown, server?: Server) => fn(args as Args, server);
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
        this.handler((args: SetBreakpointArgs, server?: Server) =>
          this.handleSetBreakpointWithValidation(args, server)
        ),
      ],
      [
        TOOL_NAMES.removeBreakpoint,
        this.handler((args: RemoveBreakpointArgs) =>
          this.toolRegistry.breakpoints.removeBreakpoint(args)
        ),
      ],
      [
        TOOL_NAMES.listBreakpoints,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.breakpoints.listBreakpoints(args)
        ),
      ],
      [
        TOOL_NAMES.inspectBreakpoint,
        this.handler((args: InspectBreakpointArgs) =>
          this.toolRegistry.breakpoints.inspectBreakpoint(args)
        ),
      ],
      [
        TOOL_NAMES.toggleBreakpoint,
        this.handler((args: ToggleBreakpointArgs, server?: Server) =>
          this.handleToggleBreakpointWithValidation(args, server)
        ),
      ],
      [
        TOOL_NAMES.removeAllBreakpoints,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.breakpoints.removeAllBreakpoints(args)
        ),
      ],

      // Inspection tools
      [
        TOOL_NAMES.getVariables,
        this.handler((args: GetVariablesArgs) => this.toolRegistry.inspection.getVariables(args)),
      ],
      [
        TOOL_NAMES.getCallStack,
        this.handler((args: GetCallStackArgs) => this.toolRegistry.inspection.getCallStack(args)),
      ],
      [
        TOOL_NAMES.evaluateExpression,
        this.handler((args: EvaluateExpressionArgs, server?: Server) =>
          this.handleEvaluateExpressionWithValidation(args, server)
        ),
      ],
      [
        TOOL_NAMES.getThreads,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.inspection.getThreads(args)
        ),
      ],
      [
        TOOL_NAMES.getDebugState,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.inspection.getDebugState(args)
        ),
      ],
      [
        TOOL_NAMES.getConsoleOutput,
        this.handler((args: GetConsoleOutputArgs) =>
          this.toolRegistry.inspection.getConsoleOutput(args)
        ),
      ],
      [
        TOOL_NAMES.clearConsoleOutput,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.inspection.clearConsoleOutput(args)
        ),
      ],

      // Debug control tools (full automation only)
      [
        TOOL_NAMES.startDebugging,
        this.handler((args: StartDebuggingArgs) =>
          this.toolRegistry.debugControl.startDebugging(args)
        ),
      ],
      [
        TOOL_NAMES.stopDebugging,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.debugControl.stopDebugging(args)
        ),
      ],
      [
        TOOL_NAMES.continueExecution,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.debugControl.continueExecution(args)
        ),
      ],
      [
        TOOL_NAMES.pause,
        this.handler((args: Record<string, unknown>) => this.toolRegistry.debugControl.pause(args)),
      ],
      [
        TOOL_NAMES.restart,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.debugControl.restart(args)
        ),
      ],
      [
        TOOL_NAMES.waitForBreakpoint,
        this.handler((args: WaitForBreakpointArgs) => {
          const automationLevel = this.configManager.getConfig().automationLevel;
          return this.toolRegistry.inspection.waitForBreakpoint({
            timeout: args?.timeout,
            automationLevel,
          });
        }),
      ],

      // Step operations (opt-in)
      [
        TOOL_NAMES.stepOver,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.debugControl.stepOver(args)
        ),
      ],
      [
        TOOL_NAMES.stepInto,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.debugControl.stepInto(args)
        ),
      ],
      [
        TOOL_NAMES.stepOut,
        this.handler((args: Record<string, unknown>) =>
          this.toolRegistry.debugControl.stepOut(args)
        ),
      ],
    ]);
  }

  /**
   * Handles evaluate_expression with security validation and elicitation.
   * If the expression fails validation, requests user approval via MCP elicitation.
   */
  private async handleEvaluateExpressionWithValidation(
    args: EvaluateExpressionArgs,
    server?: Server
  ): Promise<EvaluationResult> {
    const session = vscode.debug.activeDebugSession;
    let terminated = false;
    const terminationListener = session
      ? vscode.debug.onDidTerminateDebugSession((endedSession) => {
          if (endedSession.id === session.id) {
            terminated = true;
          }
        })
      : undefined;

    try {
      const approval = await this.approveExpression(args.expression, server, session);
      if (!approval.success) {
        return approval;
      }

      // Never apply approval (or an allowlist entry) to a different debuggee.
      if (terminated || vscode.debug.activeDebugSession?.id !== session?.id) {
        return {
          success: false,
          error:
            'Debug session changed or ended while expression approval was pending. Retry in the current session.',
        };
      }
      if (approval.allowForSession) {
        this.expressionValidator.allowExpressionForSession(args.expression, session);
      }

      const result = session
        ? await this.toolRegistry.inspection.evaluateExpression(args, session)
        : await this.toolRegistry.inspection.evaluateExpression(args);
      return approval._warning ? { ...result, _warning: approval._warning } : result;
    } finally {
      terminationListener?.dispose();
    }
  }

  private async handleSetBreakpointWithValidation(
    args: SetBreakpointArgs,
    server?: Server
  ): Promise<ToolResult> {
    const approval = await this.approveBreakpointExpressions(args, server);
    return approval.success ? this.toolRegistry.breakpoints.setBreakpoint(args) : approval;
  }

  private async handleToggleBreakpointWithValidation(
    args: ToggleBreakpointArgs,
    server?: Server
  ): Promise<ToolResult> {
    const filePath = vscode.Uri.file(args.filePath).fsPath;
    const findCurrentBreakpoint = () =>
      vscode.debug.breakpoints.find(
        (breakpoint): breakpoint is vscode.SourceBreakpoint =>
          breakpoint instanceof vscode.SourceBreakpoint &&
          breakpoint.location.uri.fsPath === filePath &&
          breakpoint.location.range.start.line === args.line - 1
      );
    const existing = findCurrentBreakpoint();
    if (existing && !existing.enabled) {
      const approval = await this.approveBreakpointExpressions(
        {
          ...args,
          condition: existing.condition,
          hitCondition: existing.hitCondition,
          logMessage: existing.logMessage,
        },
        server
      );
      if (!approval.success) {
        return approval;
      }
      if (findCurrentBreakpoint() !== existing || existing.enabled) {
        return { success: false, error: 'Breakpoint changed while approval was pending. Retry.' };
      }
    }
    return this.toolRegistry.breakpoints.toggleBreakpoint(args);
  }

  private async approveBreakpointExpressions(
    args: SetBreakpointArgs,
    server?: Server
  ): Promise<ToolResult> {
    // Breakpoints survive debug sessions. Validate without a language-specific
    // exemption or session allowlist, and approve their creation explicitly.
    const fields = [
      ['condition', args.condition],
      ['hitCondition', args.hitCondition],
      ['logMessage', args.logMessage?.includes('{') ? args.logMessage : undefined],
    ] as const;
    for (const [field, expression] of fields) {
      if (expression?.trim()) {
        // Scan the complete log template so nested or adapter-specific
        // interpolation syntax cannot hide expressions from validation.
        const approval = await this.approveExpression(expression, server, undefined, field);
        if (!approval.success) {
          return approval;
        }
      }
    }
    return { success: true };
  }

  private async approveExpression(
    expression: string,
    server?: Server,
    session?: vscode.DebugSession,
    breakpointField?: string
  ): Promise<ExpressionApproval> {
    const validationLevel = this.configManager.getConfig().expressionValidationLevel;

    // Skip validation if disabled in settings
    if (validationLevel === 'disabled') {
      return { success: true };
    }

    const maxLength = this.configManager.getConfig().maxExpressionLength;
    if (expression.length > maxLength) {
      return {
        success: false,
        error: `Expression exceeds maximum allowed length of ${maxLength} characters (current: ${expression.length}).`,
      };
    }

    // Persistent breakpoints retain conservative language-independent danger
    // checks even though they do not belong to one evaluation session.
    const validationResult = breakpointField
      ? this.expressionValidator.validateBreakpointExpression(expression)
      : this.expressionValidator.validateExpression(expression, session);

    // If validation passes, execute immediately
    if (validationResult.allowed) {
      return { success: true };
    }

    // Check if we should elicit based on validation level and risk level
    const shouldElicit = this.expressionValidator.shouldElicit(
      validationResult.riskLevel,
      validationLevel
    );

    // If below threshold, allow without elicitation
    if (!shouldElicit) {
      return { success: true };
    }

    // Validation failed - request user approval via elicitation.
    // Uses an enum choice (MCP spec 2025-11-25) instead of a bare checkbox so
    // the user can also approve the expression for the rest of the session.
    const validationMessage = this.expressionValidator.formatElicitationMessage(
      expression,
      validationResult
    );
    const elicitationMessage = breakpointField
      ? `Breakpoint ${breakpointField}: ${validationMessage}\nApproving creates a persistent breakpoint. Its expressions may execute on every hit, including in future debug sessions, until the breakpoint is removed.`
      : validationMessage;

    let elicitResponse;
    try {
      if (!server) {
        throw new Error('No elicitation server available');
      }
      elicitResponse = await server.elicitInput({
        message: elicitationMessage,
        requestedSchema: {
          type: 'object',
          properties: {
            decision: {
              type: 'string',
              title: 'Decision',
              description: breakpointField
                ? 'Whether to create a breakpoint containing this expression'
                : 'Whether to execute this expression in the debuggee',
              oneOf: [
                {
                  const: 'allow_once',
                  title: breakpointField ? 'Create breakpoint' : 'Allow once',
                },
                ...(!breakpointField && session
                  ? [{ const: 'allow_session', title: 'Always allow for this debug session' }]
                  : []),
                { const: 'deny', title: 'Deny' },
              ],
              default: 'deny',
            },
          },
          required: ['decision'],
        },
      });
    } catch (error: unknown) {
      // Elicitation not supported by client or other error
      // Fall back to blocking the expression with detailed info
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Elicitation failed, blocking expression:', errorMessage);

      return {
        success: false,
        error: `${elicitationMessage}\n\nClient does not support user confirmation (elicitation). To allow this expression, set debugssy.expressionValidationLevel to "disabled" in settings.`,
        validationFailure: {
          reason: validationResult.reason,
          riskLevel: validationResult.riskLevel,
          expression,
        },
      };
    }

    // Handle user response
    if (elicitResponse.action === 'accept') {
      const decision = elicitResponse.content?.decision as string | undefined;

      if (
        decision === 'allow_once' ||
        (decision === 'allow_session' && session && !breakpointField)
      ) {
        return {
          success: true,
          allowForSession: decision === 'allow_session',
          _warning: breakpointField
            ? 'Breakpoint expression approved for persistent use despite validation failure'
            : decision === 'allow_session'
              ? 'Expression executed and approved for the rest of this debug session despite validation failure'
              : 'Expression executed with user approval despite validation failure',
        };
      }

      // User explicitly chose "Deny" (or sent an unexpected value - fail closed)
      return {
        success: false,
        error: `Expression validation failed: ${validationResult.reason}. User declined to proceed.`,
      };
    }

    if (elicitResponse.action === 'decline') {
      return {
        success: false,
        error: `Expression validation failed: ${validationResult.reason}. User declined to proceed.`,
      };
    }

    // User cancelled or other action
    return {
      success: false,
      error: `Expression evaluation cancelled by user.`,
    };
  }
}
