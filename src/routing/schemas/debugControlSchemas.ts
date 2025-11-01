// SPDX-License-Identifier: Apache-2.0

/**
 * Tool schemas for debug session control and execution flow.
 * These schemas are only available in full automation mode.
 */

export const debugControlSchemas = [
  {
    name: "start_debugging",
    description:
      "Start a debugging session with the specified configuration. Requires full automation mode.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceFolder: {
          type: "string",
          description: "Name or path of the workspace folder",
        },
        name: {
          type: "string",
          description: "Name of the debug configuration from launch.json",
        },
        configuration: {
          type: "object",
          description: "Full debug configuration object (alternative to name)",
        },
      },
    },
  },
  {
    name: "wait_for_breakpoint",
    description:
      "Wait for execution to pause at a breakpoint. Blocks until next breakpoint is hit or timeout occurs. Requires full automation mode. After calling this, always use get_debug_state to verify the breakpoint was hit and inspect the current location.",
    inputSchema: {
      type: "object",
      properties: {
        timeout: {
          type: "number",
          description:
            "Timeout in milliseconds (optional). If not provided, uses debugssy.waitForBreakpointTimeout setting (default: 5000ms)",
        },
      },
    },
  },
  {
    name: "continue",
    description:
      "Continue execution until the next breakpoint. This is the recommended way to navigate between inspection points.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "pause",
    description: "Pause execution in the current debug session",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "restart",
    description: "Restart the current debug session",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "stop_debugging",
    description: "Stop the current debugging session",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

export const stepOperationSchemas = [
  {
    name: "step_over",
    description:
      'Step over the current line. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "step_into",
    description:
      'Step into the current function. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "step_out",
    description:
      'Step out of the current function. NOTE: For efficient AI debugging, prefer setting strategic breakpoints and using "continue". Use this only for fine-grained exploration of complex runtime behavior.',
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];
