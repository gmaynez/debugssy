// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { PromptHandler } from '../routing/PromptHandler';
import { ConfigManager } from '../Config';
import {
  RESOURCE_RESPONSE_EXAMPLES,
  TOOL_RESPONSE_EXAMPLES,
  formatJsonExample,
} from '../routing/toolResponseExamples';

function getPromptText(result: GetPromptResult): string {
  const content = result.messages[0]?.content;
  return content?.type === 'text' ? content.text : '';
}

describe('PromptHandler', () => {
  let promptHandler: PromptHandler;
  let configManager: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = new ConfigManager();
    promptHandler = new PromptHandler(configManager);
  });

  describe('getPromptSchemas', () => {
    it('should return common prompts in assisted mode', () => {
      const schemas = promptHandler.getPromptSchemas();

      expect(schemas).toHaveLength(4);

      const promptNames = schemas.map((s: any) => s.name);
      expect(promptNames).toContain('debug-crash');
      expect(promptNames).toContain('trace-variable');
      expect(promptNames).toContain('inspect-function');
      expect(promptNames).toContain('debug-loop');

      const debugCrashPrompt = (schemas as any[]).find((s: any) => s.name === 'debug-crash');
      expect(debugCrashPrompt.description).toBe(
        'Debug a crash or exception by setting breakpoints and inspecting the call stack'
      );
      expect(debugCrashPrompt.arguments).toHaveLength(2);
      expect(debugCrashPrompt.arguments[0].name).toBe('errorMessage');
      expect(debugCrashPrompt.arguments[0].required).toBe(true);
      expect(debugCrashPrompt.arguments[1].name).toBe('filePath');
      expect(debugCrashPrompt.arguments[1].required).toBe(false);
    });

    it('should return all prompts in full automation mode', () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      const schemas = promptHandler.getPromptSchemas();

      expect(schemas).toHaveLength(5);

      const promptNames = schemas.map((s: any) => s.name);
      expect(promptNames).toContain('debug-crash');
      expect(promptNames).toContain('trace-variable');
      expect(promptNames).toContain('inspect-function');
      expect(promptNames).toContain('debug-loop');
      expect(promptNames).toContain('auto-debug-session');

      const autoDebugPrompt = (schemas as any[]).find((s: any) => s.name === 'auto-debug-session');
      expect(autoDebugPrompt.description).toContain('full automation mode only');
      expect(autoDebugPrompt.arguments).toHaveLength(2);
    });

    it('should include proper argument descriptions', () => {
      const schemas = promptHandler.getPromptSchemas();

      const traceVariablePrompt = (schemas as any[]).find((s: any) => s.name === 'trace-variable');
      expect(traceVariablePrompt.arguments).toHaveLength(3);

      const varNameArg = traceVariablePrompt.arguments.find((a: any) => a.name === 'variableName');
      expect(varNameArg.description).toBe('Name of the variable to trace');
      expect(varNameArg.required).toBe(true);

      const expectedValueArg = traceVariablePrompt.arguments.find(
        (a: any) => a.name === 'expectedValue'
      );
      expect(expectedValueArg.required).toBe(false);
    });
  });

  describe('generatePrompt', () => {
    describe('debug-crash', () => {
      it('should generate debug-crash prompt with all arguments', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'TypeError: Cannot read property "x" of undefined',
          filePath: '/src/app.js',
        });

        expect(result).toHaveProperty('messages');
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]?.role).toBe('user');
        expect(result.messages[0]?.content.type).toBe('text');
        expect(getPromptText(result)).toContain('TypeError');
        expect(getPromptText(result)).toContain('/src/app.js');
        expect(getPromptText(result)).toContain('STEP 1 - Set Breakpoint');
        expect(getPromptText(result)).toContain('STEP 2 - Start Debugging');
        expect(getPromptText(result)).toContain('STEP 3 - Verify Paused State');
        expect(getPromptText(result)).toContain('BEST PRACTICES');
      });

      it('should generate debug-crash prompt with only errorMessage', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'Error: Something went wrong',
        });

        expect(getPromptText(result)).toContain('Error: Something went wrong');
        expect(getPromptText(result)).not.toContain('in /path/to/file');
      });

      it('should include assisted mode instructions when in assisted mode', () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'assisted',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate' as const,
        });

        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'Test error',
        });

        // In assisted mode, user controls VS Code manually (F5)
        expect(getPromptText(result)).toContain('Start debugging in VS Code');
        expect(getPromptText(result)).toContain('press F5');
        // Should NOT include automation commands
        expect(getPromptText(result)).not.toContain('Call start_debugging');
      });

      it('should include full automation instructions when in full mode', () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate' as const,
        });

        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'Test error',
        });

        expect(getPromptText(result)).toContain('Call start_debugging');
        expect(getPromptText(result)).toContain('STEP 0 - Read Debug Configuration');
      });
    });

    describe('trace-variable', () => {
      it('should generate trace-variable prompt with all arguments', () => {
        const result = promptHandler.generatePrompt('trace-variable', {
          variableName: 'user',
          expectedValue: '{ id: 1, name: "test" }',
          actualValue: 'null',
        });

        expect(getPromptText(result)).toContain('"user"');
        expect(getPromptText(result)).toContain('expected: { id: 1, name: "test" }');
        expect(getPromptText(result)).toContain('but is actually null');
        expect(getPromptText(result)).toContain('STEP 1 - Identify Modification Points');
        expect(getPromptText(result)).toContain('STEP 3 - First Breakpoint');
      });

      it('should generate trace-variable prompt with only variableName', () => {
        const result = promptHandler.generatePrompt('trace-variable', {
          variableName: 'counter',
        });

        expect(getPromptText(result)).toContain('"counter"');
        expect(getPromptText(result)).not.toContain('expected:');
      });
    });

    describe('inspect-function', () => {
      it('should generate inspect-function prompt with all arguments', () => {
        const result = promptHandler.generatePrompt('inspect-function', {
          functionName: 'processData',
          filePath: '/src/utils.js',
          issue: 'Returns undefined for empty arrays',
        });

        expect(getPromptText(result)).toContain('processData');
        expect(getPromptText(result)).toContain('/src/utils.js');
        expect(getPromptText(result)).toContain('Issue: Returns undefined for empty arrays');
        expect(getPromptText(result)).toContain('STEP 1 - Set Breakpoint at Function Entry');
        expect(getPromptText(result)).toContain('STEP 4 - Inspect Input Parameters');
      });

      it('should generate inspect-function prompt without issue', () => {
        const result = promptHandler.generatePrompt('inspect-function', {
          functionName: 'calculate',
          filePath: '/src/math.js',
        });

        expect(getPromptText(result)).toContain('calculate');
        expect(getPromptText(result)).toContain('/src/math.js');
        expect(getPromptText(result)).not.toContain('Issue:');
      });
    });

    describe('debug-loop', () => {
      it('should generate debug-loop prompt with all arguments', () => {
        const result = promptHandler.generatePrompt('debug-loop', {
          loopLocation: 'src/array.js line 45',
          expectedIterations: 10,
        });

        expect(getPromptText(result)).toContain('src/array.js line 45');
        expect(getPromptText(result)).toContain('It should run 10 times');
        expect(getPromptText(result)).toContain('STEP 1 - Set Conditional Breakpoint');
        expect(getPromptText(result)).toContain('STEP 5 - Check Loop Condition');
      });

      it('should generate debug-loop prompt without expectedIterations', () => {
        const result = promptHandler.generatePrompt('debug-loop', {
          loopLocation: 'src/main.ts infinite loop',
        });

        expect(getPromptText(result)).toContain('src/main.ts infinite loop');
        expect(getPromptText(result)).not.toContain('It should run');
      });

      it('should include hitCondition example in prompt', () => {
        const result = promptHandler.generatePrompt('debug-loop', {
          loopLocation: 'src/test.js',
          expectedIterations: 10,
        });

        expect(getPromptText(result)).toContain('hitCondition');
        expect(getPromptText(result)).toContain('> 10');
      });
    });

    describe('auto-debug-session', () => {
      it('should generate auto-debug-session prompt with all arguments', () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate' as const,
        });

        const result = promptHandler.generatePrompt('auto-debug-session', {
          issue: 'Application crashes on startup',
          entryPoint: 'src/index.ts',
        });

        expect(getPromptText(result)).toContain('Application crashes on startup');
        expect(getPromptText(result)).toContain('starting from src/index.ts');
        expect(getPromptText(result)).toContain('FULL AUTOMATION MODE');
        expect(getPromptText(result)).toContain('STEP 1 - Find Debug Configuration');
        expect(getPromptText(result)).toContain('list_resources()');
        expect(getPromptText(result)).toContain('read_resource');
      });

      it('should throw error for auto-debug-session in assisted mode', () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'assisted',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate' as const,
        });

        expect(() =>
          promptHandler.generatePrompt('auto-debug-session', {
            issue: 'Test',
          })
        ).toThrow('auto-debug-session prompt requires full automation mode');
      });

      it('should generate auto-debug-session without entryPoint', () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate' as const,
        });

        const result = promptHandler.generatePrompt('auto-debug-session', {
          issue: 'Button click does nothing',
        });

        expect(getPromptText(result)).toContain('Button click does nothing');
        expect(getPromptText(result)).not.toContain('starting from');
      });
    });

    describe('Error Handling', () => {
      it('should throw error for unknown prompt', () => {
        expect(() => promptHandler.generatePrompt('unknown-prompt', {})).toThrow(
          'Unknown prompt: unknown-prompt'
        );
      });

      it('should validate required arguments', () => {
        expect(() => promptHandler.generatePrompt('debug-crash', {})).toThrow(/errorMessage/);
        expect(() => promptHandler.generatePrompt('trace-variable', {})).toThrow(/variableName/);
        expect(() =>
          promptHandler.generatePrompt('inspect-function', {
            functionName: 'test',
          })
        ).toThrow(/filePath/);
        expect(() => promptHandler.generatePrompt('debug-loop', {})).toThrow(/loopLocation/);
      });

      it('should validate argument types with Zod', () => {
        expect(() =>
          promptHandler.generatePrompt('debug-loop', {
            loopLocation: 'test',
            expectedIterations: 'not a number',
          })
        ).toThrow(/expectedIterations/);
      });
    });

    describe('Prompt Content Structure', () => {
      it('should include best practices prefix in all prompts', () => {
        const prompts = ['debug-crash', 'trace-variable', 'inspect-function', 'debug-loop'];

        prompts.forEach((promptName) => {
          const result = promptHandler.generatePrompt(promptName, {
            errorMessage: 'test',
            variableName: 'test',
            functionName: 'test',
            filePath: '/test.js',
            loopLocation: 'test',
          } as any);

          expect(getPromptText(result)).toContain('DEBUGGING BEST PRACTICES');
          expect(getPromptText(result)).toContain('ALWAYS call get_debug_state FIRST');
        });
      });

      it('should include tool usage examples', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'test',
        });

        expect(getPromptText(result)).toContain('set_breakpoint');
        expect(getPromptText(result)).toContain('get_call_stack');
        expect(getPromptText(result)).toContain('get_variables');
        expect(getPromptText(result)).toContain('evaluate_expression');
      });

      it('should include error recovery guidance', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'test',
        });

        expect(getPromptText(result)).toContain('COMMON ISSUES');
        expect(getPromptText(result)).toContain('No active debug session');
        expect(getPromptText(result)).toContain('Execution not paused');
      });

      it('should include tool response patterns', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'test',
        });

        expect(getPromptText(result)).toContain(
          formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused)
        );
        expect(getPromptText(result)).toContain(
          formatJsonExample(TOOL_RESPONSE_EXAMPLES.getVariablesLocalScope)
        );
        expect(getPromptText(result)).toContain(
          formatJsonExample(TOOL_RESPONSE_EXAMPLES.getCallStack)
        );
      });

      it('should include shared resource response examples in full automation prompts', () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          minifyResponses: true,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate' as const,
        });

        const result = promptHandler.generatePrompt('auto-debug-session', {
          issue: 'test',
        });

        expect(getPromptText(result)).toContain(
          formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.listResources)
        );
        expect(getPromptText(result)).toContain(
          formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.readLaunchJson)
        );
      });
    });
  });
});
