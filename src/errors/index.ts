// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Custom error types for better error categorization and handling.
 * These errors provide consistent error codes and structured information
 * for programmatic error handling and better debugging.
 */

/**
 * Error codes for programmatic error handling.
 * Each error type has a unique code that can be used for:
 * - Client-side error handling
 * - Logging and monitoring
 * - Error aggregation and analysis
 *
 * Note: Using SCREAMING_CASE is intentional for error codes (industry standard convention).
 */
/* eslint-disable @typescript-eslint/naming-convention */
export enum ErrorCode {
  // Debug session errors (1xx)
  DEBUG_NOT_ACTIVE = 'DEBUG_NOT_ACTIVE',
  DEBUG_SESSION_TERMINATED = 'DEBUG_SESSION_TERMINATED',
  DEBUG_START_FAILED = 'DEBUG_START_FAILED',
  DEBUG_ALREADY_RUNNING = 'DEBUG_ALREADY_RUNNING',

  // Breakpoint errors (2xx)
  BREAKPOINT_NOT_FOUND = 'BREAKPOINT_NOT_FOUND',
  BREAKPOINT_SET_FAILED = 'BREAKPOINT_SET_FAILED',
  BREAKPOINT_INVALID_LOCATION = 'BREAKPOINT_INVALID_LOCATION',

  // Expression validation errors (3xx)
  EXPRESSION_VALIDATION_FAILED = 'EXPRESSION_VALIDATION_FAILED',
  EXPRESSION_TOO_LONG = 'EXPRESSION_TOO_LONG',
  EXPRESSION_BLOCKED = 'EXPRESSION_BLOCKED',
  EXPRESSION_USER_DECLINED = 'EXPRESSION_USER_DECLINED',

  // Tool errors (4xx)
  UNKNOWN_TOOL = 'UNKNOWN_TOOL',
  INVALID_ARGUMENTS = 'INVALID_ARGUMENTS',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',

  // Resource errors (5xx)
  RESOURCE_READ_FAILED = 'RESOURCE_READ_FAILED',

  // Automation level errors (6xx)
  AUTOMATION_LEVEL_RESTRICTED = 'AUTOMATION_LEVEL_RESTRICTED',

  STEP_OPERATIONS_DISABLED = 'STEP_OPERATIONS_DISABLED',

  // DAP errors (7xx)
  DAP_REQUEST_FAILED = 'DAP_REQUEST_FAILED',
  DAP_TIMEOUT = 'DAP_TIMEOUT',
  DAP_NO_STACK_FRAMES = 'DAP_NO_STACK_FRAMES',

  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * Risk levels for expression validation.
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Base error class for all Debugssy errors.
 * Provides consistent error structure with code, message, and optional details.
 */
export abstract class DebugssyError extends Error {
  abstract readonly code: ErrorCode;
  readonly timestamp: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = Date.now();
    this.details = details;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serializes the error for logging or transmission.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      details: this.details,
    };
  }
}

// =============================================================================
// Debug Session Errors
// =============================================================================

/**
 * Error thrown when no active debug session exists.
 */
export class DebugNotActiveError extends DebugssyError {
  readonly code = ErrorCode.DEBUG_NOT_ACTIVE;

  constructor(operation?: string) {
    super(
      operation ? `No active debug session for operation: ${operation}` : 'No active debug session',
      operation ? { operation } : undefined
    );
  }
}

/**
 * Error thrown when debug session has terminated unexpectedly.
 */
export class DebugSessionTerminatedError extends DebugssyError {
  readonly code = ErrorCode.DEBUG_SESSION_TERMINATED;

  constructor(sessionName?: string) {
    super(
      sessionName
        ? `Debug session "${sessionName}" has terminated`
        : 'Debug session has terminated',
      sessionName ? { sessionName } : undefined
    );
  }
}

/**
 * Error thrown when debug session fails to start.
 */
export class DebugStartFailedError extends DebugssyError {
  readonly code = ErrorCode.DEBUG_START_FAILED;

  constructor(reason?: string, configuration?: string) {
    super(reason || 'Failed to start debug session', {
      reason,
      configuration,
    });
  }
}

// =============================================================================
// Breakpoint Errors
// =============================================================================

/**
 * Error thrown when a breakpoint cannot be found.
 */
export class BreakpointNotFoundError extends DebugssyError {
  readonly code = ErrorCode.BREAKPOINT_NOT_FOUND;

  constructor(filePath: string, line: number) {
    super(`No breakpoint found at ${filePath}:${line}`, { filePath, line });
  }
}

/**
 * Error thrown when setting a breakpoint fails.
 */
export class BreakpointSetFailedError extends DebugssyError {
  readonly code = ErrorCode.BREAKPOINT_SET_FAILED;

  constructor(filePath: string, line: number, reason?: string) {
    super(
      reason
        ? `Failed to set breakpoint at ${filePath}:${line}: ${reason}`
        : `Failed to set breakpoint at ${filePath}:${line}`,
      { filePath, line, reason }
    );
  }
}

// =============================================================================
// Expression Validation Errors
// =============================================================================

/**
 * Error thrown when expression validation fails.
 */
export class ExpressionValidationError extends DebugssyError {
  readonly code = ErrorCode.EXPRESSION_VALIDATION_FAILED;
  readonly riskLevel: RiskLevel;
  readonly expression: string;

