// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { DAPClient } from '../dap/Client';
import { ConfigManager } from '../Config';
import {
  DEFAULT_CONSOLE_OUTPUT_LIMIT,
  DEFAULT_MAX_STACK_DEPTH,
  MAX_CONSOLE_OUTPUT_LIMIT,
} from '../constants';

export interface InspectionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Provides tools for inspecting the current debug session state.
 * All methods return InspectionResult with success status and data or error.
 */
export class InspectionTools {
  constructor(
    private dapClient: DAPClient,
    private configManager: ConfigManager
  ) {}

  /**
   * Gets the current debug session state including execution state, location, and stop reason.
   * This is a lightweight operation that should be called first before more verbose tools.
   *
   * @returns InspectionResult containing session state, execution state (running/paused),
   *          current location if paused, and stop reason
   */
  async getDebugState(): Promise<InspectionResult> {
    try {
      const session = vscode.debug.activeDebugSession;
      const executionState = this.dapClient.getExecutionState();
      const stoppedInfo = this.dapClient.getStoppedInfo();

      if (!session) {
        return {
          success: true,
          data: {
            hasActiveSession: false,
            executionState: 'not_started',
          },
        };
      }

      const result: any = {
        hasActiveSession: true,
        sessionName: session.name,
        sessionType: session.type,
        executionState,
      };

      // If paused, include location and reason information
      if (executionState === 'paused' && stoppedInfo) {
        // Try to get current stack frame for location - only need top frame
        const { stackFrames } = await this.dapClient.getStackTrace(session, { levels: 1 });
        const currentFrame = stackFrames.length > 0 ? stackFrames[0] : undefined;

        result.stoppedInfo = {
          reason: stoppedInfo.reason,
          description: stoppedInfo.description,
          threadId: stoppedInfo.threadId,
          allThreadsStopped: stoppedInfo.allThreadsStopped,
        };

        if (currentFrame) {
          result.currentLocation = {
            file: currentFrame.source?.path || currentFrame.source?.name,
            line: currentFrame.line,
            column: currentFrame.column,
            functionName: currentFrame.name,
          };
        }

        if (stoppedInfo.hitBreakpointIds && stoppedInfo.hitBreakpointIds.length > 0) {
          result.stoppedInfo.hitBreakpointIds = stoppedInfo.hitBreakpointIds;
        }
      }

      return {
        success: true,
        data: result,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Waits for execution to pause at a breakpoint (full automation mode only).
   * Uses subscribe-then-query pattern to avoid race conditions.
   *
   * @param args - Object containing optional timeout and required automationLevel
   * @param args.timeout - Maximum time to wait in milliseconds (defaults to config setting)
   * @param args.automationLevel - Must be 'full' for this operation
   * @returns InspectionResult with debug state when paused, or error if timeout/not full automation
   */
  async waitForBreakpoint(args: {
    timeout?: number;
    automationLevel: 'assisted' | 'full';
  }): Promise<InspectionResult> {
    try {
      // Check automation level
      if (args.automationLevel !== 'full') {
        return {
          success: false,
          error: 'wait_for_breakpoint is only available in full automation mode',
        };
      }

      if (!vscode.debug.activeDebugSession) {
        return {
          success: false,
          error: 'No active debug session',
        };
      }

      // Use provided timeout, fallback to config, then default
      const defaultTimeout = this.configManager.getConfig().waitForBreakpointTimeout;
      const timeout = args.timeout || defaultTimeout;

      // CRITICAL: Avoid race condition by setting up listener BEFORE checking state
      // This ensures we don't miss events that occur between check and setup
      let disposable: vscode.Disposable | undefined;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let stateCheckPromise: Promise<InspectionResult>;

      try {
        // Set up event listener first
        const eventPromise = new Promise<InspectionResult>((resolve) => {
          disposable = this.dapClient.onStateChange((state) => {
            if (state === 'paused') {
              // Get the current state info
              this.getDebugState().then(resolve);
            }
          });
        });

        // Now check current state - if already paused, resolve immediately
        // If state changed after listener setup, the event will still fire
        const currentState = this.dapClient.getExecutionState();
        if (currentState === 'paused') {
          // Already paused - return immediately without waiting for events
          stateCheckPromise = this.getDebugState();
        } else {
          // Not paused - wait for event
          stateCheckPromise = eventPromise;
        }

        // Race between state check/event and timeout
        // Store timeout handle to clear it if breakpoint arrives first
        const result = await Promise.race([
          stateCheckPromise,
          new Promise<InspectionResult>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`Timeout waiting for breakpoint after ${timeout}ms`)),
              timeout
            );
          }),
        ]);

        return result;
      } finally {
        // Always clean up the disposable and timeout, whether we succeeded or timed out
        if (disposable) {
          disposable.dispose();
        }
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Gets variables from the current or specified stack frame.
   * Can be filtered by scope (e.g., "Local", "Global") to reduce verbosity.
   *
   * @param args - Object containing optional scope filter and frame ID
   * @param args.scope - Scope prefix to filter (e.g., "Local" matches "Local: functionName")
   * @param args.frameId - Stack frame ID (defaults to current frame)
   * @returns InspectionResult with variables grouped by scope
   */
  async getVariables(args: { scope?: string; frameId?: number }): Promise<InspectionResult> {
    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: false,
          error: 'No active debug session',
        };
      }

