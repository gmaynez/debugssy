// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InspectionTools } from '../Inspection';
import { DAPClient } from '../../dap/Client';
import { ConfigManager } from '../../Config';
import { DEFAULT_MAX_STACK_DEPTH } from '../../constants';
import { vscode } from '../../__tests__/setup';
import { createMockDebugSession } from '../../__tests__/helpers/vscode-mock';

describe('InspectionTools', () => {
  let tools: InspectionTools;
  let dapClient: DAPClient;
  let configManager: ConfigManager;
  let mockSession: any;

  beforeEach(() => {
    vi.clearAllMocks();
    dapClient = new DAPClient();
    configManager = new ConfigManager();
    tools = new InspectionTools(dapClient, configManager);
    mockSession = createMockDebugSession('test', 'node');
  });

  describe('getDebugState', () => {
    it('should return no active session state when no session', async () => {
      vscode.debug.activeDebugSession = undefined;

      const result = await tools.getDebugState();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        hasActiveSession: false,
        executionState: 'not_started',
      });
    });

    it('should return basic session state when running', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('running');

      const result = await tools.getDebugState();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        hasActiveSession: true,
        sessionName: 'test',
        sessionType: 'node',
        executionState: 'running',
      });
      expect(result.data?.stoppedInfo).toBeUndefined();
    });

    it('should return detailed state when paused with stack frame', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('paused');
      vi.spyOn(dapClient, 'getStoppedInfo').mockReturnValue({
        threadId: 1,
        reason: 'breakpoint',
        description: 'Paused on breakpoint',
        allThreadsStopped: true,
        hitBreakpointIds: [1, 2],
      });
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [
          {
            id: 1,
            name: 'main',
            source: { path: '/test/file.js', name: 'file.js' },
            line: 10,
            column: 5,
          },
        ],
        totalFrames: 1,
      });

      const result = await tools.getDebugState();

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        hasActiveSession: true,
        sessionName: 'test',
        executionState: 'paused',
        stoppedInfo: {
          reason: 'breakpoint',
          description: 'Paused on breakpoint',
          threadId: 1,
          allThreadsStopped: true,
          hitBreakpointIds: [1, 2],
        },
        currentLocation: {
          file: '/test/file.js',
          line: 10,
          column: 5,
          functionName: 'main',
        },
      });
    });

    it('should handle paused state without stack frame', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('paused');
      vi.spyOn(dapClient, 'getStoppedInfo').mockReturnValue({
        threadId: 1,
        reason: 'pause',
      });
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [],
        totalFrames: 0,
      });

      const result = await tools.getDebugState();

      expect(result.success).toBe(true);
      expect(result.data?.stoppedInfo).toBeDefined();
      expect(result.data?.currentLocation).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockImplementation(() => {
        throw new Error('State error');
      });

      const result = await tools.getDebugState();

      expect(result.success).toBe(false);
      expect(result.error).toContain('State error');
    });
  });

  describe('waitForBreakpoint', () => {
    it('should fail in assisted mode', async () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'assisted',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      const result = await tools.waitForBreakpoint({
        automationLevel: 'assisted',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('full automation mode');
    });

    it('should fail when no active debug session', async () => {
      vscode.debug.activeDebugSession = undefined;

      const result = await tools.waitForBreakpoint({
        automationLevel: 'full',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active debug session');
    });

    it('should return immediately if already paused', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('paused');
      vi.spyOn(dapClient, 'getStoppedInfo').mockReturnValue({
        threadId: 1,
        reason: 'breakpoint',
      });
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [],
        totalFrames: 0,
      });

      const result = await tools.waitForBreakpoint({
        automationLevel: 'full',
      });

      expect(result.success).toBe(true);
      expect(result.data?.executionState).toBe('paused');
    });

    it('should wait for paused event', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('running');
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [],
        totalFrames: 0,
      });

      // Mock onStateChange to fire after a delay
      let stateChangeCallback: ((state: any) => void) | null = null;
      vi.spyOn(dapClient, 'onStateChange').mockImplementation((callback) => {
        stateChangeCallback = callback;
        return { dispose: vi.fn() };
      });

      // Start waiting
      const resultPromise = tools.waitForBreakpoint({
        automationLevel: 'full',
        timeout: 1000,
      });

      // Simulate paused event after a short delay
      setTimeout(() => {
        vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('paused');
        vi.spyOn(dapClient, 'getStoppedInfo').mockReturnValue({
          threadId: 1,
          reason: 'breakpoint',
        });
        if (stateChangeCallback) {
          stateChangeCallback('paused');
        }
      }, 50);

      const result = await resultPromise;

      expect(result.success).toBe(true);
    });

    it('should timeout when breakpoint not hit', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('running');
      vi.spyOn(dapClient, 'onStateChange').mockImplementation(() => {
        return { dispose: vi.fn() };
      });

      const result = await tools.waitForBreakpoint({
        automationLevel: 'full',
        timeout: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
    });

    it('should use default timeout from config', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getExecutionState').mockReturnValue('running');
      vi.spyOn(dapClient, 'onStateChange').mockImplementation(() => {
        return { dispose: vi.fn() };
      });

      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 100,
        allowStepOperations: false,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      const result = await tools.waitForBreakpoint({
        automationLevel: 'full',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
      expect(result.error).toContain('100ms');
    });
  });

  describe('getVariables', () => {
    it('should fail when no active debug session', async () => {
      vscode.debug.activeDebugSession = undefined;

      const result = await tools.getVariables({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active debug session');
    });

    it('should fail when no stack frames available', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [],
        totalFrames: 0,
      });

      const result = await tools.getVariables({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No stack frames available');
    });

    it('should get variables from current frame', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [
          {
            id: 1,
            name: 'main',
            source: { path: '/test/file.js' },
            line: 10,
            column: 0,
          },
        ],
        totalFrames: 1,
      });
      vi.spyOn(dapClient, 'getScopes').mockResolvedValue([
        { name: 'Local', variablesReference: 100, expensive: false },
      ]);
      vi.spyOn(dapClient, 'getVariables').mockResolvedValue([
        { name: 'x', value: '10', type: 'number', variablesReference: 0 },
        { name: 'y', value: '20', type: 'number', variablesReference: 0 },
      ]);

      const result = await tools.getVariables({});

      expect(result.success).toBe(true);
      expect(result.data?.frameId).toBe(1);
      expect(result.data?.scopes).toHaveLength(1);
      expect(result.data?.scopes[0]).toMatchObject({
        name: 'Local',
        variables: [
          { name: 'x', value: '10', type: 'number' },
          { name: 'y', value: '20', type: 'number' },
        ],
      });
    });

    it('should get variables from specific frame', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [
          { id: 1, name: 'main', line: 10, column: 0 },
          { id: 2, name: 'helper', line: 5, column: 0 },
        ],
        totalFrames: 2,
      });
      vi.spyOn(dapClient, 'getScopes').mockResolvedValue([
        { name: 'Local', variablesReference: 100, expensive: false },
      ]);
      vi.spyOn(dapClient, 'getVariables').mockResolvedValue([]);

      const result = await tools.getVariables({ frameId: 2 });

      expect(result.success).toBe(true);
      expect(result.data?.frameId).toBe(2);
      expect(dapClient.getScopes).toHaveBeenCalledWith(mockSession, 2);
    });

    it('should filter variables by scope', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [{ id: 1, name: 'main', line: 10, column: 0 }],
        totalFrames: 1,
      });
      vi.spyOn(dapClient, 'getScopes').mockResolvedValue([
        { name: 'Local: main', variablesReference: 100, expensive: false },
        { name: 'Global', variablesReference: 200, expensive: true },
      ]);
      vi.spyOn(dapClient, 'getVariables').mockResolvedValue([
        { name: 'x', value: '10', type: 'number', variablesReference: 0 },
      ]);

      const result = await tools.getVariables({ scope: 'Local' });

      expect(result.success).toBe(true);
      expect(result.data?.scopes).toHaveLength(1);
      expect(result.data?.scopes[0]?.name).toBe('Local: main');
      // Global scope should be filtered out
      expect(dapClient.getVariables).toHaveBeenCalledTimes(1);
      expect(dapClient.getVariables).toHaveBeenCalledWith(mockSession, 100);
    });

    it('should handle errors gracefully', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getStackTrace').mockRejectedValue(new Error('Stack trace error'));

      const result = await tools.getVariables({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stack trace error');
    });
  });

  describe('getCallStack', () => {
    it('should fail when no active debug session', async () => {
      vscode.debug.activeDebugSession = undefined;

      const result = await tools.getCallStack();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active debug session');
    });

    it('should get call stack with default depth', async () => {
      vscode.debug.activeDebugSession = mockSession;
      const allFrames = Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        name: `function${i}`,
        source: { path: `/test/file${i}.js` },
        line: i + 1,
        column: 0,
      }));
      // Mock should respect the levels parameter and return only requested frames
      vi.spyOn(dapClient, 'getStackTrace').mockImplementation(async (_session, options) => {
        const levels = options?.levels ?? allFrames.length;
        return {
          stackFrames: allFrames.slice(0, levels),
          totalFrames: allFrames.length,
        };
      });

      const result = await tools.getCallStack();

      expect(result.success).toBe(true);
      expect(result.data?.frames).toHaveLength(20); // Default max depth
      expect(result.data?.totalFrames).toBe(30); // Real total from DAP
      expect(result.data?.truncated).toBe(true); // 30 > 20 returned
      expect(dapClient.getStackTrace).toHaveBeenCalledWith(mockSession, { levels: 21 });
    });

    it('should get call stack with custom depth', async () => {
      vscode.debug.activeDebugSession = mockSession;
      const allFrames = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `function${i}`,
        source: { path: `/test/file${i}.js` },
        line: i + 1,
        column: 0,
      }));
      // Mock should respect the levels parameter and return only requested frames
      vi.spyOn(dapClient, 'getStackTrace').mockImplementation(async (_session, options) => {
        const levels = options?.levels ?? allFrames.length;
        return {
          stackFrames: allFrames.slice(0, levels),
          totalFrames: allFrames.length,
        };
      });

      const result = await tools.getCallStack({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.data?.frames).toHaveLength(5);
      expect(result.data?.totalFrames).toBe(10); // Real total from DAP
      expect(result.data?.truncated).toBe(true); // 10 > 5 returned
      expect(dapClient.getStackTrace).toHaveBeenCalledWith(mockSession, { levels: 6 });
    });

    it('should not truncate when all frames fit', async () => {
      vscode.debug.activeDebugSession = mockSession;
      const frames = [
        {
          id: 1,
          name: 'main',
          source: { path: '/test/file.js' },
          line: 10,
          column: 0,
        },
      ];
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: frames,
        totalFrames: 1,
      });

      const result = await tools.getCallStack();

      expect(result.success).toBe(true);
      expect(result.data?.frames).toHaveLength(1);
      expect(result.data?.truncated).toBe(false);
    });

    it('should infer truncation when adapters omit totalFrames', async () => {
      vscode.debug.activeDebugSession = mockSession;
      const frames = Array.from({ length: DEFAULT_MAX_STACK_DEPTH + 1 }, (_, i) => ({
        id: i + 1,
        name: `fn${i}`,
        source: { path: `/tmp/file${i}.js` },
        line: i + 1,
        column: 0,
      }));
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: frames,
      });

      const result = await tools.getCallStack();

      expect(result.success).toBe(true);
      expect(result.data?.frames).toHaveLength(DEFAULT_MAX_STACK_DEPTH);
      expect(result.data?.truncated).toBe(true);
      expect(result.data?.totalFrames).toBe(DEFAULT_MAX_STACK_DEPTH + 1);
    });

    it('should not mark truncation when fewer frames are returned without totals', async () => {
      vscode.debug.activeDebugSession = mockSession;
      const frames = Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        name: `fn${i}`,
        source: { path: `/tmp/file${i}.js` },
        line: i + 1,
        column: 0,
      }));
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: frames,
      });

      const result = await tools.getCallStack({ maxDepth: 5 });

      expect(result.success).toBe(true);
      expect(result.data?.frames).toHaveLength(3);
      expect(result.data?.truncated).toBe(false);
      expect(result.data?.totalFrames).toBe(3);
    });

    it('should format frames correctly', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getStackTrace').mockResolvedValue({
        stackFrames: [
          {
            id: 1,
            name: 'main',
            source: { path: '/test/file.js', name: 'file.js' },
            line: 10,
            column: 5,
          },
        ],
        totalFrames: 1,
      });

      const result = await tools.getCallStack();

      expect(result.success).toBe(true);
      expect(result.data?.frames[0]).toEqual({
        id: 1,
        name: 'main',
        source: '/test/file.js',
        line: 10,
        column: 5,
      });
    });

    it('should handle errors gracefully', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'getStackTrace').mockRejectedValue(new Error('Stack error'));

      const result = await tools.getCallStack();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stack error');
    });
  });

  describe('evaluateExpression', () => {
    it('should fail when no active debug session', async () => {
      vscode.debug.activeDebugSession = undefined;

      const result = await tools.evaluateExpression({ expression: 'x' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active debug session');
    });

    it('should evaluate expression successfully', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'evaluateExpression').mockResolvedValue({
        result: '42',
        type: 'number',
      });

      const result = await tools.evaluateExpression({ expression: 'x + 2' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        expression: 'x + 2',
        result: '42',
        type: 'number',
      });
    });

    it('should evaluate expression in specific frame', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'evaluateExpression').mockResolvedValue({
        result: 'test',
        type: 'string',
      });

      await tools.evaluateExpression({ expression: 'str', frameId: 5 });

      expect(dapClient.evaluateExpression).toHaveBeenCalledWith(mockSession, 'str', 5);
    });

    it('should reject expressions exceeding max length', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        minifyResponses: true,
        maxExpressionLength: 50,
        expressionValidationLevel: 'moderate',
      });

      const longExpression = 'x'.repeat(51);
      const result = await tools.evaluateExpression({
        expression: longExpression,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum allowed length');
      expect(result.error).toContain('50');
    });

    it('should handle evaluation errors', async () => {
      vscode.debug.activeDebugSession = mockSession;
      vi.spyOn(dapClient, 'evaluateExpression').mockRejectedValue(new Error('Invalid expression'));

      const result = await tools.evaluateExpression({ expression: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid expression');
    });
  });

  describe('getThreads', () => {
    it('should fail when no active debug session', async () => {
      vscode.debug.activeDebugSession = undefined;

      const result = await tools.getThreads();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active debug session');
    });

    it('should get threads successfully', async () => {
      vscode.debug.activeDebugSession = mockSession;
      mockSession.customRequest.mockResolvedValue({
        threads: [
          { id: 1, name: 'main thread' },
          { id: 2, name: 'worker thread' },
        ],
      });

      const result = await tools.getThreads();

      expect(result.success).toBe(true);
      expect(result.data?.threads).toHaveLength(2);
      expect(mockSession.customRequest).toHaveBeenCalledWith('threads');
    });

    it('should handle errors gracefully', async () => {
      vscode.debug.activeDebugSession = mockSession;
      mockSession.customRequest.mockRejectedValue(new Error('Threads error'));

      const result = await tools.getThreads();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Threads error');
    });
  });

  describe('getConsoleOutput', () => {
    it('should get console output with default limit', async () => {
      vi.spyOn(dapClient, 'getConsoleOutput').mockReturnValue([
        {
          category: 'console',
          output: 'Test log',
          timestamp: Date.now(),
        },
      ]);

      const result = await tools.getConsoleOutput();

      expect(result.success).toBe(true);
      expect(result.data?.entries).toHaveLength(1);
      expect(result.data?.entries[0]).toMatchObject({
        category: 'console',
        output: 'Test log',
      });
      expect(dapClient.getConsoleOutput).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 })
      );
    });

    it('should filter by category', async () => {
      vi.spyOn(dapClient, 'getConsoleOutput').mockReturnValue([
        { category: 'stderr', output: 'Error', timestamp: Date.now() },
      ]);

      const result = await tools.getConsoleOutput({ category: 'stderr' });

      expect(result.success).toBe(true);
      expect(dapClient.getConsoleOutput).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'stderr' })
      );
    });

    it('should apply custom limit', async () => {
      vi.spyOn(dapClient, 'getConsoleOutput').mockReturnValue([]);

      await tools.getConsoleOutput({ limit: 100 });

      expect(dapClient.getConsoleOutput).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 100 })
      );
    });

    it('should filter by timestamp', async () => {
      const timestamp = Date.now() - 1000;
      vi.spyOn(dapClient, 'getConsoleOutput').mockReturnValue([]);

      await tools.getConsoleOutput({ since: timestamp });

      expect(dapClient.getConsoleOutput).toHaveBeenCalledWith(
        expect.objectContaining({ since: timestamp })
      );
    });

    it('should clear buffer after reading', async () => {
      vi.spyOn(dapClient, 'getConsoleOutput').mockReturnValue([]);

      await tools.getConsoleOutput({ clear: true });

      expect(dapClient.getConsoleOutput).toHaveBeenCalledWith(
        expect.objectContaining({ clear: true })
      );
    });

    it('should handle errors gracefully', async () => {
      vi.spyOn(dapClient, 'getConsoleOutput').mockImplementation(() => {
        throw new Error('Console error');
      });

      const result = await tools.getConsoleOutput();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Console error');
    });
  });

  describe('clearConsoleOutput', () => {
    it('should clear console output successfully', async () => {
      vi.spyOn(dapClient, 'clearConsoleOutput').mockImplementation(() => {});

      const result = await tools.clearConsoleOutput();

      expect(result.success).toBe(true);
      expect(result.data?.message).toContain('cleared');
      expect(dapClient.clearConsoleOutput).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      vi.spyOn(dapClient, 'clearConsoleOutput').mockImplementation(() => {
        throw new Error('Clear error');
      });

      const result = await tools.clearConsoleOutput();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Clear error');
    });
  });

  describe('getWatches', () => {
    it('should return error indicating limitation', async () => {
      const result = await tools.getWatches();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not directly accessible');
      expect(result.error).toContain('evaluate_expression');
    });
  });
});
