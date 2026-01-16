// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

export const TOOL_NAMES = {
  setBreakpoint: 'set_breakpoint',
  removeBreakpoint: 'remove_breakpoint',
  listBreakpoints: 'list_breakpoints',
  toggleBreakpoint: 'toggle_breakpoint',
  removeAllBreakpoints: 'remove_all_breakpoints',
  getVariables: 'get_variables',
  getCallStack: 'get_call_stack',
  evaluateExpression: 'evaluate_expression',
  getThreads: 'get_threads',
  getDebugState: 'get_debug_state',
  getConsoleOutput: 'get_console_output',
  clearConsoleOutput: 'clear_console_output',
  startDebugging: 'start_debugging',
  stopDebugging: 'stop_debugging',
  continueExecution: 'continue',
  pause: 'pause',
  restart: 'restart',
  waitForBreakpoint: 'wait_for_breakpoint',
  stepOver: 'step_over',
  stepInto: 'step_into',
  stepOut: 'step_out',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];
