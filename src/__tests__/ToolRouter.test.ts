// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToolRouter } from '../routing/ToolRouter';
import type { ToolRegistry } from '../tools';
import { ConfigManager } from '../Config';
import { TOOL_NAMES } from '../routing/toolNames';
import { vscode } from './setup';
import { createMockDebugSession } from './helpers/vscode-mock';
import { createBreakpointLocation } from './helpers/test-helpers';

function mockConfig(
  configManager: ConfigManager,
  overrides: Partial<ReturnType<ConfigManager['getConfig']>> = {}
) {
  return vi.spyOn(configManager, 'getConfig').mockReturnValue({
    enabled: true,
    port: 3000,
    automationLevel: 'assisted',
    waitForBreakpointTimeout: 5000,
    allowStepOperations: false,
    minifyResponses: true,
    maxExpressionLength: 100,
    expressionValidationLevel: 'moderate' as const,
    ...overrides,
  });
}

// Mock ToolRegistry
function createMockToolRegistry(): ToolRegistry {
  return {
    breakpoints: {
      setBreakpoint: vi.fn().mockResolvedValue({ success: true, message: 'Breakpoint set' }),
      removeBreakpoint: vi.fn().mockResolvedValue({ success: true, message: 'Breakpoint removed' }),
      listBreakpoints: vi.fn().mockResolvedValue({ success: true, breakpoints: [] }),
      inspectBreakpoint: vi.fn().mockResolvedValue({ success: true, data: {} }),
      toggleBreakpoint: vi.fn().mockResolvedValue({ success: true, message: 'Toggled' }),
      removeAllBreakpoints: vi.fn().mockResolvedValue({ success: true, message: 'All removed' }),
    } as any,
    inspection: {
      getVariables: vi.fn().mockResolvedValue({ success: true, variables: [] }),
      getCallStack: vi.fn().mockResolvedValue({ success: true, frames: [] }),
      evaluateExpression: vi.fn().mockResolvedValue({ success: true, result: '42' }),
      getThreads: vi.fn().mockResolvedValue({ success: true, threads: [] }),
      getDebugState: vi.fn().mockResolvedValue({ success: true, state: 'paused' }),
      getConsoleOutput: vi.fn().mockResolvedValue({ success: true, output: [] }),
      clearConsoleOutput: vi.fn().mockResolvedValue({ success: true }),
      waitForBreakpoint: vi.fn().mockResolvedValue({ success: true }),
    } as any,
    debugControl: {
      startDebugging: vi.fn().mockResolvedValue({ success: true }),
      stopDebugging: vi.fn().mockResolvedValue({ success: true }),
      continueExecution: vi.fn().mockResolvedValue({ success: true }),
      pause: vi.fn().mockResolvedValue({ success: true }),
      restart: vi.fn().mockResolvedValue({ success: true }),
      stepOver: vi.fn().mockResolvedValue({ success: true }),
      stepInto: vi.fn().mockResolvedValue({ success: true }),
      stepOut: vi.fn().mockResolvedValue({ success: true }),
    } as any,
    dispose: vi.fn(),
  };
}

