// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Tool schemas for breakpoint management operations.
 */

import { TOOL_NAMES } from '../toolNames';

export const breakpointSchemas = [
  {
    name: TOOL_NAMES.setBreakpoint,

    description: 'Set a breakpoint at the specified file and line',
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
          description: 'Optional condition expression',
        },
        hitCondition: {
          type: 'string',
          description: 'Optional hit count condition',
        },
        logMessage: {
          type: 'string',
          description: 'Optional log message (creates a logpoint)',
        },
      },
      required: ['filePath', 'line'],
    },
  },
  {
    name: TOOL_NAMES.removeBreakpoint,
    description: 'Remove a breakpoint at the specified location',
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
    description: 'List all breakpoints in the workspace',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: TOOL_NAMES.toggleBreakpoint,
    description: 'Toggle a breakpoint enabled/disabled state',
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
    description: 'Remove all breakpoints from the workspace',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
