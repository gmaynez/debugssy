// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import {
  DEFAULT_THREAD_ID,
  MAX_CONSOLE_BUFFER_SIZE,
  MAX_CONSOLE_ENTRY_LENGTH,
} from '../constants';
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

/**
 * DAP protocol message body types for different events/responses.
 */
interface DAPStoppedEventBody {
  threadId?: number;
  reason?: string;
  description?: string;
  text?: string;
  allThreadsStopped?: boolean;
  hitBreakpointIds?: number[];
}

interface DAPOutputEventBody {
  category?: string;
  output?: string;
  variablesReference?: number;
  source?: { path?: string; name?: string };
  line?: number;
}

interface DAPStackTraceResponseBody {
  stackFrames?: StackFrame[];
  totalFrames?: number;
}

interface DAPContinueResponseBody {
  allThreadsContinued?: boolean;
}

interface DAPContinuedEventBody extends DAPContinueResponseBody {
  threadId?: number;
}

const resumeCommands = new Set([
  'launch',
  'attach',
  'continue',
  'next',
  'stepIn',
  'stepOut',
  'stepBack',
  'reverseContinue',
  'restart',
  'restartFrame',
]);

/**
 * DAP protocol message structure for type-safe message handling.
 * Covers response, event, and request message types.
 */
export interface DAPMessage {
  type: 'response' | 'event' | 'request';
  command?: string;
  event?: string;
  body?:
    | DAPStoppedEventBody
    | DAPOutputEventBody
    | DAPStackTraceResponseBody
    | DAPContinueResponseBody
    | DAPContinuedEventBody;
  arguments?: { threadId?: number; singleThread?: boolean; [key: string]: unknown };
  success?: boolean;
  seq?: number;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- DAP wire format
  request_seq?: number;
  requestSeq?: number;
}

/**
 * DAP stackTrace request arguments.
 */
interface StackTraceRequest {
  threadId: number;
  startFrame?: number;
  levels?: number;
}

/**
 * All DAP-derived state for a single debug session. Tracked per session so
 * concurrent debug sessions never corrupt each other's state.
 */
interface SessionState {
  executionGeneration: number;
  pendingRequests: Map<
    number,
    { command: string; generation: number; threadId?: number; singleThread?: boolean }
  >;
  executionState: ExecutionState;
  stoppedInfo?: StoppedInfo;
  stackFrames: StackFrame[];
  currentFrameId?: number;
  lastKnownThreadId?: number;
  consoleOutput: ConsoleOutput[];
  breakpointHitStats: Map<number, { hitCount: number; lastHitTimestamp: number }>;
}

export class DAPClient {
  private readonly sessionStates = new Map<string, SessionState>();
  private nextExecutionGeneration = 1;
  // Session that most recently produced a DAP event. Used to resolve the
  // "observed" session when VS Code reports no active debug session.
  private lastUpdatedSessionId: string | undefined;
  private stateChangeEmitter = new vscode.EventEmitter<ExecutionState>();
  public readonly onStateChange = this.stateChangeEmitter.event;
  private logger: Logger;
  private trackerDisposable: vscode.Disposable;

  constructor() {
    this.logger = Logger.getInstance();
    // Register debug adapter tracker to intercept DAP messages
    this.trackerDisposable = vscode.debug.registerDebugAdapterTrackerFactory('*', {
      createDebugAdapterTracker: (session: vscode.DebugSession) => {
        return {
          onWillReceiveMessage: (message: DAPMessage) => {
            this.trackDAPRequest(session.id, message);
          },
          onDidSendMessage: (message: DAPMessage) => {
            this.handleDAPMessage(session.id, message);
          },
          onError: (error: Error) => {
            this.logger.error('DAP Error:', error);
          },
          onExit: (_code: number | undefined, _signal: string | undefined) => {
            this.reset(session.id);
          },
        };
      },
    });
  }

