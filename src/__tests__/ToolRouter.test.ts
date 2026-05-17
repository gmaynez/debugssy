// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToolRouter } from '../routing/ToolRouter';
import type { ToolRegistry } from '../tools';
import { ConfigManager } from '../Config';
import { TOOL_NAMES } from '../routing/toolNames';
import './setup';

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

      it('should execute with warning when user accepts elicitation', async () => {
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
            content: { understood: true },
          }),
        } as any;

        const result = await toolRouter.routeToolCall(
          TOOL_NAMES.evaluateExpression,
          { expression: 'mutateState()' },
          server
        );

        expect(server.elicitInput).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
          success: true,
          _warning: 'Expression executed with user approval despite validation failure',
        });
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
          breakpoint: {
            id: 'bp-123',
            filePath: '/app/main.ts',
            line: 42,
            condition: 'x > 10',
          },
        };
        (mockToolRegistry.breakpoints.setBreakpoint as any).mockResolvedValue(handlerResult);

        const result = await toolRouter.routeToolCall(TOOL_NAMES.setBreakpoint, {
          filePath: '/app/main.ts',
          line: 42,
          condition: 'x > 10',
        });

        expect(result).toEqual(handlerResult);
        expect(result.breakpoint?.id).toBe('bp-123');
        expect(result.breakpoint?.condition).toBe('x > 10');
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
          breakpoints: [{ id: 'bp-1' }],
        });
        (mockToolRegistry.inspection.getDebugState as any).mockResolvedValue({
          success: true,
          state: 'paused',
        });

        const bpResult = await toolRouter.routeToolCall(TOOL_NAMES.listBreakpoints, {});
        const stateResult = await toolRouter.routeToolCall(TOOL_NAMES.getDebugState, {});

        expect(bpResult.breakpoints).toEqual([{ id: 'bp-1' }]);
        expect(stateResult.state).toBe('paused');
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
