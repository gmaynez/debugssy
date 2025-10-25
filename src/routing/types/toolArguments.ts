// SPDX-License-Identifier: Apache-2.0

/**
 * Type definitions for tool arguments.
 * These interfaces provide type safety for tool calls.
 */

import { z } from 'zod';

export const SetBreakpointArgsSchema = z.object({
    filePath: z.string().min(1, { error: 'filePath must be a non-empty string' }),
    line: z.number().int().positive({ error: 'line must be a positive integer' }),
    condition: z.string().optional(),
    hitCondition: z.string().optional(),
    logMessage: z.string().optional()
});
export type SetBreakpointArgs = z.infer<typeof SetBreakpointArgsSchema>;

export const RemoveBreakpointArgsSchema = z.object({
    filePath: z.string().min(1),
    line: z.number().int().positive()
});
export type RemoveBreakpointArgs = z.infer<typeof RemoveBreakpointArgsSchema>;

export const ToggleBreakpointArgsSchema = z.object({
    filePath: z.string().min(1),
    line: z.number().int().positive()
});
export type ToggleBreakpointArgs = z.infer<typeof ToggleBreakpointArgsSchema>;

export const GetVariablesArgsSchema = z.object({
    scope: z.string().optional(),
    frameId: z.number().int().nonnegative().optional()
});
export type GetVariablesArgs = z.infer<typeof GetVariablesArgsSchema>;

export const EvaluateExpressionArgsSchema = z.object({
    expression: z.string().min(1, { error: 'expression must be a non-empty string' }),
    frameId: z.number().int().nonnegative().optional()
});
export type EvaluateExpressionArgs = z.infer<typeof EvaluateExpressionArgsSchema>;

export const WaitForBreakpointArgsSchema = z.object({
    timeout: z.number().int().positive().optional()
});
export type WaitForBreakpointArgs = z.infer<typeof WaitForBreakpointArgsSchema>;

export const GetConsoleOutputArgsSchema = z.object({
    category: z.enum(['console', 'stdout', 'stderr', 'telemetry'], {
        error: 'category must be one of: console, stdout, stderr, telemetry'
    }).optional(),
    limit: z.number().int().positive().max(1000, {
        error: 'limit must be between 1 and 1000'
    }).optional(),
    since: z.number().int().nonnegative().optional(),
    clear: z.boolean().optional()
});
export type GetConsoleOutputArgs = z.infer<typeof GetConsoleOutputArgsSchema>;

export const GetCallStackArgsSchema = z.object({
    maxDepth: z.number().int().positive().optional()
});
export type GetCallStackArgs = z.infer<typeof GetCallStackArgsSchema>;

export const StartDebuggingArgsSchema = z.object({
    workspaceFolder: z.string().optional(),
    name: z.string().optional(),
    configuration: z.record(z.string(), z.unknown()).optional()
}).refine((v) => !!v.name || !!v.configuration, {
    error: 'Must provide either "name" (string) or "configuration" (object) to start debugging'
});
export type StartDebuggingArgs = z.infer<typeof StartDebuggingArgsSchema>;

/**
 * Union type for all possible tool arguments
 */
export type ToolArgs = 
    | SetBreakpointArgs
    | RemoveBreakpointArgs
    | ToggleBreakpointArgs
    | GetVariablesArgs
    | EvaluateExpressionArgs
    | WaitForBreakpointArgs
    | GetConsoleOutputArgs
    | GetCallStackArgs
    | StartDebuggingArgs
    | Record<string, never>; // For tools with no arguments

export const Validators = {
    set_breakpoint: SetBreakpointArgsSchema,
    remove_breakpoint: RemoveBreakpointArgsSchema,
    list_breakpoints: z.object({}),
    toggle_breakpoint: ToggleBreakpointArgsSchema,
    remove_all_breakpoints: z.object({}),
    get_variables: GetVariablesArgsSchema,
    get_call_stack: GetCallStackArgsSchema,
    evaluate_expression: EvaluateExpressionArgsSchema,
    get_threads: z.object({}),
    get_debug_state: z.object({}),
    get_console_output: GetConsoleOutputArgsSchema,
    clear_console_output: z.object({}),
    start_debugging: StartDebuggingArgsSchema,
    stop_debugging: z.object({}),
    continue: z.object({}),
    pause: z.object({}),
    restart: z.object({}),
    wait_for_breakpoint: WaitForBreakpointArgsSchema,
    step_over: z.object({}),
    step_into: z.object({}),
    step_out: z.object({}),
} as const;

export type ValidatorKey = keyof typeof Validators;