  async getStackTrace(
    session: vscode.DebugSession,
    options?: { startFrame?: number; levels?: number; threadId?: number }
  ): Promise<{ stackFrames: StackFrame[]; totalFrames?: number; stale?: boolean }> {
    const state = this.getOrCreateState(session.id);
    const generation = state.executionGeneration;
    try {
      const preferredThreadId =
        options?.threadId ??
        state.stoppedInfo?.threadId ??
        state.lastKnownThreadId ??
        DEFAULT_THREAD_ID;

      const request: StackTraceRequest = {
        threadId: preferredThreadId,
        startFrame: options?.startFrame,
        levels: options?.levels,
      };

      const response = await session.customRequest('stackTrace', request);
      this.assertRequestCurrent(session.id, state, generation, 'Stack trace');
      if (!Array.isArray(response?.stackFrames)) {
        throw new Error('Debug adapter returned an invalid stackTrace response');
      }
      state.stackFrames = response.stackFrames;
      state.currentFrameId = response.stackFrames[0]?.id;
      state.lastKnownThreadId = preferredThreadId;
      const limitedFrames = this.constrainStackFrames(response.stackFrames, options);
      return {
        stackFrames: limitedFrames,
        totalFrames: response.totalFrames,
      };
    } catch (error: unknown) {
      this.logger.error('Error getting stack trace:', error);
      if (
        this.sessionStates.get(session.id) === state &&
        state.executionGeneration === generation &&
        state.stackFrames.length > 0
      ) {
        return { stackFrames: this.getCachedStackFrames(state, options), stale: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get stack trace: ${message}`, { cause: error });
    }
  }

  async getScopes(session: vscode.DebugSession, frameId: number): Promise<Scope[]> {
    const state = this.getOrCreateState(session.id);
    const generation = state.executionGeneration;
    try {
      const response = await session.customRequest('scopes', { frameId });
      this.assertRequestCurrent(session.id, state, generation, 'Scopes');
      if (!Array.isArray(response?.scopes)) {
        throw new Error('Debug adapter returned an invalid scopes response');
      }
      return response.scopes;
    } catch (error: unknown) {
      this.logger.error('Error getting scopes:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get scopes: ${message}`, { cause: error });
    }
  }

  async getVariables(
    session: vscode.DebugSession,
    variablesReference: number
  ): Promise<Variable[]> {
    const state = this.getOrCreateState(session.id);
    const generation = state.executionGeneration;
    try {
      const response = await session.customRequest('variables', {
        variablesReference,
      });
      this.assertRequestCurrent(session.id, state, generation, 'Variables');
      if (!Array.isArray(response?.variables)) {
        throw new Error('Debug adapter returned an invalid variables response');
      }
      return response.variables;
    } catch (error: unknown) {
      this.logger.error('Error getting variables:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get variables: ${message}`, { cause: error });
    }
  }

  async evaluateExpression(
    session: vscode.DebugSession,
    expression: string,
    frameId?: number
  ): Promise<{ result: string; type?: string; variablesReference?: number }> {
    try {
      const response = await session.customRequest('evaluate', {
        expression,
        frameId: frameId ?? this.sessionStates.get(session.id)?.currentFrameId,
        context: 'watch',
      });
      return {
        result: response.result,
        type: response.type,
        variablesReference: response.variablesReference,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to evaluate expression: ${errorMessage}`, { cause: error });
    }
  }

  getCurrentFrameId(session?: vscode.DebugSession): number | undefined {
    return this.getObservedState(session)?.currentFrameId;
  }

  getExecutionState(session?: vscode.DebugSession): ExecutionState {
    return this.getObservedState(session)?.executionState ?? 'not_started';
  }

  /** Returns the generation used to reject results from an earlier stop/run. */
  getExecutionGeneration(session: vscode.DebugSession): number {
    return this.getOrCreateState(session.id).executionGeneration;
  }

  getStoppedInfo(session?: vscode.DebugSession): StoppedInfo | undefined {
    return this.getObservedState(session)?.stoppedInfo;
  }

  /** Protocol breakpoint IDs are adapter-assigned and only unique per session. */
  getBreakpointHitStats(
    session: vscode.DebugSession,
    breakpointId: number
  ): { hitCount: number; lastHitTimestamp?: number } | undefined {
    const stats = this.sessionStates.get(session.id)?.breakpointHitStats.get(breakpointId);
    return stats ? { ...stats } : undefined;
  }

  isReadyForEvaluation(session?: vscode.DebugSession): boolean {
    const state = this.getObservedState(session);
    return state?.executionState === 'paused' && state.stoppedInfo !== undefined;
  }

  getConsoleOutput(options?: {
    category?: string;
    limit?: number;
    since?: number;
    clear?: boolean;
  }): ConsoleOutput[] {
    return this.getConsoleOutputSnapshot(options).entries;
  }

  /**
   * Returns console output merged across all sessions, ordered by timestamp.
   * Per-session buffers ensure one session's termination never discards
   * another session's output history.
   */
  getConsoleOutputSnapshot(options?: {
    category?: string;
    limit?: number;
    since?: number;
    clear?: boolean;
  }): { entries: ConsoleOutput[]; totalCount: number } {
    let output: ConsoleOutput[] = [];
    for (const state of this.sessionStates.values()) {
      output = output.concat(state.consoleOutput);
    }
    output.sort((a, b) => a.timestamp - b.timestamp);

    // Filter by category if specified
    if (options?.category) {
      output = output.filter((o) => o.category === options.category);
    }

    // Filter by timestamp if specified
    if (options?.since !== undefined) {
      const sinceTimestamp = options.since;
      output = output.filter((o) => o.timestamp >= sinceTimestamp);
    }

    const totalCount = output.length;

    // Limit results if specified
    if (options?.limit && options.limit > 0) {
      output = output.slice(-options.limit); // Get last N entries
    }

    // Clear buffer if requested
    if (options?.clear) {
      this.clearConsoleOutput();
    }

    return { entries: output, totalCount };
  }

  clearConsoleOutput(): void {
    for (const state of this.sessionStates.values()) {
      state.consoleOutput = [];
    }
  }

  /**
   * Resets tracked state. When a session ID is given, only that session's
   * state is discarded; otherwise all state is cleared. Notifies state-change
   * listeners when the reset affects the currently observed session so
   * waiters (e.g. waitForBreakpoint) don't hang until timeout.
   */
  reset(sessionId?: string): void {
    if (sessionId) {
      const observedId = this.getObservedSessionId();
      this.sessionStates.delete(sessionId);
      if (this.lastUpdatedSessionId === sessionId) {
        this.lastUpdatedSessionId = undefined;
      }
      if (observedId === sessionId) {
        this.stateChangeEmitter.fire(this.getExecutionState());
      }
      return;
    }

    this.sessionStates.clear();
    this.lastUpdatedSessionId = undefined;
    this.stateChangeEmitter.fire('not_started');
  }

  dispose(): void {
    this.trackerDisposable.dispose();
    this.stateChangeEmitter.dispose();
  }

  private assertRequestCurrent(
    sessionId: string,
    state: SessionState,
    generation: number,
    operation: string
  ): void {
    if (this.sessionStates.get(sessionId) !== state || state.executionGeneration !== generation) {
      throw new Error(`${operation} result is stale because execution state changed`);
    }
  }

  private getOrCreateState(sessionId: string): SessionState {
    let state = this.sessionStates.get(sessionId);
    if (!state) {
      state = {
        executionGeneration: this.nextExecutionGeneration++,
        pendingRequests: new Map(),
        executionState: 'not_started',
        stackFrames: [],
        consoleOutput: [],
        breakpointHitStats: new Map(),
      };
      this.sessionStates.set(sessionId, state);
    }
    return state;
  }

  /**
   * Resolves the session whose state is currently observed by tools:
   * the explicit session if given, else VS Code's active session, else the
   * most recently updated session, else the only remaining session.
   */
  private getObservedSessionId(session?: vscode.DebugSession): string | undefined {
    const sessionId = session?.id ?? vscode.debug.activeDebugSession?.id;
    if (sessionId) {
      return sessionId;
    }
    if (this.lastUpdatedSessionId) {
      return this.lastUpdatedSessionId;
    }
    if (this.sessionStates.size === 1) {
      return this.sessionStates.keys().next().value;
    }
    return undefined;
  }

  private getObservedState(session?: vscode.DebugSession): SessionState | undefined {
    const sessionId = this.getObservedSessionId(session);
    return sessionId ? this.sessionStates.get(sessionId) : undefined;
  }

  /**
   * Fires a state-change event if the session that produced it is the one
   * currently observed (the active session, or the implicit observed session
   * when there is no active session).
   */
  private emitStateChange(sessionId: string, state: ExecutionState): void {
    this.lastUpdatedSessionId = sessionId;
    const activeId = vscode.debug.activeDebugSession?.id;
    if (!activeId || activeId === sessionId) {
      this.stateChangeEmitter.fire(state);
    }
  }

  private constrainStackFrames(
    frames: StackFrame[],
    options?: { startFrame?: number; levels?: number }
  ): StackFrame[] {
    if (!frames.length) {
      return [];
    }
    let constrained = frames;
    if (options?.levels !== undefined) {
      constrained = constrained.slice(0, options.levels);
    }
    return constrained;
  }

  private getCachedStackFrames(
    state: SessionState,
    options?: { startFrame?: number; levels?: number }
  ): StackFrame[] {
    if (!state.stackFrames.length) {
      return [];
    }
    const startFrame = options?.startFrame ?? 0;
    const windowed = state.stackFrames.slice(startFrame);
    return this.constrainStackFrames(windowed, options);
  }

  private trackDAPRequest(sessionId: string, message: DAPMessage): void {
    if (
      message.type !== 'request' ||
      message.seq === undefined ||
      !message.command ||
      (!resumeCommands.has(message.command) && message.command !== 'stackTrace')
    ) {
      return;
    }
    const state = this.getOrCreateState(sessionId);
    state.pendingRequests.set(message.seq, {
      command: message.command,
      generation: state.executionGeneration,
      threadId: message.arguments?.threadId,
      singleThread: message.arguments?.singleThread,
    });
  }

  private markRunning(sessionId: string, state: SessionState): void {
    state.executionGeneration = this.nextExecutionGeneration++;
    state.executionState = 'running';
    state.stoppedInfo = undefined;
    state.stackFrames = [];
    state.currentFrameId = undefined;
    this.emitStateChange(sessionId, 'running');
  }

  private handleDAPMessage(sessionId: string, message: DAPMessage): void {
    if (message.type === 'response') {
      const state = this.sessionStates.get(sessionId);
      const requestSeq = message.request_seq ?? message.requestSeq;
      const pending = requestSeq === undefined ? undefined : state?.pendingRequests.get(requestSeq);
      if (requestSeq !== undefined) {
        state?.pendingRequests.delete(requestSeq);
      }
      if (
        requestSeq !== undefined &&
        !pending &&
        (message.command === 'stackTrace' || resumeCommands.has(message.command ?? ''))
      ) {
        return;
      }
      // A stop/continue/termination event after a request is newer evidence.
      // Late resume or stack responses must not overwrite that state.
      if (
        pending &&
        (pending.command !== message.command || pending.generation !== state?.executionGeneration)
      ) {
        return;
      }
      if (message.success && pending && state && resumeCommands.has(pending.command)) {
        const body = message.body as DAPContinueResponseBody | undefined;
        const singleThread =
          pending.command === 'continue'
            ? body?.allThreadsContinued === false
            : pending.singleThread === true;
        if (
          singleThread &&
          pending.threadId !== undefined &&
          state.stoppedInfo &&
          pending.threadId !== state.stoppedInfo.threadId
        ) {
          state.stoppedInfo.allThreadsStopped = false;
          return;
        }
        if (pending.threadId !== undefined) {
          state.lastKnownThreadId = pending.threadId;
        }
        this.markRunning(sessionId, state);
        return;
      }
      switch (message.command) {
        case 'stackTrace': {
          const body = message.body as DAPStackTraceResponseBody | undefined;
          if (message.success && Array.isArray(body?.stackFrames)) {
            const state = this.getOrCreateState(sessionId);
            state.stackFrames = body.stackFrames;
            state.currentFrameId = state.stackFrames[0]?.id;
            this.lastUpdatedSessionId = sessionId;
          }
          break;
        }
        // Note: We don't cache scopes or variables because request_seq doesn't map
        // to the actual frameId/variablesReference. Instead, we fetch them on-demand
        // via getScopes() and getVariables() methods.
      }
    } else if (message.type === 'event') {
      switch (message.event) {
        case 'stopped': {
          const body = message.body as DAPStoppedEventBody | undefined;
          const state = this.getOrCreateState(sessionId);
          state.executionGeneration = this.nextExecutionGeneration++;
          state.executionState = 'paused';
          // Frames from a previous stop are stale; drop them so evaluations
          // never target dead frame IDs.
          state.stackFrames = [];
          state.currentFrameId = undefined;
          const hitBreakpointIds = body?.hitBreakpointIds;
          if (hitBreakpointIds?.length) {
            const timestamp = Date.now();
            for (const breakpointId of hitBreakpointIds) {
              const previous = state.breakpointHitStats.get(breakpointId);
              state.breakpointHitStats.set(breakpointId, {
                hitCount: (previous?.hitCount ?? 0) + 1,
                lastHitTimestamp: timestamp,
              });
            }
          }
          state.stoppedInfo = {
            threadId: body?.threadId ?? DEFAULT_THREAD_ID,
            reason: body?.reason ?? 'unknown',
            description: body?.description,
            text: body?.text,
            allThreadsStopped: body?.allThreadsStopped,
            hitBreakpointIds,
          };
          if (typeof body?.threadId === 'number') {
            state.lastKnownThreadId = body.threadId;
          }
          this.emitStateChange(sessionId, 'paused');
          break;
        }
        case 'continued': {
          const state = this.getOrCreateState(sessionId);
          const body = message.body as DAPContinuedEventBody | undefined;
          if (
            body?.allThreadsContinued === false &&
            body.threadId !== undefined &&
            state.stoppedInfo &&
            body.threadId !== state.stoppedInfo.threadId
          ) {
            state.stoppedInfo.allThreadsStopped = false;
            break;
          }
          this.markRunning(sessionId, state);
          break;
        }
        case 'terminated': {
          const state = this.getOrCreateState(sessionId);
          state.executionGeneration = this.nextExecutionGeneration++;
          state.executionState = 'terminated';
          state.stoppedInfo = undefined;
          state.stackFrames = [];
          state.currentFrameId = undefined;
          this.emitStateChange(sessionId, 'terminated');
          break;
        }
        case 'output': {
          const body = message.body as DAPOutputEventBody | undefined;
          if (body?.output) {
            this.captureConsoleOutput(this.getOrCreateState(sessionId), {
              category: body.category ?? 'console',
              output: body.output,
              timestamp: Date.now(),
              variablesReference: body.variablesReference,
              source: body.source,
              line: body.line,
            });
          }
          break;
        }
      }
    }
  }

  private captureConsoleOutput(state: SessionState, output: ConsoleOutput): void {
    if (output.output.length > MAX_CONSOLE_ENTRY_LENGTH) {
      const marker = '\n… [output truncated]';
      output = {
        ...output,
        output: output.output.slice(0, MAX_CONSOLE_ENTRY_LENGTH - marker.length) + marker,
      };
    }
    state.consoleOutput.push(output);

    // Keep buffer size limited
    if (state.consoleOutput.length > MAX_CONSOLE_BUFFER_SIZE) {
      state.consoleOutput.shift(); // Remove oldest entry
    }
  }
}