  constructor(
    expression: string,
    reason: string,
    riskLevel: RiskLevel,
    additionalDetails?: Record<string, unknown>
  ) {
    super(`Expression validation failed: ${reason}`, {
      expression,
      riskLevel,
      reason,
      ...additionalDetails,
    });
    this.riskLevel = riskLevel;
    this.expression = expression;
  }
}

/**
 * Error thrown when expression exceeds maximum length.
 */
export class ExpressionTooLongError extends DebugssyError {
  readonly code = ErrorCode.EXPRESSION_TOO_LONG;

  constructor(expressionLength: number, maxLength: number) {
    super(
      `Expression exceeds maximum allowed length of ${maxLength} characters (current: ${expressionLength})`,
      { expressionLength, maxLength }
    );
  }
}

/**
 * Error thrown when user declines to approve a risky expression.
 */
export class ExpressionUserDeclinedError extends DebugssyError {
  readonly code = ErrorCode.EXPRESSION_USER_DECLINED;

  constructor(expression: string, reason?: string) {
    super(
      reason
        ? `User declined to execute expression: ${reason}`
        : 'User declined to execute expression',
      { expression, reason }
    );
  }
}

// =============================================================================
// Tool Errors
// =============================================================================

/**
 * Error thrown when an unknown tool is requested.
 */
export class UnknownToolError extends DebugssyError {
  readonly code = ErrorCode.UNKNOWN_TOOL;

  constructor(toolName: string, availableTools?: string[]) {
    super(`Unknown tool: ${toolName}`, { toolName, availableTools });
  }
}

/**
 * Error thrown when tool arguments are invalid.
 */
export class InvalidArgumentsError extends DebugssyError {
  readonly code = ErrorCode.INVALID_ARGUMENTS;

  constructor(toolName: string, issues: string) {
    super(`Invalid arguments for tool '${toolName}': ${issues}`, {
      toolName,
      issues,
    });
  }
}

/**
 * Error thrown when tool execution fails.
 */
export class ToolExecutionError extends DebugssyError {
  readonly code = ErrorCode.TOOL_EXECUTION_FAILED;

  constructor(toolName: string, reason: string) {
    super(`Tool '${toolName}' execution failed: ${reason}`, {
      toolName,
      reason,
    });
  }
}

// =============================================================================
// Resource Errors
// =============================================================================

/**
 * Error thrown when a resource cannot be read.
 */
export class ResourceReadError extends DebugssyError {
  readonly code = ErrorCode.RESOURCE_READ_FAILED;

  constructor(resourceUri: string, reason: string) {
    super(`Failed to read resource: ${resourceUri}. ${reason}`, {
      resourceUri,
      reason,
    });
  }
}

// =============================================================================
// Automation Level Errors
// =============================================================================

/**
 * Error thrown when operation is restricted by automation level.
 */
export class AutomationLevelRestrictedError extends DebugssyError {
  readonly code = ErrorCode.AUTOMATION_LEVEL_RESTRICTED;

  constructor(operation: string, currentLevel: 'assisted' | 'full', requiredLevel: 'full') {
    super(
      `Operation '${operation}' requires '${requiredLevel}' automation level, but current level is '${currentLevel}'`,
      { operation, currentLevel, requiredLevel }
    );
  }
}

/**
 * Error thrown when step operations are disabled.
 */
export class StepOperationsDisabledError extends DebugssyError {
  readonly code = ErrorCode.STEP_OPERATIONS_DISABLED;

  constructor(operation: string) {
    super(
      `Step operation '${operation}' is disabled. Enable debugssy.allowStepOperations in settings.`,
      { operation }
    );
  }
}

// =============================================================================
// DAP Errors
// =============================================================================

/**
 * Error thrown when a DAP request fails.
 */
export class DAPRequestFailedError extends DebugssyError {
  readonly code = ErrorCode.DAP_REQUEST_FAILED;

  constructor(request: string, reason: string) {
    super(`DAP request '${request}' failed: ${reason}`, { request, reason });
  }
}

/**
 * Error thrown when waiting for breakpoint times out.
 */
export class DAPTimeoutError extends DebugssyError {
  readonly code = ErrorCode.DAP_TIMEOUT;

  constructor(operation: string, timeoutMs: number) {
    super(`Timeout waiting for ${operation} after ${timeoutMs}ms`, {
      operation,
      timeoutMs,
    });
  }
}

/**
 * Error thrown when no stack frames are available.
 */
export class NoStackFramesError extends DebugssyError {
  readonly code = ErrorCode.DAP_NO_STACK_FRAMES;

  constructor() {
    super('No stack frames available - debugger may not be paused');
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Type guard to check if an error is a DebugssyError.
 */
export function isDebugssyError(error: unknown): error is DebugssyError {
  return error instanceof DebugssyError;
}

/**
 * Converts any error to a standard error message.
 * Preserves DebugssyError structure, handles unknown errors gracefully.
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof DebugssyError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error occurred';
}

/**
 * Extracts error code from any error.
 * Returns UNKNOWN_ERROR for non-DebugssyError errors.
 */
export function getErrorCode(error: unknown): ErrorCode {
  if (error instanceof DebugssyError) {
    return error.code;
  }
  return ErrorCode.UNKNOWN_ERROR;
}