      // Get stack trace first - only need top frame if frameId not specified
      const { stackFrames } = await this.dapClient.getStackTrace(session, { levels: 1 });
      if (stackFrames.length === 0 || !stackFrames[0]) {
        return {
          success: false,
          error: 'No stack frames available',
        };
      }

      const frameId = args.frameId !== undefined ? args.frameId : stackFrames[0].id;

      // Get scopes for the frame
      const scopes = await this.dapClient.getScopes(session, frameId);

      const result: any = {
        frameId,
        scopes: [],
      };

      // Get variables for each scope
      for (const scope of scopes) {
        // Filter by scope if specified - use startsWith to match "Local: functionName" with "Local"
        if (args.scope && !scope.name.toLowerCase().startsWith(args.scope.toLowerCase())) {
          continue;
        }

        const variables = await this.dapClient.getVariables(session, scope.variablesReference);
        result.scopes.push({
          name: scope.name,
          variables: variables.map((v) => ({
            name: v.name,
            value: v.value,
            type: v.type,
          })),
        });
      }

      return {
        success: true,
        data: result,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Gets the current call stack with optional depth limit.
   * Use maxDepth to prevent overly verbose output with deep stacks.
   *
   * @param args - Optional object containing maxDepth
   * @param args.maxDepth - Maximum number of frames to return (default: 20)
   * @returns InspectionResult with stack frames, total count, and truncation flag
   */
  async getCallStack(args?: { maxDepth?: number }): Promise<InspectionResult> {
    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: false,
          error: 'No active debug session',
        };
      }

      // Default to DEFAULT_MAX_STACK_DEPTH frames to reduce verbosity
      const maxDepth = args?.maxDepth ?? DEFAULT_MAX_STACK_DEPTH;
      const requestedLevels = maxDepth + 1; // Fetch one extra frame to detect truncation reliably

      // Fetch only the requested depth from the debug adapter
      const { stackFrames, totalFrames } = await this.dapClient.getStackTrace(session, {
        levels: requestedLevels,
      });

      const limitedFrames = stackFrames.slice(0, maxDepth);
      const truncated =
        totalFrames !== undefined
          ? totalFrames > limitedFrames.length
          : stackFrames.length > limitedFrames.length;
      const reportedTotal =
        totalFrames ?? (truncated ? limitedFrames.length + 1 : limitedFrames.length);

