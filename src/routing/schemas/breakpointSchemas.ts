// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Tool schemas for breakpoint management operations.
 *
 * Every schema carries explicit MCP ToolAnnotations. When annotations are
 * absent, clients assume worst-case defaults (readOnly: false, destructive:
 * true, openWorld: true), which needlessly gates tools behind approval prompts.
 */

import { TOOL_NAMES } from '../toolNames';

export const breakpointSchemas = [
  {
    name: TOOL_NAMES.setBreakpoint,
    title: 'Set Breakpoint',
    description:
      'Set a breakpoint at the specified file and line. Conditions and logpoint expressions are security-validated; risky expressions require approval for persistent use.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file',
        },
        line: {
          type: 'number',
          description: 'Line number (1-based)',
        },
        condition: {
          type: 'string',
          description: 'Optional condition expression (security-validated before installation)',
        },
        hitCondition: {
          type: 'string',
          description: 'Optional hit count condition',
        },
        logMessage: {
          type: 'string',
          description:
            'Optional log message (creates a logpoint). Interpolated expressions in braces are security-validated.',
        },
      },
      required: ['filePath', 'line'],
    },
  },
  {
    name: TOOL_NAMES.removeBreakpoint,
    title: 'Remove Breakpoint',
    description: 'Remove a breakpoint at the specified location',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true, // discards the breakpoint's condition/logMessage config
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file',
        },
        line: {
          type: 'number',
          description: 'Line number (1-based)',
        },
      },
      required: ['filePath', 'line'],
    },
  },
  {
    name: TOOL_NAMES.listBreakpoints,
    title: 'List Breakpoints',
    description: 'List all breakpoints in the workspace',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.inspectBreakpoint,
    title: 'Inspect Breakpoint',
    description:
      'Inspect a specific breakpoint and return structured facts plus deterministic signal IDs. This tool does not generate natural-language diagnosis text.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file',
        },
        line: {
          type: 'number',
          description: 'Line number (1-based)',
        },
      },
      required: ['filePath', 'line'],
    },
  },
  {
    name: TOOL_NAMES.toggleBreakpoint,
    title: 'Toggle Breakpoint',
    description: 'Toggle a breakpoint enabled/disabled state',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false, // toggling twice reverts the state
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file',
        },
        line: {
          type: 'number',
          description: 'Line number (1-based)',
        },
      },
      required: ['filePath', 'line'],
    },
  },
  {
    name: TOOL_NAMES.removeAllBreakpoints,
    title: 'Remove All Breakpoints',
    description: 'Remove all breakpoints from the workspace',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
