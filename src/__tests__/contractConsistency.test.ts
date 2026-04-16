// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigManager } from '../Config';
import { PromptHandler } from '../routing/PromptHandler';
import { ToolRouter } from '../routing/ToolRouter';
import { TOOL_NAMES } from '../routing/toolNames';
import {
  breakpointSchemas as exportedBreakpointSchemas,
  debugControlSchemas as exportedDebugControlSchemas,
  inspectionSchemas as exportedInspectionSchemas,
  stepOperationSchemas as exportedStepOperationSchemas,
} from '../routing/schemas';
import { breakpointSchemas } from '../routing/schemas/breakpointSchemas';
import { debugControlSchemas, stepOperationSchemas } from '../routing/schemas/debugControlSchemas';
import { inspectionSchemas } from '../routing/schemas/inspectionSchemas';
import { Validators } from '../routing/types/toolArguments';
import type { ToolRegistry } from '../tools';

function createMockToolRegistry(): ToolRegistry {
  return {
    breakpoints: {
      setBreakpoint: vi.fn().mockResolvedValue({ success: true }),
      removeBreakpoint: vi.fn().mockResolvedValue({ success: true }),
      listBreakpoints: vi.fn().mockResolvedValue({ success: true }),
      toggleBreakpoint: vi.fn().mockResolvedValue({ success: true }),
      removeAllBreakpoints: vi.fn().mockResolvedValue({ success: true }),
    } as any,
    inspection: {
      getVariables: vi.fn().mockResolvedValue({ success: true }),
      getCallStack: vi.fn().mockResolvedValue({ success: true }),
      evaluateExpression: vi.fn().mockResolvedValue({ success: true }),
      getThreads: vi.fn().mockResolvedValue({ success: true }),
      getDebugState: vi.fn().mockResolvedValue({ success: true }),
      getConsoleOutput: vi.fn().mockResolvedValue({ success: true }),
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

function buildPromptArgs(promptSchema: {
  arguments?: Array<{ name: string; required?: boolean }>;
}) {
  const argValues: Record<string, unknown> = {
    errorMessage: 'TypeError: test failure',
    filePath: '/workspace/src/app.ts',
    variableName: 'counter',
    expectedValue: '1',
    actualValue: '0',
    functionName: 'processData',
    issue: 'Unexpected return value',
    loopLocation: 'src/app.ts line 42',
    expectedIterations: 3,
    entryPoint: 'src/index.ts',
  };

  return Object.fromEntries(
    (promptSchema.arguments || [])
      .filter((argument) => argument.required)
      .map((argument) => [argument.name, argValues[argument.name] ?? `test-${argument.name}`])
  );
}

describe('Contract Consistency', () => {
  let configManager: ConfigManager;
  let toolRouter: ToolRouter;
  let promptHandler: PromptHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = new ConfigManager();
    toolRouter = new ToolRouter(createMockToolRegistry(), configManager);
    promptHandler = new PromptHandler(configManager);
  });

  afterEach(() => {
    toolRouter.dispose();
  });

  describe('Tool Contracts', () => {
    it('re-exports schema collections through the schema index', () => {
      expect(exportedBreakpointSchemas).toBe(breakpointSchemas);
      expect(exportedInspectionSchemas).toBe(inspectionSchemas);
      expect(exportedDebugControlSchemas).toBe(debugControlSchemas);
      expect(exportedStepOperationSchemas).toBe(stepOperationSchemas);
    });

    it('keeps tool names, schemas, validators, and handlers in sync', () => {
      const schemaNames = [
        ...breakpointSchemas,
        ...inspectionSchemas,
        ...debugControlSchemas,
        ...stepOperationSchemas,
      ].map((schema) => schema.name);
      const toolNames = Object.values(TOOL_NAMES);
      const validatorNames = Object.keys(Validators);
      const handlerNames = Array.from((toolRouter as any).toolHandlers.keys());

      expect(new Set(schemaNames)).toEqual(new Set(toolNames));
      expect(schemaNames).toHaveLength(toolNames.length);
      expect(new Set(validatorNames)).toEqual(new Set(toolNames));
      expect(new Set(handlerNames)).toEqual(new Set(toolNames));
    });

    it('returns schemas that stay aligned with the configured availability rules', () => {
      const assistedNames = toolRouter.getToolSchemas().map((schema) => schema.name);
      expect(new Set(assistedNames)).toEqual(
        new Set([...breakpointSchemas, ...inspectionSchemas].map((schema) => schema.name))
      );

      mockConfig(configManager, {
        automationLevel: 'full',
        allowStepOperations: false,
      });

      const fullNames = toolRouter.getToolSchemas().map((schema) => schema.name);
      expect(new Set(fullNames)).toEqual(
        new Set(
          [...breakpointSchemas, ...inspectionSchemas, ...debugControlSchemas].map(
            (schema) => schema.name
          )
        )
      );

      mockConfig(configManager, {
        automationLevel: 'full',
        allowStepOperations: true,
      });

      const fullWithStepsNames = toolRouter.getToolSchemas().map((schema) => schema.name);
      expect(new Set(fullWithStepsNames)).toEqual(
        new Set(
          [
            ...breakpointSchemas,
            ...inspectionSchemas,
            ...debugControlSchemas,
            ...stepOperationSchemas,
          ].map((schema) => schema.name)
        )
      );
    });
  });

  describe('Prompt Contracts', () => {
    it('can generate every advertised assisted-mode prompt from its required arguments', () => {
      const promptSchemas = promptHandler.getPromptSchemas();

      for (const promptSchema of promptSchemas) {
        const result = promptHandler.generatePrompt(
          promptSchema.name,
          buildPromptArgs(promptSchema)
        );
        expect(result.messages[0].content.text.length).toBeGreaterThan(0);
      }
    });

    it('can generate every advertised full-mode prompt from its required arguments', () => {
      mockConfig(configManager, {
        automationLevel: 'full',
      });

      const promptSchemas = promptHandler.getPromptSchemas();

      for (const promptSchema of promptSchemas) {
        const result = promptHandler.generatePrompt(
          promptSchema.name,
          buildPromptArgs(promptSchema)
        );
        expect(result.messages[0].content.text.length).toBeGreaterThan(0);
      }
    });
  });
});
