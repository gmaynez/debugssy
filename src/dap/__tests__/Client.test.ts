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
});
