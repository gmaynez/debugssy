// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Type definitions for tool arguments.
 * These interfaces provide type safety for tool calls.
 */

import { z } from 'zod';
import { MAX_CONSOLE_OUTPUT_LIMIT } from '../../constants';
import { TOOL_NAMES } from '../toolNames';

export const SetBreakpointArgsSchema = z.object({
  filePath: z.string().min(1, { error: 'filePath must be a non-empty string' }),
  line: z.number().int().positive({ error: 'line must be a positive integer' }),
  condition: z.string().optional(),
  hitCondition: z.string().optional(),
  logMessage: z.string().optional(),
});
export type SetBreakpointArgs = z.infer<typeof SetBreakpointArgsSchema>;

export const RemoveBreakpointArgsSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().positive(),
});
export type RemoveBreakpointArgs = z.infer<typeof RemoveBreakpointArgsSchema>;

export const ToggleBreakpointArgsSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().positive(),
});
export type ToggleBreakpointArgs = z.infer<typeof ToggleBreakpointArgsSchema>;

export const InspectBreakpointArgsSchema = z.object({
  filePath: z.string().min(1),
  line: z.number().int().positive(),
});
export type InspectBreakpointArgs = z.infer<typeof InspectBreakpointArgsSchema>;

export const GetVariablesArgsSchema = z.object({
  scope: z.string().optional(),
  frameId: z.number().int().nonnegative().optional(),
});
export type GetVariablesArgs = z.infer<typeof GetVariablesArgsSchema>;

export const EvaluateExpressionArgsSchema = z.object({
  expression: z.string().min(1, { error: 'expression must be a non-empty string' }),
  frameId: z.number().int().nonnegative().optional(),
});
export type EvaluateExpressionArgs = z.infer<typeof EvaluateExpressionArgsSchema>;

export const WaitForBreakpointArgsSchema = z.object({
  timeout: z.number().int().positive().optional(),
});
export type WaitForBreakpointArgs = z.infer<typeof WaitForBreakpointArgsSchema>;

export const GetConsoleOutputArgsSchema = z.object({
  category: z
    .enum(['console', 'stdout', 'stderr', 'telemetry'], {
      error: 'category must be one of: console, stdout, stderr, telemetry',
    })
    .optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(MAX_CONSOLE_OUTPUT_LIMIT, {
      error: `limit must be between 1 and ${MAX_CONSOLE_OUTPUT_LIMIT}`,
    })
    .optional(),
  since: z.number().int().nonnegative().optional(),
  clear: z.boolean().optional(),
});
export type GetConsoleOutputArgs = z.infer<typeof GetConsoleOutputArgsSchema>;

export const GetCallStackArgsSchema = z.object({
  maxDepth: z.number().int().positive().optional(),
});
export type GetCallStackArgs = z.infer<typeof GetCallStackArgsSchema>;

export const StartDebuggingArgsSchema = z
  .object({
    workspaceFolder: z.string().optional(),
    name: z.string().optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => !!v.name || !!v.configuration, {
    error: 'Must provide either "name" (string) or "configuration" (object) to start debugging',
  });
export type StartDebuggingArgs = z.infer<typeof StartDebuggingArgsSchema>;

/**
 * Union type for all possible tool arguments
 */
export type ToolArgs =
  | SetBreakpointArgs
  | RemoveBreakpointArgs
  | ToggleBreakpointArgs
  | InspectBreakpointArgs
  | GetVariablesArgs
  | EvaluateExpressionArgs
  | WaitForBreakpointArgs
  | GetConsoleOutputArgs
  | GetCallStackArgs
  | StartDebuggingArgs
  | Record<string, never>; // For tools with no arguments

export const Validators = {
  [TOOL_NAMES.setBreakpoint]: SetBreakpointArgsSchema,
  [TOOL_NAMES.removeBreakpoint]: RemoveBreakpointArgsSchema,
  [TOOL_NAMES.listBreakpoints]: z.object({}),
  [TOOL_NAMES.inspectBreakpoint]: InspectBreakpointArgsSchema,
  [TOOL_NAMES.toggleBreakpoint]: ToggleBreakpointArgsSchema,
  [TOOL_NAMES.removeAllBreakpoints]: z.object({}),
  [TOOL_NAMES.getVariables]: GetVariablesArgsSchema,
  [TOOL_NAMES.getCallStack]: GetCallStackArgsSchema,
  [TOOL_NAMES.evaluateExpression]: EvaluateExpressionArgsSchema,
  [TOOL_NAMES.getThreads]: z.object({}),
  [TOOL_NAMES.getDebugState]: z.object({}),
  [TOOL_NAMES.getConsoleOutput]: GetConsoleOutputArgsSchema,
  [TOOL_NAMES.clearConsoleOutput]: z.object({}),
  [TOOL_NAMES.startDebugging]: StartDebuggingArgsSchema,
  [TOOL_NAMES.stopDebugging]: z.object({}),
  [TOOL_NAMES.continueExecution]: z.object({}),
  [TOOL_NAMES.pause]: z.object({}),
  [TOOL_NAMES.restart]: z.object({}),
  [TOOL_NAMES.waitForBreakpoint]: WaitForBreakpointArgsSchema,
  [TOOL_NAMES.stepOver]: z.object({}),
  [TOOL_NAMES.stepInto]: z.object({}),
  [TOOL_NAMES.stepOut]: z.object({}),
} as const;

export type ValidatorKey = keyof typeof Validators;