      return {
        success: true,
        data: {
          frames: limitedFrames.map((frame) => ({
            id: frame.id,
            name: frame.name,
            source: frame.source?.path || frame.source?.name || 'unknown',
            line: frame.line,
            column: frame.column,
          })),
          totalFrames: reportedTotal,
          truncated,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Evaluates an expression in the current debug context with security validation.
   * Expressions are validated to prevent side effects. Complex expressions may require user approval.
   *
   * @param args - Object containing expression and optional frame ID
   * @param args.expression - Expression to evaluate (length limited for security)
   * @param args.frameId - Stack frame ID (defaults to current frame)
   * @returns InspectionResult with expression result, type, and value
   */
  async evaluateExpression(args: {
    expression: string;
    frameId?: number;
  }): Promise<InspectionResult> {
    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: false,
          error: 'No active debug session',
        };
      }

      // Security: Validate expression length to prevent prompt injection attacks
      const maxLength = this.configManager.getConfig().maxExpressionLength;
      if (args.expression.length > maxLength) {
        return {
          success: false,
          error: `Expression exceeds maximum allowed length of ${maxLength} characters (current: ${args.expression.length}). Adjust debugssy.maxExpressionLength setting if needed (range: 20-400).`,
        };
      }

      const result = await this.dapClient.evaluateExpression(
        session,
        args.expression,
        args.frameId
      );

      return {
        success: true,
        data: {
          expression: args.expression,
          result: result.result,
          type: result.type,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Gets watch expressions (not currently supported by VS Code API).
   * Returns an error indicating limitation and suggesting alternative.
   *
   * @returns InspectionResult with error indicating limitation
   */
  async getWatches(): Promise<InspectionResult> {
    // VS Code doesn't expose watch expressions via API directly
    // We would need to track them separately or access internal state
    // For now, return a message indicating this limitation
    return {
      success: false,
      error:
        'Watch expressions are not directly accessible via VS Code API. Use evaluate_expression instead.',
    };
  }

  /**
   * Gets all threads in the current debug session.
   *
   * @returns InspectionResult with array of thread information
   */
  async getThreads(): Promise<InspectionResult> {
    try {
      const session = vscode.debug.activeDebugSession;
      if (!session) {
        return {
          success: false,
          error: 'No active debug session',
        };
      }

      const response = await session.customRequest('threads');

      return {
        success: true,
        data: {
          threads: response.threads || [],
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Gets output from the debug console with optional filtering and limits.
   * WARNING: Can be very verbose. Always specify a limit and consider category filtering.
   *
   * @param args - Optional filtering and limiting options
   * @param args.category - Filter by category: 'console', 'stdout', 'stderr', 'telemetry'
   * @param args.limit - Maximum entries to return (default: 50, max: 1000)
   * @param args.since - Unix timestamp to filter entries after this time
   * @param args.clear - If true, clears buffer after reading
   * @returns InspectionResult with console entries, count, and truncation flag
   */
  async getConsoleOutput(args?: {
    category?: string;
    limit?: number;
    since?: number;
    clear?: boolean;
  }): Promise<InspectionResult> {
    try {
      // Default to DEFAULT_CONSOLE_OUTPUT_LIMIT entries to reduce verbosity
      const limit = args?.limit ?? DEFAULT_CONSOLE_OUTPUT_LIMIT;

      const output = this.dapClient.getConsoleOutput({
        category: args?.category,
        limit: limit,
        since: args?.since,
        clear: args?.clear,
      });

      return {
        success: true,
        data: {
          entries: output.map((entry) => ({
            category: entry.category,
            output: entry.output,
            timestamp: entry.timestamp,
            source: entry.source?.path || entry.source?.name,
            line: entry.line,
          })),
          count: output.length,
          truncated: limit < MAX_CONSOLE_OUTPUT_LIMIT, // Indicate if there might be more
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Clears the console output buffer.
   *
   * @returns InspectionResult with success message
   */
  async clearConsoleOutput(): Promise<InspectionResult> {
    try {
      this.dapClient.clearConsoleOutput();
      return {
        success: true,
        data: {
          message: 'Console output buffer cleared',
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
