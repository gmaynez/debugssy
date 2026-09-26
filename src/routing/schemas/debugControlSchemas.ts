// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Tool schemas for debug session control and execution flow.
 * These schemas are only available in full automation mode.
 *
 * Execution-control tools are intentionally NOT marked openWorldHint even
 * though the debuggee interacts with the world: their results are small
 * state-only payloads, so there is no untrusted-content flow into the model
 * context, and flagging them would add approval friction to every step.
 */

import { TOOL_NAMES } from '../toolNames';

export const debugControlSchemas = [
  {
    name: TOOL_NAMES.startDebugging,
    title: 'Start Debugging',
    description:
      'Start a debugging session with the specified configuration. Requires full automation mode.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true, // launches the debuggee, which executes arbitrary code
    },
    inputSchema: {
      type: 'object',
      properties: {
        workspaceFolder: {
          type: 'string',
          description: 'Name or path of the workspace folder',
        },
        name: {
          type: 'string',
          description: 'Name of the debug configuration from launch.json',
        },
        configuration: {
          type: 'object',
          description: 'Full debug configuration object (alternative to name)',
        },
      },
    },
  },
  {
    name: TOOL_NAMES.waitForBreakpoint,
    title: 'Wait for Breakpoint',
    description:
      'Wait for execution to pause at a breakpoint. Blocks until next breakpoint is hit or timeout occurs. Requires full automation mode. After calling this, always use get_debug_state to verify the breakpoint was hit and inspect the current location.',
    annotations: {
      readOnlyHint: true, // passive observation only
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        timeout: {
          type: 'number',
          description:
            'Timeout in milliseconds (optional). If not provided, uses debugssy.waitForBreakpointTimeout setting (default: 5000ms)',
        },
      },
    },
  },
  {
    name: TOOL_NAMES.continueExecution,
    title: 'Continue Execution',
    description:
      'Continue execution until the next breakpoint. This is the recommended way to navigate between inspection points.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.pause,
    title: 'Pause Execution',
    description: 'Pause execution in the current debug session',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.restart,
    title: 'Restart Debugging',
    description:
      'Restart the current debug session (only works if currently debugging). Use this to re-run debugging with the same configuration after making changes or to reset execution state.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true, // discards the current session's execution state
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.stopDebugging,
    title: 'Stop Debugging',
    description: 'Stop the current debugging session',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true, // terminates the session
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export const stepOperationSchemas = [
  {
    name: TOOL_NAMES.stepOver,
    title: 'Step Over',
    description:
      'Step over the current line. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.stepInto,
    title: 'Step Into',
    description:
      'Step into the current function. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.stepOut,
    title: 'Step Out',
    description:
      'Step out of the current function. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
