// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PromptHandler } from '../routing/PromptHandler';
import { ConfigManager } from '../Config';
import {
  RESOURCE_RESPONSE_EXAMPLES,
  TOOL_RESPONSE_EXAMPLES,
  formatJsonExample,
} from '../routing/toolResponseExamples';

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

      const debugCrashPrompt = schemas.find((s: any) => s.name === 'debug-crash');
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

      const autoDebugPrompt = schemas.find((s: any) => s.name === 'auto-debug-session');
      expect(autoDebugPrompt.description).toContain('full automation mode only');
      expect(autoDebugPrompt.arguments).toHaveLength(2);
    });

    it('should include proper argument descriptions', () => {
      const schemas = promptHandler.getPromptSchemas();

      const traceVariablePrompt = schemas.find((s: any) => s.name === 'trace-variable');
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
        expect(result.messages[0].role).toBe('user');
        expect(result.messages[0].content.type).toBe('text');
        expect(result.messages[0].content.text).toContain('TypeError');
        expect(result.messages[0].content.text).toContain('/src/app.js');
        expect(result.messages[0].content.text).toContain('STEP 1 - Set Breakpoint');
        expect(result.messages[0].content.text).toContain('STEP 2 - Start Debugging');
        expect(result.messages[0].content.text).toContain('STEP 3 - Verify Paused State');
        expect(result.messages[0].content.text).toContain('BEST PRACTICES');
      });

      it('should generate debug-crash prompt with only errorMessage', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'Error: Something went wrong',
        });

        expect(result.messages[0].content.text).toContain('Error: Something went wrong');
        expect(result.messages[0].content.text).not.toContain('in /path/to/file');
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
        expect(result.messages[0].content.text).toContain('Start debugging in VS Code');
        expect(result.messages[0].content.text).toContain('press F5');
        // Should NOT include automation commands
        expect(result.messages[0].content.text).not.toContain('Call start_debugging');
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

        expect(result.messages[0].content.text).toContain('Call start_debugging');
        expect(result.messages[0].content.text).toContain('STEP 0 - Read Debug Configuration');
      });
    });

    describe('trace-variable', () => {
      it('should generate trace-variable prompt with all arguments', () => {
        const result = promptHandler.generatePrompt('trace-variable', {
          variableName: 'user',
          expectedValue: '{ id: 1, name: "test" }',
          actualValue: 'null',
        });

        expect(result.messages[0].content.text).toContain('"user"');
        expect(result.messages[0].content.text).toContain('expected: { id: 1, name: "test" }');
        expect(result.messages[0].content.text).toContain('but is actually null');
        expect(result.messages[0].content.text).toContain('STEP 1 - Identify Modification Points');
        expect(result.messages[0].content.text).toContain('STEP 3 - First Breakpoint');
      });

      it('should generate trace-variable prompt with only variableName', () => {
        const result = promptHandler.generatePrompt('trace-variable', {
          variableName: 'counter',
        });

        expect(result.messages[0].content.text).toContain('"counter"');
        expect(result.messages[0].content.text).not.toContain('expected:');
      });
    });

    describe('inspect-function', () => {
      it('should generate inspect-function prompt with all arguments', () => {
        const result = promptHandler.generatePrompt('inspect-function', {
          functionName: 'processData',
          filePath: '/src/utils.js',
          issue: 'Returns undefined for empty arrays',
        });

        expect(result.messages[0].content.text).toContain('processData');
        expect(result.messages[0].content.text).toContain('/src/utils.js');
        expect(result.messages[0].content.text).toContain(
          'Issue: Returns undefined for empty arrays'
        );
        expect(result.messages[0].content.text).toContain(
          'STEP 1 - Set Breakpoint at Function Entry'
        );
        expect(result.messages[0].content.text).toContain('STEP 4 - Inspect Input Parameters');
      });

      it('should generate inspect-function prompt without issue', () => {
        const result = promptHandler.generatePrompt('inspect-function', {
          functionName: 'calculate',
          filePath: '/src/math.js',
        });

        expect(result.messages[0].content.text).toContain('calculate');
        expect(result.messages[0].content.text).toContain('/src/math.js');
        expect(result.messages[0].content.text).not.toContain('Issue:');
      });
    });

    describe('debug-loop', () => {
      it('should generate debug-loop prompt with all arguments', () => {
        const result = promptHandler.generatePrompt('debug-loop', {
          loopLocation: 'src/array.js line 45',
          expectedIterations: 10,
        });

        expect(result.messages[0].content.text).toContain('src/array.js line 45');
        expect(result.messages[0].content.text).toContain('It should run 10 times');
        expect(result.messages[0].content.text).toContain('STEP 1 - Set Conditional Breakpoint');
        expect(result.messages[0].content.text).toContain('STEP 5 - Check Loop Condition');
      });

      it('should generate debug-loop prompt without expectedIterations', () => {
        const result = promptHandler.generatePrompt('debug-loop', {
          loopLocation: 'src/main.ts infinite loop',
        });

        expect(result.messages[0].content.text).toContain('src/main.ts infinite loop');
        expect(result.messages[0].content.text).not.toContain('It should run');
      });

      it('should include hitCondition example in prompt', () => {
        const result = promptHandler.generatePrompt('debug-loop', {
          loopLocation: 'src/test.js',
          expectedIterations: 10,
        });

        expect(result.messages[0].content.text).toContain('hitCondition');
        expect(result.messages[0].content.text).toContain('> 10');
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

        expect(result.messages[0].content.text).toContain('Application crashes on startup');
        expect(result.messages[0].content.text).toContain('starting from src/index.ts');
        expect(result.messages[0].content.text).toContain('FULL AUTOMATION MODE');
        expect(result.messages[0].content.text).toContain('STEP 1 - Find Debug Configuration');
        expect(result.messages[0].content.text).toContain('list_resources()');
        expect(result.messages[0].content.text).toContain('read_resource');
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

        expect(result.messages[0].content.text).toContain('Button click does nothing');
        expect(result.messages[0].content.text).not.toContain('starting from');
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

          expect(result.messages[0].content.text).toContain('DEBUGGING BEST PRACTICES');
          expect(result.messages[0].content.text).toContain('ALWAYS call get_debug_state FIRST');
        });
      });

      it('should include tool usage examples', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'test',
        });

        expect(result.messages[0].content.text).toContain('set_breakpoint');
        expect(result.messages[0].content.text).toContain('get_call_stack');
        expect(result.messages[0].content.text).toContain('get_variables');
        expect(result.messages[0].content.text).toContain('evaluate_expression');
      });

      it('should include error recovery guidance', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'test',
        });

        expect(result.messages[0].content.text).toContain('COMMON ISSUES');
        expect(result.messages[0].content.text).toContain('No active debug session');
        expect(result.messages[0].content.text).toContain('Execution not paused');
      });

      it('should include tool response patterns', () => {
        const result = promptHandler.generatePrompt('debug-crash', {
          errorMessage: 'test',
        });

        expect(result.messages[0].content.text).toContain(
          formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused)
        );
        expect(result.messages[0].content.text).toContain(
          formatJsonExample(TOOL_RESPONSE_EXAMPLES.getVariablesLocalScope)
        );
        expect(result.messages[0].content.text).toContain(
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

        expect(result.messages[0].content.text).toContain(
          formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.listResources)
        );
        expect(result.messages[0].content.text).toContain(
          formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.readLaunchJson)
        );
      });
    });
  });
});
