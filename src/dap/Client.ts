// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { DEFAULT_THREAD_ID, MAX_CONSOLE_BUFFER_SIZE } from '../constants';
import { Logger } from '../utils/Logger';

export interface StackFrame {
  id: number;
  name: string;
  source?: {
    path?: string;
    name?: string;
  };
  line: number;
  column: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
}

export interface Scope {
  name: string;
  variablesReference: number;
  expensive: boolean;
}

export type ExecutionState = 'not_started' | 'running' | 'paused' | 'terminated';

export interface StoppedInfo {
  threadId: number;
  reason: string;
  description?: string;
  text?: string;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
}

export interface ConsoleOutput {
  category: 'console' | 'stdout' | 'stderr' | 'telemetry' | string;
  output: string;
  timestamp: number;
  variablesReference?: number;
  source?: {
    path?: string;
    name?: string;
  };
  line?: number;
}

export class DAPClient {
  private currentFrameId: number | undefined;
  private stackFrames: StackFrame[] = [];
  private executionState: ExecutionState = 'not_started';
  private stoppedInfo: StoppedInfo | undefined;
  private consoleOutputBuffer: ConsoleOutput[] = [];
  private stateChangeEmitter = new vscode.EventEmitter<ExecutionState>();
  public readonly onStateChange = this.stateChangeEmitter.event;
  private logger: Logger;
  private trackerDisposable: vscode.Disposable;

  constructor() {
    this.logger = Logger.getInstance();
    // Register debug adapter tracker to intercept DAP messages
    this.trackerDisposable = vscode.debug.registerDebugAdapterTrackerFactory('*', {
      createDebugAdapterTracker: (_session: vscode.DebugSession) => {
        return {
          onWillReceiveMessage: (_message: any) => {
            // Can inspect outgoing messages if needed
          },
          onDidSendMessage: (message: any) => {
            this.handleDAPMessage(message);
          },
          onError: (error: Error) => {
            this.logger.error('DAP Error:', error);
          },
          onExit: (_code: number | undefined, _signal: string | undefined) => {
            this.reset();
          },
        };
      },
    });
  }

  async getStackTrace(session: vscode.DebugSession): Promise<StackFrame[]> {
    try {
      const response = await session.customRequest('stackTrace', {
        threadId: DEFAULT_THREAD_ID,
      });
      if (response?.stackFrames) {
        this.stackFrames = response.stackFrames;
        return this.stackFrames;
      }
    } catch (error: unknown) {
      this.logger.error('Error getting stack trace:', error);
    }
    return this.stackFrames;
  }

  async getScopes(session: vscode.DebugSession, frameId: number): Promise<Scope[]> {
    try {
      const response = await session.customRequest('scopes', { frameId });
      if (response?.scopes) {
        return response.scopes;
      }
    } catch (error: unknown) {
      this.logger.error('Error getting scopes:', error);
    }
    return [];
  }

  async getVariables(
    session: vscode.DebugSession,
    variablesReference: number
  ): Promise<Variable[]> {
    try {
      const response = await session.customRequest('variables', {
        variablesReference,
      });
      if (response?.variables) {
        return response.variables;
      }
    } catch (error: unknown) {
      this.logger.error('Error getting variables:', error);
    }
    return [];
  }

  async evaluateExpression(
    session: vscode.DebugSession,
    expression: string,
    frameId?: number
  ): Promise<{ result: string; type?: string; variablesReference?: number }> {
    try {
      const response = await session.customRequest('evaluate', {
        expression,
        frameId: frameId || this.currentFrameId,
        context: 'watch',
      });
      return {
        result: response.result,
        type: response.type,
        variablesReference: response.variablesReference,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to evaluate expression: ${errorMessage}`);
    }
  }

  getCurrentFrameId(): number | undefined {
    return this.currentFrameId;
  }

  getExecutionState(): ExecutionState {
    return this.executionState;
  }

  getStoppedInfo(): StoppedInfo | undefined {
    return this.stoppedInfo;
  }

  isReadyForEvaluation(): boolean {
    return this.executionState === 'paused' && this.stoppedInfo !== undefined;
  }

  getConsoleOutput(options?: {
    category?: string;
    limit?: number;
    since?: number;
    clear?: boolean;
  }): ConsoleOutput[] {
    let output = [...this.consoleOutputBuffer];

    // Filter by category if specified
    if (options?.category) {
      output = output.filter((o) => o.category === options.category);
    }

    // Filter by timestamp if specified
    if (options?.since !== undefined) {
      const sinceTimestamp = options.since;
      output = output.filter((o) => o.timestamp >= sinceTimestamp);
    }

    // Limit results if specified
    if (options?.limit && options.limit > 0) {
      output = output.slice(-options.limit); // Get last N entries
    }

    // Clear buffer if requested
    if (options?.clear) {
      this.consoleOutputBuffer = [];
    }

    return output;
  }

  clearConsoleOutput(): void {
    this.consoleOutputBuffer = [];
  }

  reset(): void {
    this.currentFrameId = undefined;
    this.stackFrames = [];
    this.executionState = 'not_started';
    this.stoppedInfo = undefined;
    this.consoleOutputBuffer = [];
  }

  dispose(): void {
    this.trackerDisposable.dispose();
    this.stateChangeEmitter.dispose();
  }

  private handleDAPMessage(message: any): void {
    if (message.type === 'response') {
      switch (message.command) {
        case 'stackTrace':
          if (message.success && message.body?.stackFrames) {
            this.stackFrames = message.body.stackFrames;
            if (this.stackFrames.length > 0 && this.stackFrames[0]) {
              this.currentFrameId = this.stackFrames[0].id;
            }
          }
          break;
        // Note: We don't cache scopes or variables because request_seq doesn't map
        // to the actual frameId/variablesReference. Instead, we fetch them on-demand
        // via getScopes() and getVariables() methods.
      }
    } else if (message.type === 'event') {
      switch (message.event) {
        case 'stopped':
          this.executionState = 'paused';
          this.stoppedInfo = {
            threadId: message.body?.threadId,
            reason: message.body?.reason || 'unknown',
            description: message.body?.description,
            text: message.body?.text,
            allThreadsStopped: message.body?.allThreadsStopped,
            hitBreakpointIds: message.body?.hitBreakpointIds,
          };
          this.stateChangeEmitter.fire('paused');
          break;
        case 'continued':
          this.executionState = 'running';
          this.stoppedInfo = undefined;
          this.stateChangeEmitter.fire('running');
          break;
        case 'terminated':
          this.executionState = 'terminated';
          this.stoppedInfo = undefined;
          this.stateChangeEmitter.fire('terminated');
          break;
        case 'output':
          if (message.body?.output) {
            this.captureConsoleOutput({
              category: message.body.category || 'console',
              output: message.body.output,
              timestamp: Date.now(),
              variablesReference: message.body.variablesReference,
              source: message.body.source,
              line: message.body.line,
            });
          }
          break;
      }
    }
  }

  private captureConsoleOutput(output: ConsoleOutput): void {
    this.consoleOutputBuffer.push(output);

    // Keep buffer size limited
    if (this.consoleOutputBuffer.length > MAX_CONSOLE_BUFFER_SIZE) {
      this.consoleOutputBuffer.shift(); // Remove oldest entry
    }
  }
}
