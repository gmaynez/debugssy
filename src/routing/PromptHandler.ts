// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { ConfigManager } from '../Config';
import { z } from 'zod';
import type { GetPromptResult, Prompt } from '@modelcontextprotocol/sdk/types.js';
import {
  generateDebugCrashPrompt,
  generateTraceVariablePrompt,
  generateInspectFunctionPrompt,
  generateDebugLoopPrompt,
  generateAutoDebugSessionPrompt,
} from './promptTemplates';

const DebugCrashArgsSchema = z.object({
  errorMessage: z.string().min(1, { error: 'errorMessage is required and must not be empty' }),
  filePath: z.string().optional(),
});

const TraceVariableArgsSchema = z.object({
  variableName: z.string().min(1, { error: 'variableName is required and must not be empty' }),
  expectedValue: z.string().optional(),
  actualValue: z.string().optional(),
});

const InspectFunctionArgsSchema = z.object({
  functionName: z.string().min(1, { error: 'functionName is required and must not be empty' }),
  filePath: z.string().min(1, { error: 'filePath is required and must not be empty' }),
  issue: z.string().optional(),
});

const DebugLoopArgsSchema = z.object({
  loopLocation: z.string().min(1, { error: 'loopLocation is required and must not be empty' }),
  expectedIterations: z.preprocess(
    (val) => (typeof val === 'string' ? Number(val) : val),
    z
      .number()
      .int()
      .positive({
        error: 'expectedIterations must be a positive integer',
      })
      .optional()
  ),
});

const AutoDebugSessionArgsSchema = z.object({
  issue: z.string().min(1, { error: 'issue is required and must not be empty' }),
  entryPoint: z.string().optional(),
});

type PromptArguments = Record<string, unknown>;

export class PromptHandler {
  constructor(private configManager: ConfigManager) {}

  getPromptSchemas(): Prompt[] {
    const automationLevel = this.configManager.getConfig().automationLevel;

    const commonPrompts = [
      {
        name: 'debug-crash',
        description:
          'Debug a crash or exception by setting breakpoints and inspecting the call stack',
        arguments: [
          {
            name: 'errorMessage',
            description: 'The error message or description of the crash',
            required: true,
          },
          {
            name: 'filePath',
            description: 'File where the error occurs (if known)',
            required: false,
          },
        ],
      },
      {
        name: 'trace-variable',
        description:
          "Trace a variable's value through execution to find where it becomes incorrect",
        arguments: [
          {
            name: 'variableName',
            description: 'Name of the variable to trace',
            required: true,
          },
          {
            name: 'expectedValue',
            description: 'What the variable value should be',
            required: false,
          },
          {
            name: 'actualValue',
            description: 'What the variable value actually is (if known)',
            required: false,
          },
        ],
      },
      {
        name: 'inspect-function',
        description:
          "Inspect a function's behavior by setting breakpoints and examining inputs/outputs",
        arguments: [
          {
            name: 'functionName',
            description: 'Name of the function to inspect',
            required: true,
          },
          {
            name: 'filePath',
            description: 'File containing the function',
            required: true,
          },
          {
            name: 'issue',
            description: 'Description of the issue with the function',
            required: false,
          },
        ],
      },
      {
        name: 'debug-loop',
        description:
          'Debug an infinite loop or unexpected loop behavior using conditional breakpoints',
        arguments: [
          {
            name: 'loopLocation',
            description: 'Description of where the loop is (file and approximate line)',
            required: true,
          },
          {
            name: 'expectedIterations',
            description: 'How many times the loop should run',
            required: false,
          },
        ],
      },
    ];

    const fullAutomationPrompts = [
      {
        name: 'auto-debug-session',
        description:
          'Automatically start a full debugging session with breakpoints and inspection (full automation mode only)',
        arguments: [
          {
            name: 'issue',
            description: 'Description of the bug or issue to debug',
            required: true,
          },
          {
            name: 'entryPoint',
            description: 'Main file or function to start debugging from',
            required: false,
          },
        ],
      },
    ];

    return automationLevel === 'full'
      ? [...commonPrompts, ...fullAutomationPrompts]
      : commonPrompts;
  }

  generatePrompt(promptName: string, args: PromptArguments = {}): GetPromptResult {
    const automationLevel = this.configManager.getConfig().automationLevel;

    switch (promptName) {
      case 'debug-crash': {
        const validated = DebugCrashArgsSchema.parse(args);
        return this.wrapPrompt(generateDebugCrashPrompt(validated, automationLevel));
      }

      case 'trace-variable': {
        const validated = TraceVariableArgsSchema.parse(args);
        return this.wrapPrompt(generateTraceVariablePrompt(validated, automationLevel));
      }

      case 'inspect-function': {
        const validated = InspectFunctionArgsSchema.parse(args);
        return this.wrapPrompt(generateInspectFunctionPrompt(validated, automationLevel));
      }

      case 'debug-loop': {
        const validated = DebugLoopArgsSchema.parse(args);
        return this.wrapPrompt(generateDebugLoopPrompt(validated, automationLevel));
      }

      case 'auto-debug-session': {
        if (automationLevel !== 'full') {
          throw new Error('auto-debug-session prompt requires full automation mode');
        }
        const validated = AutoDebugSessionArgsSchema.parse(args);
        return this.wrapPrompt(generateAutoDebugSessionPrompt(validated));
      }

      default:
        throw new Error(`Unknown prompt: ${promptName}`);
    }
  }

  private wrapPrompt(text: string): GetPromptResult {
    return {
      messages: [
        {
          role: 'user',
          content: { type: 'text', text },
        },
      ],
    };
  }
}
