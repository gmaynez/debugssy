// SPDX-License-Identifier: Apache-2.0

/**
 * Tool schemas for inspection and state query operations.
 */

export const inspectionSchemas = [
    {
        name: 'get_variables',
        description: 'Get variables from the current stack frame. WARNING: Can be verbose with many variables. Consider filtering by scope (e.g., "Local") to reduce output.',
        inputSchema: {
            type: 'object',
            properties: {
                scope: {
                    type: 'string',
                    description: 'Optional scope prefix to filter (e.g., "Local" matches "Local: functionName", "Global" matches "Global"). Case-insensitive. Recommended to reduce verbosity.'
                },
                frameId: {
                    type: 'number',
                    description: 'Optional frame ID (defaults to current frame)'
                }
            }
        }
    },
    {
        name: 'get_call_stack',
        description: 'Get the current call stack. WARNING: Can be very verbose with deep call stacks. Only call when you need to understand the execution path. Consider using get_debug_state first for just the current location.',
        inputSchema: {
            type: 'object',
            properties: {
                maxDepth: {
                    type: 'number',
                    description: 'Maximum number of stack frames to return (default: 20). Use smaller values to reduce verbosity.'
                }
            }
        }
    },
    {
        name: 'evaluate_expression',
        description: 'Evaluate an expression in the current debug context. Use simple expressions (e.g., "x", "obj.prop") rather than complex ones that return large objects. For large objects, use get_variables with scope filter instead. SECURITY: Expression length is limited to prevent prompt injection attacks.',
        inputSchema: {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'Expression to evaluate (keep it simple to avoid verbose output). Length is limited for security.'
                },
                frameId: {
                    type: 'number',
                    description: 'Optional frame ID (defaults to current frame)'
                }
            },
            required: ['expression']
        }
    },
    {
        name: 'get_threads',
        description: 'Get all threads in the current debug session',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'get_debug_state',
        description: 'Get current debug session state including execution state (running/paused), current location if paused, and reason for stopping. Lightweight - always check this first before calling more verbose tools like get_call_stack.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'get_console_output',
        description: 'Get output from the debug console including stdout, stderr, and console.log messages. WARNING: Can be extremely verbose. Always specify a limit (default: 50 most recent entries). Use category filter to reduce output.',
        inputSchema: {
            type: 'object',
            properties: {
                category: {
                    type: 'string',
                    description: 'Filter by output category: "console", "stdout", "stderr", "telemetry". Recommended to reduce verbosity.',
                    enum: ['console', 'stdout', 'stderr', 'telemetry']
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of recent entries to return (default: 50, max: 1000). Start with smaller values.'
                },
                since: {
                    type: 'number',
                    description: 'Unix timestamp (ms) to filter entries since this time. Only returns entries newer than this timestamp.'
                },
                clear: {
                    type: 'boolean',
                    description: 'If true, clears the console output buffer after reading. Default: false.'
                }
            }
        }
    },
    {
        name: 'clear_console_output',
        description: 'Clear the debug console output buffer',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    }
];

