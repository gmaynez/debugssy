// SPDX-License-Identifier: Apache-2.0

/**
 * Tool schemas for breakpoint management operations.
 */

export const breakpointSchemas = [
  {
    name: "set_breakpoint",
    description: "Set a breakpoint at the specified file and line",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the file",
        },
        line: {
          type: "number",
          description: "Line number (1-based)",
        },
        condition: {
          type: "string",
          description: "Optional condition expression",
        },
        hitCondition: {
          type: "string",
          description: "Optional hit count condition",
        },
        logMessage: {
          type: "string",
          description: "Optional log message (creates a logpoint)",
        },
      },
      required: ["filePath", "line"],
    },
  },
  {
    name: "remove_breakpoint",
    description: "Remove a breakpoint at the specified location",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the file",
        },
        line: {
          type: "number",
          description: "Line number (1-based)",
        },
      },
      required: ["filePath", "line"],
    },
  },
  {
    name: "list_breakpoints",
    description: "List all breakpoints in the workspace",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "toggle_breakpoint",
    description: "Toggle a breakpoint enabled/disabled state",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path to the file",
        },
        line: {
          type: "number",
          description: "Line number (1-based)",
        },
      },
      required: ["filePath", "line"],
    },
  },
  {
    name: "remove_all_breakpoints",
    description: "Remove all breakpoints from the workspace",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];
