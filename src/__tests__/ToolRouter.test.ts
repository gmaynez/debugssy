// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToolRouter } from '../routing/ToolRouter';
import type { ToolRegistry } from '../tools';
import { ConfigManager } from '../Config';
import { TOOL_NAMES } from '../routing/toolNames';
import './setup';

// Mock ToolRegistry
function createMockToolRegistry(): ToolRegistry {
  return {
    breakpoints: {
      setBreakpoint: vi.fn().mockResolvedValue({ success: true, message: 'Breakpoint set' }),
      removeBreakpoint: vi.fn().mockResolvedValue({ success: true, message: 'Breakpoint removed' }),
      listBreakpoints: vi.fn().mockResolvedValue({ success: true, breakpoints: [] }),
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

        expect(mockToolRegistry.breakpoints.removeBreakpoint).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route list_breakpoints correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.listBreakpoints, {});

        expect(mockToolRegistry.breakpoints.listBreakpoints).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route toggle_breakpoint correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.toggleBreakpoint, {
          filePath: '/test/file.js',
          line: 10,
        });

        expect(mockToolRegistry.breakpoints.toggleBreakpoint).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route remove_all_breakpoints correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.removeAllBreakpoints, {});

        expect(mockToolRegistry.breakpoints.removeAllBreakpoints).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('Inspection Tools', () => {
      it('should route get_variables correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getVariables, {});

        expect(mockToolRegistry.inspection.getVariables).toHaveBeenCalled();
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

        expect(mockToolRegistry.inspection.getCallStack).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route evaluate_expression correctly', async () => {
        vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'assisted',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'disabled' as const,
        });

        const result = await toolRouter.routeToolCall(TOOL_NAMES.evaluateExpression, {
          expression: 'myVar',
        });

        expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledWith({
          expression: 'myVar',
        });
        expect(result.success).toBe(true);
      });

      it('should route get_threads correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getThreads, {});

        expect(mockToolRegistry.inspection.getThreads).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route get_debug_state correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getDebugState, {});

        expect(mockToolRegistry.inspection.getDebugState).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route get_console_output correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.getConsoleOutput, {});

        expect(mockToolRegistry.inspection.getConsoleOutput).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route clear_console_output correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.clearConsoleOutput, {});

        expect(mockToolRegistry.inspection.clearConsoleOutput).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('Debug Control Tools', () => {
      beforeEach(() => {
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
      });

      it('should route start_debugging correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.startDebugging, {
          name: 'Launch Program',
        });

        expect(mockToolRegistry.debugControl.startDebugging).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route stop_debugging correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stopDebugging, {});

        expect(mockToolRegistry.debugControl.stopDebugging).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route continue correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.continueExecution, {});

        expect(mockToolRegistry.debugControl.continueExecution).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route pause correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.pause, {});

        expect(mockToolRegistry.debugControl.pause).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route restart correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.restart, {});

        expect(mockToolRegistry.debugControl.restart).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route step_over correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stepOver, {});

        expect(mockToolRegistry.debugControl.stepOver).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route step_into correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stepInto, {});

        expect(mockToolRegistry.debugControl.stepInto).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route step_out correctly', async () => {
        const result = await toolRouter.routeToolCall(TOOL_NAMES.stepOut, {});

        expect(mockToolRegistry.debugControl.stepOut).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should reject full automation tools in assisted mode even if called directly', async () => {
        vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'assisted',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: true,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate' as const,
        });

        await expect(toolRouter.routeToolCall(TOOL_NAMES.stopDebugging, {})).rejects.toThrow(
          /requires 'full' automation level/i
        );
      });

      it('should reject step operations when disabled', async () => {
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

    it('should reject evaluate_expression with empty expression', async () => {
      await expect(
        toolRouter.routeToolCall(TOOL_NAMES.evaluateExpression, {
          expression: '',
        })
      ).rejects.toThrow(/expression/i);
    });

    it('should reject start_debugging without name or configuration', async () => {
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

      await toolRouter.routeToolCall(TOOL_NAMES.waitForBreakpoint, {});

      expect(mockToolRegistry.inspection.waitForBreakpoint).toHaveBeenCalledWith({
        timeout: undefined,
        automationLevel: 'full',
      });
    });

    it('should pass custom timeout to waitForBreakpoint', async () => {
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
