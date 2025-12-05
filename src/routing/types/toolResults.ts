// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Base result interface for all tool operations.
 * Follows the Result pattern for consistent error handling.
 */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Result type that can include warning and validation info.
 * Used for evaluate_expression with security validation.
 */
export interface EvaluationResult extends ToolResult {
  _warning?: string;
  validationFailure?: {
    reason?: string;
    riskLevel?: string;
    expression: string;
  };
}

/**
 * Schema definition for MCP tool registration.
 */
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ============================================
// Breakpoint Tool Results
// ============================================

export interface BreakpointInfo {
  id: string;
  location: {
    uri: string;
    line: number;
  };
  enabled: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export interface BreakpointData {
  filePath: string;
  line: number;
  enabled: boolean;
  condition?: string;
  hitCondition?: string;
  logMessage?: string;
}

export type SetBreakpointResult = ToolResult<{
  breakpoint: BreakpointData;
}>;

export type ListBreakpointsResult = ToolResult<{
  breakpoints: BreakpointInfo[];
}>;

// ============================================
// Inspection Tool Results
// ============================================

export interface VariableInfo {
  name: string;
  value: string;
  type?: string;
}

export interface ScopeInfo {
  name: string;
  variables: VariableInfo[];
}

export type GetVariablesResult = ToolResult<{
  frameId: number;
  scopes: ScopeInfo[];
}>;

export interface StackFrameInfo {
  id: number;
  name: string;
  source: string;
  line: number;
  column: number;
}

export type GetCallStackResult = ToolResult<{
  frames: StackFrameInfo[];
  totalFrames: number;
  truncated: boolean;
}>;

export type EvaluateExpressionResult = ToolResult<{
  expression: string;
  result: string;
  type?: string;
}>;

export interface ThreadInfo {
  id: number;
  name: string;
}

export type GetThreadsResult = ToolResult<{
  threads: ThreadInfo[];
}>;

export interface DebugStateData {
  hasActiveSession: boolean;
  executionState: 'not_started' | 'running' | 'paused' | 'terminated';
  sessionName?: string;
  sessionType?: string;
  stoppedInfo?: {
    reason: string;
    description?: string;
    threadId?: number;
    allThreadsStopped?: boolean;
    hitBreakpointIds?: number[];
  };
  currentLocation?: {
    file?: string;
    line: number;
    column: number;
    functionName: string;
  };
}

export type GetDebugStateResult = ToolResult<DebugStateData>;

export interface ConsoleEntry {
  category: string;
  output: string;
  timestamp: number;
  source?: string;
  line?: number;
}

export type GetConsoleOutputResult = ToolResult<{
  entries: ConsoleEntry[];
  count: number;
  truncated: boolean;
}>;

// ============================================
// Debug Control Results
// ============================================

export type DebugControlResult = ToolResult<{
  sessionName?: string;
}>;
