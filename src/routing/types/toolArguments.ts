// SPDX-License-Identifier: Apache-2.0

/**
 * Type definitions for tool arguments.
 * These interfaces provide type safety for tool calls.
 */

export interface SetBreakpointArgs {
    filePath: string;
    line: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
}

export interface RemoveBreakpointArgs {
    filePath: string;
    line: number;
}

export interface ToggleBreakpointArgs {
    filePath: string;
    line: number;
}

export interface GetVariablesArgs {
    scope?: string;
    frameId?: number;
}

export interface EvaluateExpressionArgs {
    expression: string;
    frameId?: number;
}

export interface WaitForBreakpointArgs {
    timeout?: number;
}

export interface GetConsoleOutputArgs {
    category?: string;
    limit?: number;
    since?: number;
    clear?: boolean;
}

export interface GetCallStackArgs {
    maxDepth?: number;
}

export interface StartDebuggingArgs {
    workspaceFolder?: string;
    name?: string;
    configuration?: any;
}

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

