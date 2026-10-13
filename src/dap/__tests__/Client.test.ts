// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DAPClient } from '../Client';
import { vscode } from '../../__tests__/setup';
import { createMockDebugSession } from '../../__tests__/helpers/vscode-mock';
import { MAX_CONSOLE_BUFFER_SIZE } from '../../constants';

describe('DAPClient', () => {
  let client: DAPClient;
  let mockSession: any;
  let trackerFactory: any;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DAPClient();

    // Get the registered debug adapter tracker factory
    const registerCall = (vscode.debug.registerDebugAdapterTrackerFactory as any).mock.calls[0];
    trackerFactory = registerCall ? registerCall[1] : null;

    mockSession = createMockDebugSession('test', 'node');
  });

  afterEach(() => {
    client.dispose();
  });

  describe('Initialization', () => {
    it('should register debug adapter tracker factory', () => {
      expect(vscode.debug.registerDebugAdapterTrackerFactory).toHaveBeenCalledWith(
        '*',
        expect.any(Object)
      );
    });

    it('should start with not_started execution state', () => {
      expect(client.getExecutionState()).toBe('not_started');
    });

    it('should have empty console output buffer initially', () => {
      expect(client.getConsoleOutput()).toEqual([]);
    });
  });

  describe('State Management', () => {
    it('should transition to paused state on stopped event', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      const stateListener = vi.fn();
      client.onStateChange(stateListener);

      // Simulate stopped event
      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: {
          threadId: 1,
          reason: 'breakpoint',
          description: 'Paused on breakpoint',
          allThreadsStopped: true,
          hitBreakpointIds: [1],
        },
      });

      expect(client.getExecutionState()).toBe('paused');
      expect(stateListener).toHaveBeenCalledWith('paused');

      const stoppedInfo = client.getStoppedInfo();
      expect(stoppedInfo).toEqual({
        threadId: 1,
        reason: 'breakpoint',
        description: 'Paused on breakpoint',
        text: undefined,
        allThreadsStopped: true,
        hitBreakpointIds: [1],
      });
    });

    it('should transition to running state on continued event', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      const stateListener = vi.fn();
      client.onStateChange(stateListener);

      // First pause
      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'pause' },
      });

      // Then continue
      tracker.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: {},
      });

      expect(client.getExecutionState()).toBe('running');
      expect(stateListener).toHaveBeenCalledWith('running');
      expect(client.getStoppedInfo()).toBeUndefined();
    });

    it('should transition to terminated state on terminated event', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      const stateListener = vi.fn();
      client.onStateChange(stateListener);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'terminated',
        body: {},
      });

      expect(client.getExecutionState()).toBe('terminated');
      expect(stateListener).toHaveBeenCalledWith('terminated');
    });

    it('should report ready for evaluation when paused', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      expect(client.isReadyForEvaluation()).toBe(false);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });

      expect(client.isReadyForEvaluation()).toBe(true);
    });

    it('should not be ready for evaluation when running', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });

      tracker.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: {},
      });

      expect(client.isReadyForEvaluation()).toBe(false);
    });
  });

  describe('Execution-control response tracking', () => {
    const pausedWithFrames = (tracker: any) => {
      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: { stackFrames: [{ id: 42, name: 'main', line: 1, column: 1 }] },
      });
    };

    it.each([
      'continue',
      'next',
      'stepIn',
      'stepOut',
      'stepBack',
      'reverseContinue',
      'restart',
      'restartFrame',
    ])(
      'should mark execution running after successful %s without a continued event',
      async (command) => {
        const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
        pausedWithFrames(tracker);
        const listener = vi.fn();
        client.onStateChange(listener);
        tracker.onWillReceiveMessage({ type: 'request', seq: 10, command });
        expect(client.getExecutionState()).toBe('paused');
        tracker.onDidSendMessage({ type: 'response', command, request_seq: 10, success: true });
        expect(client.getExecutionState()).toBe('running');
        expect(client.getStoppedInfo()).toBeUndefined();
        expect(client.getCurrentFrameId()).toBeUndefined();
        expect(client.isReadyForEvaluation()).toBe(false);
        expect(listener).toHaveBeenCalledWith('running');
        mockSession.customRequest.mockRejectedValue(new Error('Running'));
        expect((await client.getStackTrace(mockSession)).stackFrames).toEqual([]);
      }
    );

    it.each(['launch', 'attach'])(
      'should initialize running state after successful %s',
      (command) => {
        const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
        tracker.onWillReceiveMessage({ type: 'request', seq: 1, command });
        tracker.onDidSendMessage({ type: 'response', command, request_seq: 1, success: true });
        expect(client.getExecutionState()).toBe('running');
      }
    );

    it('should preserve paused frames when a resume request fails', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      pausedWithFrames(tracker);
      tracker.onWillReceiveMessage({ type: 'request', seq: 1, command: 'continue' });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 1,
        success: false,
      });
      expect(client.getExecutionState()).toBe('paused');
      expect(client.getCurrentFrameId()).toBe(42);
      expect(client.isReadyForEvaluation()).toBe(true);
    });

    it('should preserve the inspected stop when a different thread alone continues', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      pausedWithFrames(tracker);
      tracker.onWillReceiveMessage({
        type: 'request',
        seq: 1,
        command: 'continue',
        arguments: { threadId: 2 },
      });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 1,
        success: true,
        body: { allThreadsContinued: false },
      });
      tracker.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: { threadId: 2, allThreadsContinued: false },
      });
      expect(client.getExecutionState()).toBe('paused');
      expect(client.getCurrentFrameId()).toBe(42);
      expect(client.getStoppedInfo()?.threadId).toBe(1);
      expect(client.getStoppedInfo()?.allThreadsStopped).toBe(false);
    });

    it('should mark the inspected thread running on a partial continue response', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      pausedWithFrames(tracker);
      tracker.onWillReceiveMessage({
        type: 'request',
        seq: 1,
        command: 'continue',
        arguments: { threadId: 1 },
      });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 1,
        success: true,
        body: { allThreadsContinued: false },
      });
      expect(client.getExecutionState()).toBe('running');
      expect(client.getCurrentFrameId()).toBeUndefined();
    });

    it('should trust the adapter when it resumes all threads despite a single-thread request', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      pausedWithFrames(tracker);
      tracker.onWillReceiveMessage({
        type: 'request',
        seq: 1,
        command: 'continue',
        arguments: { threadId: 2, singleThread: true },
      });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 1,
        success: true,
        body: { allThreadsContinued: true },
      });
      expect(client.getExecutionState()).toBe('running');
      expect(client.getCurrentFrameId()).toBeUndefined();
    });

    it.each(['stopped', 'terminated'])(
      'should not overwrite a newer %s event with a delayed response',
      (event) => {
        const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
        pausedWithFrames(tracker);
        tracker.onWillReceiveMessage({ type: 'request', seq: 1, command: 'continue' });
        tracker.onDidSendMessage({
          type: 'event',
          event,
          body: { threadId: 1, reason: 'breakpoint' },
        });
        tracker.onDidSendMessage({
          type: 'response',
          command: 'continue',
          request_seq: 1,
          success: true,
        });
        expect(client.getExecutionState()).toBe(event === 'stopped' ? 'paused' : 'terminated');
      }
    );

    it('should not emit a second running event for a response after a continued event', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      pausedWithFrames(tracker);
      const listener = vi.fn();
      client.onStateChange(listener);
      tracker.onWillReceiveMessage({ type: 'request', seq: 1, command: 'continue' });
      tracker.onDidSendMessage({ type: 'event', event: 'continued' });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 1,
        success: true,
      });
      expect(listener).toHaveBeenCalledExactlyOnceWith('running');
    });

    it('should keep concurrent sessions independent when resume responses arrive', () => {
      const other = createMockDebugSession('other');
      vscode.debug.activeDebugSession = mockSession;
      const trackerA = trackerFactory.createDebugAdapterTracker(mockSession);
      const trackerB = trackerFactory.createDebugAdapterTracker(other);
      pausedWithFrames(trackerA);
      pausedWithFrames(trackerB);
      const listener = vi.fn();
      client.onStateChange(listener);
      trackerB.onWillReceiveMessage({ type: 'request', seq: 1, command: 'continue' });
      trackerB.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 1,
        success: true,
      });
      expect(client.getExecutionState(mockSession)).toBe('paused');
      expect(client.getExecutionState(other)).toBe('running');
      expect(listener).not.toHaveBeenCalled();
    });

    it('should discard stack-trace responses from before a resume', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      pausedWithFrames(tracker);
      tracker.onWillReceiveMessage({ type: 'request', seq: 1, command: 'stackTrace' });
      tracker.onWillReceiveMessage({ type: 'request', seq: 2, command: 'continue' });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 2,
        success: true,
      });
      tracker.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        request_seq: 1,
        success: true,
        body: { stackFrames: [{ id: 99, name: 'stale', line: 1, column: 1 }] },
      });
      expect(client.getCurrentFrameId()).toBeUndefined();
    });

    it.each(['resume', 'reset'])(
      'should not return stale frames when %s occurs during a stack request',
      async (change) => {
        const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
        pausedWithFrames(tracker);
        mockSession.customRequest.mockImplementation(async () => {
          if (change === 'reset') {
            client.reset(mockSession.id);
          } else {
            tracker.onWillReceiveMessage({ type: 'request', seq: 2, command: 'continue' });
            tracker.onDidSendMessage({
              type: 'response',
              command: 'continue',
              request_seq: 2,
              success: true,
            });
          }
          return { stackFrames: [{ id: 99, name: 'stale', line: 1, column: 1 }] };
        });
        expect((await client.getStackTrace(mockSession)).stackFrames).toEqual([]);
        expect(client.getCurrentFrameId()).toBeUndefined();
      }
    );

    it('should ignore late resume responses after the session is reset', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      tracker.onWillReceiveMessage({ type: 'request', seq: 1, command: 'continue' });
      client.reset(mockSession.id);
      tracker.onDidSendMessage({
        type: 'response',
        command: 'continue',
        request_seq: 1,
        success: true,
      });
      expect(client.getExecutionState()).toBe('not_started');
    });
  });

  describe('Stack Trace', () => {
    it('should get stack trace from debug session', async () => {
      mockSession.customRequest.mockResolvedValue({
        stackFrames: [
          {
            id: 1,
            name: 'main',
            source: { path: '/test/file.js', name: 'file.js' },
            line: 10,
            column: 5,
          },
          {
            id: 2,
            name: 'helper',
            source: { path: '/test/helper.js', name: 'helper.js' },
            line: 20,
            column: 10,
          },
        ],
        totalFrames: 5,
      });

      const result = await client.getStackTrace(mockSession);

      expect(result.stackFrames).toHaveLength(2);
      expect(result.stackFrames[0]).toEqual({
        id: 1,
        name: 'main',
        source: { path: '/test/file.js', name: 'file.js' },
        line: 10,
        column: 5,
      });
      expect(result.totalFrames).toBe(5);
      expect(mockSession.customRequest).toHaveBeenCalledWith('stackTrace', {
        threadId: 1,
      });
    });

    it('should return empty array when stack trace fails', async () => {
      mockSession.customRequest.mockRejectedValue(new Error('Stack trace failed'));

      const result = await client.getStackTrace(mockSession);

      expect(result.stackFrames).toEqual([]);
      expect(result.totalFrames).toBeUndefined();
    });

    it('should pass depth limit parameters to DAP request', async () => {
      mockSession.customRequest.mockResolvedValue({
        stackFrames: [
          {
            id: 1,
            name: 'main',
            source: { path: '/test/file.js', name: 'file.js' },
            line: 10,
            column: 5,
          },
        ],
      });

      await client.getStackTrace(mockSession, { levels: 5, startFrame: 2 });

      expect(mockSession.customRequest).toHaveBeenCalledWith('stackTrace', {
        threadId: 1,
        levels: 5,
        startFrame: 2,
      });
    });

    it('should allow overriding the thread ID via options', async () => {
      mockSession.customRequest.mockResolvedValue({ stackFrames: [] });

      await client.getStackTrace(mockSession, { threadId: 7 });

      expect(mockSession.customRequest).toHaveBeenCalledWith('stackTrace', {
        threadId: 7,
      });
    });

    it('should reuse the last stopped thread ID for stack trace requests', async () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 42, reason: 'breakpoint' },
      });

      mockSession.customRequest.mockResolvedValue({ stackFrames: [] });

      await client.getStackTrace(mockSession);

      expect(mockSession.customRequest).toHaveBeenCalledWith('stackTrace', {
        threadId: 42,
      });
    });

    it('should limit returned frames to the requested depth', async () => {
      mockSession.customRequest.mockResolvedValue({
        stackFrames: [
          { id: 1, name: 'main', line: 1, column: 0 },
          { id: 2, name: 'helper', line: 2, column: 0 },
          { id: 3, name: 'leaf', line: 3, column: 0 },
        ],
      });

      const result = await client.getStackTrace(mockSession, { levels: 2 });

      expect(result.stackFrames).toHaveLength(2);
      expect(result.stackFrames[0]?.id).toBe(1);
      expect(result.stackFrames[1]?.id).toBe(2);
    });

    it('should respect cache when adapter request fails', async () => {
      const cachedFrames = [
        { id: 1, name: 'main', line: 1, column: 0 },
        { id: 2, name: 'helper', line: 2, column: 0 },
        { id: 3, name: 'leaf', line: 3, column: 0 },
      ];
      mockSession.customRequest
        .mockResolvedValueOnce({ stackFrames: cachedFrames })
        .mockRejectedValueOnce(new Error('stack trace failed'));

      await client.getStackTrace(mockSession);
      const result = await client.getStackTrace(mockSession, { startFrame: 1, levels: 1 });

      expect(result.stackFrames).toEqual([{ id: 2, name: 'helper', line: 2, column: 0 }]);
    });

    it('should cache stack frames from DAP messages', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: {
          stackFrames: [{ id: 1, name: 'test', line: 1, column: 0 }],
        },
      });

      expect(client.getCurrentFrameId()).toBe(1);
    });

    it('should not update frame ID for unsuccessful stack trace response', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: false,
      });

      expect(client.getCurrentFrameId()).toBeUndefined();
    });
  });

  describe('Scopes and Variables', () => {
    it('should get scopes for a frame', async () => {
      mockSession.customRequest.mockResolvedValue({
        scopes: [
          {
            name: 'Local',
            variablesReference: 100,
            expensive: false,
          },
          {
            name: 'Global',
            variablesReference: 200,
            expensive: true,
          },
        ],
      });

      const scopes = await client.getScopes(mockSession, 1);

      expect(scopes).toHaveLength(2);
      expect(scopes[0]).toEqual({
        name: 'Local',
        variablesReference: 100,
        expensive: false,
      });
      expect(mockSession.customRequest).toHaveBeenCalledWith('scopes', {
        frameId: 1,
      });
    });

    it('should return empty array when get scopes fails', async () => {
      mockSession.customRequest.mockRejectedValue(new Error('Get scopes failed'));

      const scopes = await client.getScopes(mockSession, 1);

      expect(scopes).toEqual([]);
    });

    it('should get variables from a scope', async () => {
      mockSession.customRequest.mockResolvedValue({
        variables: [
          {
            name: 'x',
            value: '10',
            type: 'number',
            variablesReference: 0,
          },
          {
            name: 'obj',
            value: '{...}',
            type: 'Object',
            variablesReference: 300,
          },
        ],
      });

      const variables = await client.getVariables(mockSession, 100);

      expect(variables).toHaveLength(2);
      expect(variables[0]).toEqual({
        name: 'x',
        value: '10',
        type: 'number',
        variablesReference: 0,
      });
      expect(mockSession.customRequest).toHaveBeenCalledWith('variables', {
        variablesReference: 100,
      });
    });

    it('should return empty array when get variables fails', async () => {
      mockSession.customRequest.mockRejectedValue(new Error('Get variables failed'));

      const variables = await client.getVariables(mockSession, 100);

      expect(variables).toEqual([]);
    });
  });

  describe('Expression Evaluation', () => {
    it('should evaluate expression in current frame', async () => {
      mockSession.customRequest.mockResolvedValue({
        result: '42',
        type: 'number',
        variablesReference: 0,
      });

      const result = await client.evaluateExpression(mockSession, 'x + 2');

      expect(result).toEqual({
        result: '42',
        type: 'number',
        variablesReference: 0,
      });
      expect(mockSession.customRequest).toHaveBeenCalledWith('evaluate', {
        expression: 'x + 2',
        frameId: undefined,
        context: 'watch',
      });
    });

    it('should evaluate expression in specific frame', async () => {
      mockSession.customRequest.mockResolvedValue({
        result: 'test',
        type: 'string',
      });

      await client.evaluateExpression(mockSession, 'str', 5);

      expect(mockSession.customRequest).toHaveBeenCalledWith('evaluate', {
        expression: 'str',
        frameId: 5,
        context: 'watch',
      });
    });

    it('should use cached frame ID when available', async () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      // Cache a frame ID
      tracker.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: {
          stackFrames: [{ id: 3, name: 'test', line: 1, column: 0 }],
        },
      });

      mockSession.customRequest.mockResolvedValue({
        result: 'value',
        type: 'string',
      });

      await client.evaluateExpression(mockSession, 'test');

      expect(mockSession.customRequest).toHaveBeenCalledWith('evaluate', {
        expression: 'test',
        frameId: 3,
        context: 'watch',
      });
    });

    it('should throw error when evaluation fails', async () => {
      mockSession.customRequest.mockRejectedValue(new Error('Invalid expression'));

      await expect(client.evaluateExpression(mockSession, 'invalid')).rejects.toThrow(
        'Failed to evaluate expression: Invalid expression'
      );
    });

    it('should handle non-Error rejection', async () => {
      mockSession.customRequest.mockRejectedValue('String error');

      await expect(client.evaluateExpression(mockSession, 'invalid')).rejects.toThrow(
        'Failed to evaluate expression: String error'
      );
    });
  });

  describe('Console Output', () => {
    it('should capture console output from DAP events', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: {
          category: 'console',
          output: 'Hello, world!',
        },
      });

      const output = client.getConsoleOutput();
      expect(output).toHaveLength(1);
      expect(output[0]).toMatchObject({
        category: 'console',
        output: 'Hello, world!',
      });
      expect(output[0]?.timestamp).toBeGreaterThan(0);
    });

    it('should capture output with source information', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: {
          category: 'stdout',
          output: 'Debug output\n',
          source: { path: '/test/file.js', name: 'file.js' },
          line: 15,
          variablesReference: 100,
        },
      });

      const output = client.getConsoleOutput();
      expect(output[0]).toMatchObject({
        category: 'stdout',
        output: 'Debug output\n',
        source: { path: '/test/file.js', name: 'file.js' },
        line: 15,
        variablesReference: 100,
      });
    });

    it('should filter console output by category', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'console', output: 'Console log' },
      });

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'stdout', output: 'Stdout log' },
      });

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'stderr', output: 'Error log' },
      });

      const consoleOnly = client.getConsoleOutput({ category: 'console' });
      expect(consoleOnly).toHaveLength(1);
      expect(consoleOnly[0]?.category).toBe('console');

      const stderrOnly = client.getConsoleOutput({ category: 'stderr' });
      expect(stderrOnly).toHaveLength(1);
      expect(stderrOnly[0]?.category).toBe('stderr');
    });

    it('should filter console output by timestamp', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      const now = Date.now();

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'console', output: 'Old log' },
      });

      // Wait a bit and capture timestamp
      const futureTimestamp = now + 100;

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'console', output: 'New log' },
      });

      const recentOnly = client.getConsoleOutput({
        since: futureTimestamp,
      });
      expect(recentOnly.length).toBeLessThanOrEqual(1);
    });

    it('should limit console output results', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      for (let i = 0; i < 10; i++) {
        tracker.onDidSendMessage({
          type: 'event',
          event: 'output',
          body: { category: 'console', output: `Log ${i}` },
        });
      }

      const limited = client.getConsoleOutput({ limit: 5 });
      expect(limited).toHaveLength(5);
      // Should get last 5 entries
      expect(limited[0]?.output).toBe('Log 5');
      expect(limited[4]?.output).toBe('Log 9');
    });

    it('should report total filtered count separately from limited entries', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      for (let i = 0; i < 3; i++) {
        tracker.onDidSendMessage({
          type: 'event',
          event: 'output',
          body: { category: 'console', output: `Log ${i}` },
        });
      }

      const snapshot = client.getConsoleOutputSnapshot({ limit: 1 });

      expect(snapshot.entries).toHaveLength(1);
      expect(snapshot.entries[0]?.output).toBe('Log 2');
      expect(snapshot.totalCount).toBe(3);
    });

    it('should clear console output buffer', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'console', output: 'Test' },
      });

      expect(client.getConsoleOutput()).toHaveLength(1);

      client.clearConsoleOutput();
      expect(client.getConsoleOutput()).toHaveLength(0);
    });

    it('should clear console output after reading with clear flag', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'console', output: 'Test' },
      });

      const output = client.getConsoleOutput({ clear: true });
      expect(output).toHaveLength(1);
      expect(client.getConsoleOutput()).toHaveLength(0);
    });

    it('should limit console buffer size', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      // Add more entries than buffer size
      for (let i = 0; i < MAX_CONSOLE_BUFFER_SIZE + 100; i++) {
        tracker.onDidSendMessage({
          type: 'event',
          event: 'output',
          body: { category: 'console', output: `Log ${i}` },
        });
      }

      const output = client.getConsoleOutput();
      expect(output.length).toBeLessThanOrEqual(MAX_CONSOLE_BUFFER_SIZE);
      // Should keep latest entries
      expect(output[output.length - 1]?.output).toContain(`${MAX_CONSOLE_BUFFER_SIZE + 99}`);
    });

    it('should ignore output events without output body', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: {},
      });

      expect(client.getConsoleOutput()).toHaveLength(0);
    });
  });

  describe('Event Handling', () => {
    it('should fire state change events', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      const listener = vi.fn();
      const disposable = client.onStateChange(listener);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });

      expect(listener).toHaveBeenCalledWith('paused');

      tracker.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: {},
      });

      expect(listener).toHaveBeenCalledWith('running');

      disposable.dispose();
    });

    it('should allow multiple state change listeners', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      client.onStateChange(listener1);
      client.onStateChange(listener2);

      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'pause' },
      });

      expect(listener1).toHaveBeenCalledWith('paused');
      expect(listener2).toHaveBeenCalledWith('paused');
    });

    it('should handle DAP errors', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      // Should not throw
      expect(() => {
        tracker.onError(new Error('DAP Error'));
      }).not.toThrow();
    });

    it('should reset state on exit', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      // Set some state
      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'console', output: 'Test' },
      });

      expect(client.getExecutionState()).toBe('paused');
      expect(client.getConsoleOutput()).toHaveLength(1);

      // Simulate exit
      tracker.onExit(0, undefined);

      expect(client.getExecutionState()).toBe('not_started');
      expect(client.getConsoleOutput()).toHaveLength(0);
      expect(client.getStoppedInfo()).toBeUndefined();
    });
  });

  describe('Reset and Cleanup', () => {
    it('should reset all state', () => {
      const tracker = trackerFactory.createDebugAdapterTracker(mockSession);

      // Set some state
      tracker.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: {
          stackFrames: [{ id: 5, name: 'test', line: 1, column: 0 }],
        },
      });

      tracker.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });

      tracker.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'console', output: 'Test' },
      });

      client.reset();

      expect(client.getCurrentFrameId()).toBeUndefined();
      expect(client.getExecutionState()).toBe('not_started');
      expect(client.getStoppedInfo()).toBeUndefined();
      expect(client.getConsoleOutput()).toHaveLength(0);
    });

    it('should dispose event emitter', () => {
      const listener = vi.fn();
      const disposable = client.onStateChange(listener);

      client.dispose();

      // After disposal, the emitter should be disposed
      expect(() => disposable.dispose()).not.toThrow();
    });
  });

  describe('Multi-Session State Isolation', () => {
    let sessionA: any;
    let sessionB: any;
    let trackerA: any;
    let trackerB: any;

    beforeEach(() => {
      sessionA = createMockDebugSession('session-a', 'node');
      sessionB = createMockDebugSession('session-b', 'python');
      trackerA = trackerFactory.createDebugAdapterTracker(sessionA);
      trackerB = trackerFactory.createDebugAdapterTracker(sessionB);
    });

    it('should track execution state independently per session', () => {
      trackerA.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });
      trackerB.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: {},
      });

      expect(client.getExecutionState(sessionA)).toBe('paused');
      expect(client.getExecutionState(sessionB)).toBe('running');
      expect(client.getStoppedInfo(sessionA)?.reason).toBe('breakpoint');
      expect(client.getStoppedInfo(sessionB)).toBeUndefined();
    });

    it('should not corrupt the active session state when a background session sends events', () => {
      vscode.debug.activeDebugSession = sessionA;

      trackerA.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });
      trackerB.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: {},
      });

      expect(client.getExecutionState()).toBe('paused');
      expect(client.getStoppedInfo()?.reason).toBe('breakpoint');
    });

    it('should not emit state changes for non-observed sessions', () => {
      vscode.debug.activeDebugSession = sessionA;
      const listener = vi.fn();
      client.onStateChange(listener);

      trackerB.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 2, reason: 'pause' },
      });

      expect(listener).not.toHaveBeenCalled();
      expect(client.getExecutionState()).toBe('not_started');
      expect(client.getExecutionState(sessionB)).toBe('paused');
    });

    it('should reset only the terminated session', () => {
      trackerA.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });
      trackerB.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 2, reason: 'pause' },
      });

      client.reset(sessionB.id);

      expect(client.getExecutionState(sessionA)).toBe('paused');
      expect(client.getStoppedInfo(sessionA)?.reason).toBe('breakpoint');
      expect(client.getExecutionState(sessionB)).toBe('not_started');
      expect(client.getStoppedInfo(sessionB)).toBeUndefined();
    });

    it('should keep other sessions console output when one session resets', () => {
      trackerA.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'stdout', output: 'from A' },
      });
      trackerB.onDidSendMessage({
        type: 'event',
        event: 'output',
        body: { category: 'stdout', output: 'from B' },
      });

      client.reset(sessionB.id);

      const output = client.getConsoleOutput();
      expect(output).toHaveLength(1);
      expect(output[0]?.output).toBe('from A');
    });

    it('should not attribute stack frames across sessions', () => {
      trackerA.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: { stackFrames: [{ id: 1, name: 'frameA', line: 1, column: 0 }] },
      });
      trackerB.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: { stackFrames: [{ id: 9, name: 'frameB', line: 2, column: 0 }] },
      });

      expect(client.getCurrentFrameId(sessionA)).toBe(1);
      expect(client.getCurrentFrameId(sessionB)).toBe(9);
    });

    it('should clear cached frame ID when execution continues', async () => {
      trackerA.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: { stackFrames: [{ id: 3, name: 'main', line: 1, column: 0 }] },
      });
      expect(client.getCurrentFrameId(sessionA)).toBe(3);

      trackerA.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: {},
      });
      expect(client.getCurrentFrameId(sessionA)).toBeUndefined();

      // Evaluation must not target the dead frame
      sessionA.customRequest.mockResolvedValue({ result: '1', type: 'number' });
      await client.evaluateExpression(sessionA, 'x');
      expect(sessionA.customRequest).toHaveBeenCalledWith('evaluate', {
        expression: 'x',
        frameId: undefined,
        context: 'watch',
      });
    });

    it('should clear cached frames when a new stop occurs', () => {
      trackerA.onDidSendMessage({
        type: 'response',
        command: 'stackTrace',
        success: true,
        body: { stackFrames: [{ id: 3, name: 'main', line: 1, column: 0 }] },
      });

      trackerA.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });

      // Frames from the previous stop are stale and must be dropped
      expect(client.getCurrentFrameId(sessionA)).toBeUndefined();
    });

    it('should aggregate breakpoint hit stats across sessions', () => {
      trackerA.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint', hitBreakpointIds: [5] },
      });
      trackerB.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 2, reason: 'breakpoint', hitBreakpointIds: [5] },
      });

      expect(client.getBreakpointHitStats(5)?.hitCount).toBe(2);
    });

    it('should notify listeners when the observed session is reset', () => {
      vscode.debug.activeDebugSession = sessionA;
      const listener = vi.fn();
      client.onStateChange(listener);

      trackerA.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });
      expect(listener).toHaveBeenCalledWith('paused');

      client.reset(sessionA.id);
      expect(listener).toHaveBeenCalledWith('not_started');
    });

    it('should not notify listeners when a non-observed session is reset', () => {
      vscode.debug.activeDebugSession = sessionA;
      const listener = vi.fn();
      client.onStateChange(listener);

      trackerB.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 2, reason: 'pause' },
      });
      listener.mockClear();

      client.reset(sessionB.id);
      expect(listener).not.toHaveBeenCalled();
    });

    it('should fall back to the remaining session when the observed session ends', () => {
      const listener = vi.fn();
      client.onStateChange(listener);

      trackerB.onDidSendMessage({
        type: 'event',
        event: 'continued',
        body: {},
      });
      trackerA.onDidSendMessage({
        type: 'event',
        event: 'stopped',
        body: { threadId: 1, reason: 'breakpoint' },
      });
      expect(client.getExecutionState()).toBe('paused');

      client.reset(sessionA.id);

      // A was observed; with A gone, B is the only remaining session
      expect(client.getExecutionState()).toBe('running');
      expect(listener).toHaveBeenCalledWith('running');
    });
  });
});
