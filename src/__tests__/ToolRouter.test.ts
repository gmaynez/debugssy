// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ToolRouter } from '../routing/ToolRouter';
import type { ToolRegistry } from '../tools';
import { ConfigManager } from '../Config';
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
      expect(toolNames).toContain('set_breakpoint');
      expect(toolNames).toContain('list_breakpoints');
      expect(toolNames).toContain('get_variables');
      expect(toolNames).toContain('evaluate_expression');
      expect(toolNames).toContain('get_debug_state');

      // Should NOT include full automation tools
      expect(toolNames).not.toContain('start_debugging');
      expect(toolNames).not.toContain('stop_debugging');
      expect(toolNames).not.toContain('continue');
    });

    it('should return all tools in full automation mode', () => {
      // Override config to full automation
      vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      const schemas = toolRouter.getToolSchemas();
      const toolNames = schemas.map((s: any) => s.name);

      // Should include all tools
      expect(toolNames).toContain('set_breakpoint');
      expect(toolNames).toContain('start_debugging');
      expect(toolNames).toContain('stop_debugging');
      expect(toolNames).toContain('continue');
      expect(toolNames).toContain('pause');
      expect(toolNames).toContain('restart');
      expect(toolNames).toContain('wait_for_breakpoint');
    });

    it('should include step operations when enabled', () => {
      vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      const schemas = toolRouter.getToolSchemas();
      const toolNames = schemas.map((s: any) => s.name);

      expect(toolNames).toContain('step_over');
      expect(toolNames).toContain('step_into');
      expect(toolNames).toContain('step_out');
    });

    it('should not include step operations when disabled', () => {
      vi.spyOn(mockConfigManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      const schemas = toolRouter.getToolSchemas();
      const toolNames = schemas.map((s: any) => s.name);

      expect(toolNames).not.toContain('step_over');
      expect(toolNames).not.toContain('step_into');
      expect(toolNames).not.toContain('step_out');
    });
  });

  describe('routeToolCall', () => {
    describe('Breakpoint Tools', () => {
      it('should route set_breakpoint correctly', async () => {
        const result = await toolRouter.routeToolCall('set_breakpoint', {
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
        const result = await toolRouter.routeToolCall('remove_breakpoint', {
          filePath: '/test/file.js',
          line: 10,
        });

        expect(mockToolRegistry.breakpoints.removeBreakpoint).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route list_breakpoints correctly', async () => {
        const result = await toolRouter.routeToolCall('list_breakpoints', {});

        expect(mockToolRegistry.breakpoints.listBreakpoints).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route toggle_breakpoint correctly', async () => {
        const result = await toolRouter.routeToolCall('toggle_breakpoint', {
          filePath: '/test/file.js',
          line: 10,
        });

        expect(mockToolRegistry.breakpoints.toggleBreakpoint).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route remove_all_breakpoints correctly', async () => {
        const result = await toolRouter.routeToolCall('remove_all_breakpoints', {});

        expect(mockToolRegistry.breakpoints.removeAllBreakpoints).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('Inspection Tools', () => {
      it('should route get_variables correctly', async () => {
        const result = await toolRouter.routeToolCall('get_variables', {});

        expect(mockToolRegistry.inspection.getVariables).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route get_variables with scope filter', async () => {
        await toolRouter.routeToolCall('get_variables', { scope: 'Locals' });

        expect(mockToolRegistry.inspection.getVariables).toHaveBeenCalledWith({
          scope: 'Locals',
        });
      });

      it('should route get_call_stack correctly', async () => {
        const result = await toolRouter.routeToolCall('get_call_stack', {});

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
          maxExpressionLength: 100,
          expressionValidationLevel: 'disabled' as const,
        });

        const result = await toolRouter.routeToolCall('evaluate_expression', {
          expression: 'myVar',
        });

        expect(mockToolRegistry.inspection.evaluateExpression).toHaveBeenCalledWith({
          expression: 'myVar',
        });
        expect(result.success).toBe(true);
      });

      it('should route get_threads correctly', async () => {
        const result = await toolRouter.routeToolCall('get_threads', {});

        expect(mockToolRegistry.inspection.getThreads).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route get_debug_state correctly', async () => {
        const result = await toolRouter.routeToolCall('get_debug_state', {});

        expect(mockToolRegistry.inspection.getDebugState).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route get_console_output correctly', async () => {
        const result = await toolRouter.routeToolCall('get_console_output', {});

        expect(mockToolRegistry.inspection.getConsoleOutput).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route clear_console_output correctly', async () => {
        const result = await toolRouter.routeToolCall('clear_console_output', {});

        expect(mockToolRegistry.inspection.clearConsoleOutput).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });

    describe('Debug Control Tools', () => {
      it('should route start_debugging correctly', async () => {
        const result = await toolRouter.routeToolCall('start_debugging', {
          name: 'Launch Program',
        });

        expect(mockToolRegistry.debugControl.startDebugging).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route stop_debugging correctly', async () => {
        const result = await toolRouter.routeToolCall('stop_debugging', {});

        expect(mockToolRegistry.debugControl.stopDebugging).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route continue correctly', async () => {
        const result = await toolRouter.routeToolCall('continue', {});

        expect(mockToolRegistry.debugControl.continueExecution).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route pause correctly', async () => {
        const result = await toolRouter.routeToolCall('pause', {});

        expect(mockToolRegistry.debugControl.pause).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route restart correctly', async () => {
        const result = await toolRouter.routeToolCall('restart', {});

        expect(mockToolRegistry.debugControl.restart).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route step_over correctly', async () => {
        const result = await toolRouter.routeToolCall('step_over', {});

        expect(mockToolRegistry.debugControl.stepOver).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route step_into correctly', async () => {
        const result = await toolRouter.routeToolCall('step_into', {});

        expect(mockToolRegistry.debugControl.stepInto).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });

      it('should route step_out correctly', async () => {
        const result = await toolRouter.routeToolCall('step_out', {});

        expect(mockToolRegistry.debugControl.stepOut).toHaveBeenCalled();
        expect(result.success).toBe(true);
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
          toolRouter.routeToolCall('set_breakpoint', {
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
        toolRouter.routeToolCall('set_breakpoint', {
          line: 10,
        })
      ).rejects.toThrow(/filePath/i);
    });

    it('should reject set_breakpoint with missing line', async () => {
      await expect(
        toolRouter.routeToolCall('set_breakpoint', {
          filePath: '/test/file.js',
        })
      ).rejects.toThrow(/line/i);
    });

    it('should reject set_breakpoint with invalid line number', async () => {
      await expect(
        toolRouter.routeToolCall('set_breakpoint', {
          filePath: '/test/file.js',
          line: -1,
        })
      ).rejects.toThrow(/line/i);
    });

    it('should reject evaluate_expression with empty expression', async () => {
      await expect(
        toolRouter.routeToolCall('evaluate_expression', {
          expression: '',
        })
      ).rejects.toThrow(/expression/i);
    });

    it('should reject start_debugging without name or configuration', async () => {
      await expect(toolRouter.routeToolCall('start_debugging', {})).rejects.toThrow(
        /name|configuration/i
      );
    });

    it('should accept set_breakpoint with optional parameters', async () => {
      await toolRouter.routeToolCall('set_breakpoint', {
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
      await toolRouter.routeToolCall('get_console_output', {
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
        toolRouter.routeToolCall('get_console_output', {
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
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      await toolRouter.routeToolCall('wait_for_breakpoint', {});

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
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      await toolRouter.routeToolCall('wait_for_breakpoint', { timeout: 10000 });

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