describe('ToolRouter', () => {
  let toolRouter: ToolRouter;
  let mockToolRegistry: ToolRegistry;
  let mockConfigManager: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockToolRegistry = createMockToolRegistry();
    mockConfigManager = new ConfigManager();
    toolRouter = new ToolRouter(mockToolRegistry, mockConfigManager);
  });

  afterEach(() => {
    toolRouter.dispose();
  });

  describe('Expression security regressions', () => {
    it.each(['strict', 'moderate', 'permissive'] as const)(
      'should block risky evaluation without elicitation in %s mode',
      async (expressionValidationLevel) => {
        mockConfig(mockConfigManager, { expressionValidationLevel });
        vscode.debug.activeDebugSession = createMockDebugSession();
        const result = await toolRouter.routeToolCall(TOOL_NAMES.evaluateExpression, {
          expression: '[1].map(x => (y=7))',
        });
        expect(result.success).toBe(false);
        expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
      }
    );

    it('should elicit for the highest-risk call in an expression', async () => {
      vscode.debug.activeDebugSession = createMockDebugSession();
      const server = { elicitInput: vi.fn().mockResolvedValue({ action: 'decline' }) } as any;
      const result = await toolRouter.routeToolCall(
        TOOL_NAMES.evaluateExpression,
        { expression: 'obj.getName(), doSideEffect()' },
        server
      );
      expect(server.elicitInput).toHaveBeenCalledOnce();
      expect(result.success).toBe(false);
      expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
    });

    it.each(['allow_once', 'allow_session'])(
      'should reject %s approval after the active session changes',
      async (decision) => {
        const sessionA = createMockDebugSession('A');
        const sessionB = createMockDebugSession('B');
        vscode.debug.activeDebugSession = sessionA;
        const allowSpy = vi.spyOn(
          (toolRouter as any).expressionValidator,
          'allowExpressionForSession'
        );
        const server = {
          elicitInput: vi.fn(async () => {
            vscode.debug.activeDebugSession = sessionB;
            return { action: 'accept', content: { decision } };
          }),
        } as any;
        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'x=7' },
          server
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('session changed or ended');
        expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
        expect(allowSpy).not.toHaveBeenCalled();
      }
    );

    it('should reject approval for a terminated session even if it remains active', async () => {
      const session = createMockDebugSession();
      vscode.debug.activeDebugSession = session;
      const listenerDisposable = { dispose: vi.fn() };
      let terminate: (session: typeof vscode.debug.activeDebugSession) => void = () => {};
      (vscode.debug.onDidTerminateDebugSession as any).mockImplementationOnce(
        (listener: typeof terminate) => {
          terminate = listener;
          return listenerDisposable;
        }
      );
      const server = {
        elicitInput: vi.fn(async () => {
          terminate(session);
          return { action: 'accept', content: { decision: 'allow_session' } };
        }),
      } as any;
      const allowSpy = vi.spyOn(
        (toolRouter as any).expressionValidator,
        'allowExpressionForSession'
      );
      const result = await toolRouter.routeToolCall(
        TOOL_NAMES.evaluateExpression,
        { expression: 'x=7' },
        server
      );
      expect(result.success).toBe(false);
      expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
      expect(allowSpy).not.toHaveBeenCalled();
      expect(listenerDisposable.dispose).toHaveBeenCalledOnce();
    });

    it('should pass the validated session explicitly when approval succeeds', async () => {
      const session = createMockDebugSession();
      vscode.debug.activeDebugSession = session;
      const server = {
        elicitInput: vi
          .fn()
          .mockResolvedValue({ action: 'accept', content: { decision: 'allow_once' } }),
      } as any;
      const args = { expression: 'x=7', frameId: 5 };
      const result = await toolRouter.routeToolCall(TOOL_NAMES.evaluateExpression, args, server);
      expect(result.success).toBe(true);
      expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledWith(args, session);
    });

    it.each(['decline', 'cancel', 'error'])(
      'should clean up the pending session listener after %s',
      async (action) => {
        vscode.debug.activeDebugSession = createMockDebugSession();
        const disposable = { dispose: vi.fn() };
        vi.mocked(vscode.debug.onDidTerminateDebugSession).mockReturnValueOnce(disposable);
        const server = {
          elicitInput:
            action === 'error'
              ? vi.fn().mockRejectedValue(new Error('Elicitation unavailable'))
              : vi.fn().mockResolvedValue({ action }),
        } as any;
        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'x=7' },
          server
        );
        expect(result.success).toBe(false);
        expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
        expect(disposable.dispose).toHaveBeenCalledOnce();
      }
    );
  });

  describe('Breakpoint expression security', () => {
    const location = { filePath: '/test.js', line: 1 };

    it('should validate executable expressions when enabling an existing breakpoint', async () => {
      const breakpoint = new vscode.SourceBreakpoint(
        createBreakpointLocation('/test.js', 1),
        false,
        'mutate()'
      );
      vscode.debug.breakpoints = [breakpoint];
      const result = await toolRouter.routeToolCall(TOOL_NAMES.toggleBreakpoint, location);
      expect(result.success).toBe(false);
      expect(mockToolRegistry.breakpoints.toggleBreakpoint).not.toHaveBeenCalled();
    });

    it('should allow disabling a risky breakpoint without approval', async () => {
      const breakpoint = new vscode.SourceBreakpoint(
        createBreakpointLocation('/test.js', 1),
        true,
        'mutate()'
      );
      vscode.debug.breakpoints = [breakpoint];
      const result = await toolRouter.routeToolCall(TOOL_NAMES.toggleBreakpoint, location);
      expect(result.success).toBe(true);
      expect(mockToolRegistry.breakpoints.toggleBreakpoint).toHaveBeenCalledWith(location);
    });

    it('should enable a safe breakpoint without approval', async () => {
      const breakpoint = new vscode.SourceBreakpoint(
        createBreakpointLocation('/test.js', 1),
        false,
        'x > 7'
      );
      vscode.debug.breakpoints = [breakpoint];
      const server = { elicitInput: vi.fn() } as any;
      const result = await toolRouter.routeToolCall(TOOL_NAMES.toggleBreakpoint, location, server);
      expect(result.success).toBe(true);
      expect(server.elicitInput).not.toHaveBeenCalled();
      expect(mockToolRegistry.breakpoints.toggleBreakpoint).toHaveBeenCalledWith(location);
    });

    it('should not enable a replacement breakpoint after approval', async () => {
      const breakpoint = new vscode.SourceBreakpoint(
        createBreakpointLocation('/test.js', 1),
        false,
        'mutate()'
      );
      vscode.debug.breakpoints = [breakpoint];
      const server = {
        elicitInput: vi.fn(async () => {
          vscode.debug.breakpoints = [
            new vscode.SourceBreakpoint(
              createBreakpointLocation('/test.js', 1),
              false,
              'otherMutation()'
            ),
            breakpoint,
          ];
          return { action: 'accept', content: { decision: 'allow_once' } };
        }),
      } as any;
      const result = await toolRouter.routeToolCall(TOOL_NAMES.toggleBreakpoint, location, server);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Breakpoint changed');
      expect(mockToolRegistry.breakpoints.toggleBreakpoint).not.toHaveBeenCalled();
    });

    it.each([
      { condition: '(x=7)' },
      { hitCondition: 'doSideEffect()' },
      { logMessage: 'value: {[1].map(x => (y=7))}' },
      { logMessage: '{obj.getName()} {doSideEffect()}' },
      { logMessage: '{JSON.stringify({value: doSideEffect()})}' },
    ])('should block risky breakpoint fields without elicitation: %j', async (fields) => {
      const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
        ...location,
        ...fields,
      });
      expect(result.success).toBe(false);
      expect(mockToolRegistry.breakpoints.setBreakpoint).not.toHaveBeenCalled();
    });

    it('should ask about persistent use and install only after every field is approved', async () => {
      const args = { ...location, condition: 'doSideEffect()', logMessage: '{otherSideEffect()}' };
      const server = {
        elicitInput: vi
          .fn()
          .mockResolvedValue({ action: 'accept', content: { decision: 'allow_once' } }),
      } as any;
      const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, args, server);
      expect(result.success).toBe(true);
      expect(server.elicitInput).toHaveBeenCalledTimes(2);
      expect(server.elicitInput).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('future debug sessions'),
          requestedSchema: expect.objectContaining({
            properties: expect.objectContaining({
              decision: expect.objectContaining({
                oneOf: [
                  { const: 'allow_once', title: 'Create breakpoint' },
                  { const: 'deny', title: 'Deny' },
                ],
              }),
            }),
          }),
        })
      );
      expect(mockToolRegistry.breakpoints.setBreakpoint).toHaveBeenCalledWith(args);
    });

    it('should leave breakpoints untouched if a later expression is denied', async () => {
      const server = {
        elicitInput: vi
          .fn()
          .mockResolvedValueOnce({ action: 'accept', content: { decision: 'allow_once' } })
          .mockResolvedValueOnce({ action: 'decline' }),
      } as any;
      const result = await toolRouter.routeToolCall(
        TOOL_NAMES.setBreakpoint,
        { ...location, condition: 'mutate()', logMessage: '{mutateAgain()}' },
        server
      );
      expect(result.success).toBe(false);
      expect(mockToolRegistry.breakpoints.setBreakpoint).not.toHaveBeenCalled();
    });

    it('should not reuse evaluation session approvals for persistent breakpoints', async () => {
      const session = createMockDebugSession();
      vscode.debug.activeDebugSession = session;
      (toolRouter as any).expressionValidator.allowExpressionForSession('mutate()', session);
      const server = { elicitInput: vi.fn().mockResolvedValue({ action: 'decline' }) } as any;
      const result = await toolRouter.routeToolCall(
        TOOL_NAMES.setBreakpoint,
        { ...location, condition: 'mutate()' },
        server
      );
      expect(result.success).toBe(false);
      expect(server.elicitInput).toHaveBeenCalledOnce();
      expect(mockToolRegistry.breakpoints.setBreakpoint).not.toHaveBeenCalled();
    });

    it('should reject a session approval decision for persistent breakpoints', async () => {
      const server = {
        elicitInput: vi
          .fn()
          .mockResolvedValue({ action: 'accept', content: { decision: 'allow_session' } }),
      } as any;
      const result = await toolRouter.routeToolCall(
        TOOL_NAMES.setBreakpoint,
        { ...location, condition: 'mutate()' },
        server
      );
      expect(result.success).toBe(false);
      expect(mockToolRegistry.breakpoints.setBreakpoint).not.toHaveBeenCalled();
    });

    it('should allow safe conditions, hit counts, and log interpolation without approval', async () => {
      const args = {
        ...location,
        condition: 'user.id === 7',
        hitCondition: '> 10',
        logMessage: 'User {user.id}: {Math.max(a, b)}',
      };
      const server = { elicitInput: vi.fn() } as any;
      const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, args, server);
      expect(result.success).toBe(true);
      expect(server.elicitInput).not.toHaveBeenCalled();
      expect(mockToolRegistry.breakpoints.setBreakpoint).toHaveBeenCalledWith(args);
    });

    it('should require approval for persistent code execution in permissive mode', async () => {
      mockConfig(mockConfigManager, { expressionValidationLevel: 'permissive' });
      const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
        ...location,
        condition: 'eval("doSomething()")',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Code Execution');
      expect(mockToolRegistry.breakpoints.setBreakpoint).not.toHaveBeenCalled();
    });

    it('should respect explicitly disabled validation', async () => {
      mockConfig(mockConfigManager, { expressionValidationLevel: 'disabled' });
      const args = { ...location, condition: '(x=7)', logMessage: '{mutate()}' };
      const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, args);
      expect(result.success).toBe(true);
      expect(mockToolRegistry.breakpoints.setBreakpoint).toHaveBeenCalledWith(args);
    });

    it('should bound interpolated templates and leave long plain log text usable', async () => {
      const server = { elicitInput: vi.fn() } as any;
      const result = await toolRouter.routeToolCall(
        TOOL_NAMES.setBreakpoint,
        { ...location, logMessage: 'x'.repeat(100) + '{user.id}' },
        server
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum allowed length');
      expect(server.elicitInput).not.toHaveBeenCalled();
      expect(mockToolRegistry.breakpoints.setBreakpoint).not.toHaveBeenCalled();
      const plainLog = { ...location, logMessage: 'x'.repeat(150) };
      const plainResult = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, plainLog);
      expect(plainResult.success).toBe(true);
      expect(mockToolRegistry.breakpoints.setBreakpoint).toHaveBeenCalledWith(plainLog);
    });
  });

  describe('getToolSchemas', () => {
    it('should return common tools in assisted mode', () => {
      // Default is assisted mode
      const schemas = toolRouter.getToolSchemas();

      // Should include breakpoint and inspection tools
      const toolNames = schemas.map((s: any) => s.name);
      expect(toolNames).toContain(TOOL_NAMES.setBreakpoint);
      expect(toolNames).toContain(TOOL_NAMES.listBreakpoints);
      expect(toolNames).toContain(TOOL_NAMES.getVariables);
      expect(toolNames).toContain(TOOL_NAMES.evaluateExpression);
      expect(toolNames).toContain(TOOL_NAMES.getDebugState);

      // Should NOT include full automation tools
      expect(toolNames).not.toContain(TOOL_NAMES.startDebugging);
      expect(toolNames).not.toContain(TOOL_NAMES.stopDebugging);
      expect(toolNames).not.toContain(TOOL_NAMES.continueExecution);
    });

    it('should return all tools in full automation mode', () => {
      // Override config to full automation
      vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      const schemas = toolRouter.getToolSchemas();
      const toolNames = schemas.map((s: any) => s.name);

      // Should include all tools
      expect(toolNames).toContain(TOOL_NAMES.setBreakpoint);
      expect(toolNames).toContain(TOOL_NAMES.startDebugging);
      expect(toolNames).toContain(TOOL_NAMES.stopDebugging);
      expect(toolNames).toContain(TOOL_NAMES.continueExecution);
      expect(toolNames).toContain(TOOL_NAMES.pause);
      expect(toolNames).toContain(TOOL_NAMES.restart);
      expect(toolNames).toContain(TOOL_NAMES.waitForBreakpoint);
    });

    it('should include step operations when enabled', () => {
      vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: true,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      const schemas = toolRouter.getToolSchemas();
      const toolNames = schemas.map((s: any) => s.name);

      expect(toolNames).toContain(TOOL_NAMES.stepOver);
      expect(toolNames).toContain(TOOL_NAMES.stepInto);
      expect(toolNames).toContain(TOOL_NAMES.stepOut);
    });

    it('should not include step operations when disabled', () => {
      vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      const schemas = toolRouter.getToolSchemas();
      const toolNames = schemas.map((s: any) => s.name);

      expect(toolNames).not.toContain(TOOL_NAMES.stepOver);
      expect(toolNames).not.toContain(TOOL_NAMES.stepInto);
      expect(toolNames).not.toContain(TOOL_NAMES.stepOut);
    });
  });

  describe('routeToolCall', () => {
    describe('Breakpoint Tools', () => {
      it('should route set_breakpoint correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          filePath: '/test/file.js',
          line: 10,
        });

        expect(mockToolRegistry.breakpoints.setBreakpoint).toHaveBeenCalledWith({
          filePath: '/test/file.js',
          line: 10,
        });
        expect(result.success).toBe(true);
      });

      it('should route remove_breakpoint correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.removeBreakpoint, {
          filePath: '/test/file.js',
          line: 10,
        });

        expect(mockToolRegistry.breakpoints.removeBreakpoint).toHaveBeenCalledWith({
          filePath: '/test/file.js',
          line: 10,
        });
        expect(result.success).toBe(true);
      });

      it('should route list_breakpoints correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.listBreakpoints, {});

        expect(mockToolRegistry.breakpoints.listBreakpoints).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route toggle_breakpoint correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.toggleBreakpoint, {
          filePath: '/test/file.js',
          line: 10,
        });

        expect(mockToolRegistry.breakpoints.toggleBreakpoint).toHaveBeenCalledWith({
          filePath: '/test/file.js',
          line: 10,
        });
        expect(result.success).toBe(true);
      });

      it('should route inspect_breakpoint correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.inspectBreakpoint, {
          filePath: '/test/file.js',
          line: 10,
        });

        expect(mockToolRegistry.breakpoints.inspectBreakpoint).toHaveBeenCalledWith({
          filePath: '/test/file.js',
          line: 10,
        });
        expect(result.success).toBe(true);
      });

      it('should route remove_all_breakpoints correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.removeAllBreakpoints, {});

        expect(mockToolRegistry.breakpoints.removeAllBreakpoints).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });
    });

    describe('Inspection Tools', () => {
      it('should route get_variables correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getVariables, {});

        expect(mockToolRegistry.inspection.getVariables).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route get_variables with scope filter', async () => {
        await toolRouter.routeToolCall(TOOL_NAMES.getVariables, { scope: 'Locals' });

        expect(mockToolRegistry.inspection.getVariables).toHaveBeenCalledWith({
          scope: 'Locals',
        });
      });

      it('should route get_call_stack correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getCallStack, {});

        expect(mockToolRegistry.inspection.getCallStack).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route evaluate_expression correctly', async () => {
        mockConfig(mockConfigManager, {
          expressionValidationLevel: 'disabled',
        });

        const result = await toolRouter.routeToolCall(TOOL_NAMES.evaluateExpression, {
          expression: 'myVar',
        });

        expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledWith({
          expression: 'myVar',
        });
        expect(result.success).toBe(true);
      });

      it('should bypass validation flow when disabled even if server is provided', async () => {
        mockConfig(mockConfigManager, {
          expressionValidationLevel: 'disabled',
        });

        const server = { elicitInput: vi.fn() } as any;

        await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'myVar' },
          server
        );

        expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledWith({
          expression: 'myVar',
        });
        expect(server.elicitInput).not.toHaveBeenCalled();
      });

      it('should execute immediately when expression validation allows it', async () => {
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: true,
          riskLevel: 'low',
          reason: 'Safe read-only expression',
        });

        const server = { elicitInput: vi.fn() } as any;

        await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'user.id' },
          server
        );

        expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledWith({
          expression: 'user.id',
        });
        expect(server.elicitInput).not.toHaveBeenCalled();
      });

      it('should execute without elicitation when risk is below threshold', async () => {
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: false,
          riskLevel: 'medium',
          reason: 'Unknown function call',
        });
        vi.spyOn(expressionValidator, 'shouldElicit').mockReturnValue(false);

        const server = { elicitInput: vi.fn() } as any;

        await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'maybeSafe()' },
          server
        );

        expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledWith({
          expression: 'maybeSafe()',
        });
        expect(server.elicitInput).not.toHaveBeenCalled();
      });

      it('should execute with warning when user allows once', async () => {
        vscode.debug.activeDebugSession = createMockDebugSession();
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: false,
          riskLevel: 'high',
          reason: 'Potential side effects',
        });
        vi.spyOn(expressionValidator, 'shouldElicit').mockReturnValue(true);
        vi.spyOn(expressionValidator, 'formatElicitationMessage').mockReturnValue(
          'This expression may have side effects.'
        );

        const server = {
          elicitInput: vi.fn().mockResolvedValue({
            action: 'accept',
            content: { decision: 'allow_once' },
          }),
        } as any;

        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'mutateState()' },
          server
        );

        expect(server.elicitInput).toHaveBeenCalledTimes(1);
        // Elicitation offers an enum decision (allow once / allow session / deny)
        expect(server.elicitInput).toHaveBeenCalledWith(
          expect.objectContaining({
            requestedSchema: expect.objectContaining({
              properties: expect.objectContaining({
                decision: expect.objectContaining({
                  oneOf: [
                    { const: 'allow_once', title: 'Allow once' },
                    { const: 'allow_session', title: 'Always allow for this debug session' },
                    { const: 'deny', title: 'Deny' },
                  ],
                }),
              }),
            }),
          })
        );
        expect(result).toMatchObject({
          success: true,
          _warning: 'Expression executed with user approval despite validation failure',
        });
      });

      it('should register session approval when user chooses always allow', async () => {
        const session = createMockDebugSession();
        vscode.debug.activeDebugSession = session;
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: false,
          riskLevel: 'high',
          reason: 'Potential side effects',
        });
        vi.spyOn(expressionValidator, 'shouldElicit').mockReturnValue(true);
        const allowSpy = vi.spyOn(expressionValidator, 'allowExpressionForSession');

        const server = {
          elicitInput: vi.fn().mockResolvedValue({
            action: 'accept',
            content: { decision: 'allow_session' },
          }),
        } as any;

        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'mutateState()' },
          server
        );

        expect(allowSpy).toHaveBeenCalledWith('mutateState()', session);
        expect(result).toMatchObject({
          success: true,
          _warning:
            'Expression executed and approved for the rest of this debug session despite validation failure',
        });
      });

      it('should treat accept with deny decision as declined', async () => {
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: false,
          riskLevel: 'high',
          reason: 'Potential side effects',
        });
        vi.spyOn(expressionValidator, 'shouldElicit').mockReturnValue(true);
        vi.spyOn(expressionValidator, 'formatElicitationMessage').mockReturnValue(
          'This expression may have side effects.'
        );

        const server = {
          elicitInput: vi.fn().mockResolvedValue({
            action: 'accept',
            content: { decision: 'deny' },
          }),
        } as any;

        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'mutateState()' },
          server
        );

        expect(result).toEqual({
          success: false,
          error: 'Expression validation failed: Potential side effects. User declined to proceed.',
        });
        expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
      });

      it('should skip elicitation for expressions approved for the session', async () => {
        const session = createMockDebugSession();
        (vscode.debug as any).activeDebugSession = session;

        const server = {
          elicitInput: vi.fn().mockResolvedValue({
            action: 'accept',
            content: { decision: 'allow_session' },
          }),
        } as any;

        // 'foo.customFn()' fails validation (unknown function) at moderate level
        const first = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'foo.customFn()' },
          server
        );

        expect(first.success).toBe(true);
        expect(server.elicitInput).toHaveBeenCalledTimes(1);

        // Second call with the same expression is allowed without elicitation
        const second = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'foo.customFn()' },
          server
        );

        expect(second.success).toBe(true);
        expect(server.elicitInput).toHaveBeenCalledTimes(1);
        expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledTimes(2);
      });

      it('should report declined elicitation without executing the expression', async () => {
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: false,
          riskLevel: 'high',
          reason: 'Potential side effects',
        });
        vi.spyOn(expressionValidator, 'shouldElicit').mockReturnValue(true);
        vi.spyOn(expressionValidator, 'formatElicitationMessage').mockReturnValue(
          'This expression may have side effects.'
        );

        const server = {
          elicitInput: vi.fn().mockResolvedValue({
            action: 'decline',
          }),
        } as any;

        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'mutateState()' },
          server
        );

        expect(result).toEqual({
          success: false,
          error: 'Expression validation failed: Potential side effects. User declined to proceed.',
        });
        expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
      });

      it('should report cancelled elicitation without executing the expression', async () => {
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: false,
          riskLevel: 'high',
          reason: 'Potential side effects',
        });
        vi.spyOn(expressionValidator, 'shouldElicit').mockReturnValue(true);
        vi.spyOn(expressionValidator, 'formatElicitationMessage').mockReturnValue(
          'This expression may have side effects.'
        );

        const server = {
          elicitInput: vi.fn().mockResolvedValue({
            action: 'cancel',
          }),
        } as any;

        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'mutateState()' },
          server
        );

        expect(result).toEqual({
          success: false,
          error: 'Expression evaluation cancelled by user.',
        });
        expect(mockToolRegistry.inspection.evaluateExpression).not.toHaveBeenCalled();
      });

      it('should fall back to validation failure details when elicitation is unavailable', async () => {
        const expressionValidator = (toolRouter as any).expressionValidator;
        vi.spyOn(expressionValidator, 'validateExpression').mockReturnValue({
          allowed: false,
          riskLevel: 'high',
          reason: 'Potential side effects',
        });
        vi.spyOn(expressionValidator, 'shouldElicit').mockReturnValue(true);
        vi.spyOn(expressionValidator, 'formatElicitationMessage').mockReturnValue(
          'This expression may have side effects.'
        );

        const warnSpy = vi.spyOn((toolRouter as any).logger, 'warn');
        const server = {
          elicitInput: vi.fn().mockRejectedValue(new Error('Client does not support elicitation')),
        } as any;

        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'mutateState()' },
          server
        );

        expect(result).toEqual({
          success: false,
          error:
            'This expression may have side effects.\n\nClient does not support user confirmation (elicitation). To allow this expression, set debugssy.expressionValidationLevel to "disabled" in settings.',
          validationFailure: {
            reason: 'Potential side effects',
            riskLevel: 'high',
            expression: 'mutateState()',
          },
        });
        expect(warnSpy).toHaveBeenCalledWith(
          'Elicitation failed, blocking expression:',
          'Client does not support elicitation'
        );
      });

      it('should route get_threads correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getThreads, {});

        expect(mockToolRegistry.inspection.getThreads).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route get_debug_state correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getDebugState, {});

        expect(mockToolRegistry.inspection.getDebugState).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route get_console_output correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getConsoleOutput, {});

        expect(mockToolRegistry.inspection.getConsoleOutput).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route clear_console_output correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.clearConsoleOutput, {});

        expect(mockToolRegistry.inspection.clearConsoleOutput).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });
    });

    describe('Debug Control Tools', () => {
      beforeEach(() => {
        mockConfig(mockConfigManager, {
          automationLevel: 'full',
          allowStepOperations: true,
        });
      });

      it('should route start_debugging correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.startDebugging, {
          name: 'Launch Program',
        });

        expect(mockToolRegistry.debugControl.startDebugging).toHaveBeenCalledWith({
          name: 'Launch Program',
        });
        expect(result.success).toBe(true);
      });

      it('should route stop_debugging correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stopDebugging, {});

        expect(mockToolRegistry.debugControl.stopDebugging).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route continue correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.continueExecution, {});

        expect(mockToolRegistry.debugControl.continueExecution).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route pause correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.pause, {});

        expect(mockToolRegistry.debugControl.pause).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route restart correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.restart, {});

        expect(mockToolRegistry.debugControl.restart).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route step_over correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stepOver, {});

        expect(mockToolRegistry.debugControl.stepOver).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route step_into correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stepInto, {});

        expect(mockToolRegistry.debugControl.stepInto).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should route step_out correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stepOut, {});

        expect(mockToolRegistry.debugControl.stepOut).toHaveBeenCalledWith({});
        expect(result.success).toBe(true);
      });

      it('should reject full automation tools in assisted mode even if called directly', async () => {
        mockConfig(mockConfigManager, {
          automationLevel: 'assisted',
          allowStepOperations: true,
        });

        await expect(toolRouter.routeToolCall(TOOL_NAMES.stopDebugging, {})).rejects.toThrow(
          /requires 'full' automation level/i
        );
      });

      it('should reject step operations when disabled', async () => {
        mockConfig(mockConfigManager, {
          automationLevel: 'full',
          allowStepOperations: false,
        });

        await expect(toolRouter.routeToolCall(TOOL_NAMES.stepOver, {})).rejects.toThrow(
          /step operation 'step_over' is disabled/i
        );
      });
    });

    describe('Error Handling', () => {
      it('should throw error for unknown tool', async () => {
        await expect(toolRouter.routeToolCall('unknown_tool', {})).rejects.toThrow(
          'Unknown tool: unknown_tool'
        );
      });

      it('should propagate errors from tool handlers', async () => {
        const error = new Error('Tool failed');
        (mockToolRegistry.breakpoints.setBreakpoint as any).mockRejectedValue(error);

        await expect(
          toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
            filePath: '/test.js',
            line: 1,
          })
        ).rejects.toThrow('Tool failed');
      });
    });

    describe('End-to-end argument forwarding', () => {
      it('should forward all arguments and return handler result unchanged', async () => {
        const handlerResult = {
          success: true,
          message: 'Breakpoint set at /app/main.ts:42',
          data: {
            breakpoint: {
              id: 'bp-123',
              filePath: '/app/main.ts',
              line: 42,
              condition: 'x > 10',
            },
          },
        };
        (mockToolRegistry.breakpoints.setBreakpoint as any).mockResolvedValue(handlerResult);

        const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          filePath: '/app/main.ts',
          line: 42,
          condition: 'x > 10',
        });

        expect(result).toEqual(handlerResult);
        expect((result as any).data?.breakpoint?.id).toBe('bp-123');
        expect((result as any).data?.breakpoint?.condition).toBe('x > 10');
      });

      it('should pass through handler failure result without masking it', async () => {
        const handlerResult = {
          success: false,
          error: 'No active debug session',
        };
        (mockToolRegistry.inspection.getVariables as any).mockResolvedValue(handlerResult);

        const result = await toolRouter.routeToolCall(TOOL_NAMES.getVariables, {
          scope: 'Locals',
        });

        expect(result).toEqual(handlerResult);
        expect(result.success).toBe(false);
        expect(result.error).toBe('No active debug session');
      });

      it('should route multiple sequential calls independently', async () => {
        (mockToolRegistry.breakpoints.listBreakpoints as any).mockResolvedValue({
          success: true,
          data: {
            breakpoints: [{ id: 'bp-1' }],
          },
        });
        (mockToolRegistry.inspection.getDebugState as any).mockResolvedValue({
          success: true,
          data: {
            state: 'paused',
          },
        });

        const bpResult = await toolRouter.routeToolCall(TOOL_NAMES.listBreakpoints, {});
        const stateResult = await toolRouter.routeToolCall(TOOL_NAMES.getDebugState, {});

        expect((bpResult as any).data?.breakpoints).toEqual([{ id: 'bp-1' }]);
        expect((stateResult as any).data?.state).toBe('paused');
        expect(mockToolRegistry.breakpoints.listBreakpoints).toHaveBeenCalledTimes(1);
        expect(mockToolRegistry.inspection.getDebugState).toHaveBeenCalledTimes(1);
      });

      it('should reject concurrent calls with different invalid args independently', async () => {
        const call1 = toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          filePath: '/test.js',
          line: -1,
        });
        const call2 = toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          filePath: '/test2.js',
          line: -2,
        });

        await expect(call1).rejects.toThrow(/line/i);
        await expect(call2).rejects.toThrow(/line/i);
      });

      it('should handle tool name as exact match not substring', async () => {
        await expect(toolRouter.routeToolCall('set_breakpoint_extra', {})).rejects.toThrow(
          /Unknown tool/i
        );
      });
    });
  });

  describe('Input Validation', () => {
    it('should reject set_breakpoint with missing filePath', async () => {
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          line: 10,
        })
      ).rejects.toThrow(/filePath/i);
    });

    it('should reject set_breakpoint with missing line', async () => {
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          filePath: '/test/file.js',
        })
      ).rejects.toThrow(/line/i);
    });

    it('should reject set_breakpoint with invalid line number', async () => {
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          filePath: '/test/file.js',
          line: -1,
        })
      ).rejects.toThrow(/line/i);
    });

    it('should reject inspect_breakpoint with missing line', async () => {
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.inspectBreakpoint, {
          filePath: '/test/file.js',
        })
      ).rejects.toThrow(/line/i);
    });

    it('should reject evaluate_expression with empty expression', async () => {
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.evaluateExpression, {
          expression: '',
        })
      ).rejects.toThrow(/expression/i);
    });

    it('should reject start_debugging without name or configuration', async () => {
      mockConfig(mockConfigManager, {
        automationLevel: 'full',
      });

      await expect(toolRouter.routeToolCall(TOOL_NAMES.startDebugging, {})).rejects.toThrow(
        /name|configuration/i
      );
    });

    it('should accept set_breakpoint with optional parameters', async () => {
      await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
        filePath: '/test/file.js',
        line: 10,
        condition: 'x > 5',
        hitCondition: '3',
        logMessage: 'Hit breakpoint',
      });

      expect(mockToolRegistry.breakpoints.setBreakpoint).toHaveBeenCalledWith({
        filePath: '/test/file.js',
        line: 10,
        condition: 'x > 5',
        hitCondition: '3',
        logMessage: 'Hit breakpoint',
      });
    });

    it('should accept get_console_output with all optional parameters', async () => {
      await toolRouter.routeToolCall(TOOL_NAMES.getConsoleOutput, {
        category: 'stdout',
        limit: 50,
        since: 1234567890,
        clear: true,
      });

      expect(mockToolRegistry.inspection.getConsoleOutput).toHaveBeenCalledWith({
        category: 'stdout',
        limit: 50,
        since: 1234567890,
        clear: true,
      });
    });

    it('should reject get_console_output with invalid category', async () => {
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.getConsoleOutput, {
          category: 'invalid_category',
        })
      ).rejects.toThrow(/category/i);
    });
  });

  describe('wait_for_breakpoint', () => {
    it('should pass automation level to waitForBreakpoint', async () => {
      mockConfig(mockConfigManager, {
        automationLevel: 'full',
      });

      await toolRouter.routeToolCall(TOOL_NAMES.waitForBreakpoint, {});

      expect(mockToolRegistry.inspection.waitForBreakpoint).toHaveBeenCalledWith({
        timeout: undefined,
        automationLevel: 'full',
      });
    });

    it('should pass custom timeout to waitForBreakpoint', async () => {
      mockConfig(mockConfigManager, {
        automationLevel: 'full',
      });

      await toolRouter.routeToolCall(TOOL_NAMES.waitForBreakpoint, { timeout: 10000 });

      expect(mockToolRegistry.inspection.waitForBreakpoint).toHaveBeenCalledWith({
        timeout: 10000,
        automationLevel: 'full',
      });
    });

    it('should reject unbounded per-call timeouts', async () => {
      mockConfig(mockConfigManager, { automationLevel: 'full' });
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.waitForBreakpoint, { timeout: 300001 })
      ).rejects.toThrow('Invalid arguments');
    });

    it('should forward MCP cancellation to waitForBreakpoint', async () => {
      mockConfig(mockConfigManager, { automationLevel: 'full' });
      const controller = new AbortController();

      await toolRouter.routeToolCall(
        TOOL_NAMES.waitForBreakpoint,
        {},
        undefined,
        controller.signal
      );

      expect(mockToolRegistry.inspection.waitForBreakpoint).toHaveBeenCalledWith({
        timeout: undefined,
        automationLevel: 'full',
        signal: controller.signal,
      });
    });
  });

  describe('dispose', () => {
    it('should dispose without errors', () => {
      expect(() => toolRouter.dispose()).not.toThrow();
    });

    it('should dispose expression validator', () => {
      // Dispose should clean up internal resources
      toolRouter.dispose();
      // Further calls should still work (defensive programming)
      expect(() => toolRouter.getToolSchemas()).not.toThrow();
    });
  });
});
