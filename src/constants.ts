// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Application-wide constants to avoid magic numbers and improve maintainability.
 */
import packageJson from '../package.json';

/**
 * Extension version - sourced from package.json for single source of truth.
 * Used for server identification and health checks.
 */
export const EXTENSION_VERSION = packageJson.version as string;

/**
 * Default thread ID to use when thread information is not available.
 * Most single-threaded applications use thread ID 1.
 */
export const DEFAULT_THREAD_ID = 1;

/**
 * Default timeout in milliseconds for waiting for a breakpoint to be hit.
 */
export const DEFAULT_BREAKPOINT_TIMEOUT_MS = 5000;

/**
 * Delay in milliseconds to ensure the MCP transport is fully ready to accept connections
 * after server startup. This prevents race conditions when connecting immediately.
 * Reduced to 20ms to allow faster connection attempts while still preventing true race conditions.
 */
export const MCP_SERVER_READY_DELAY_MS = 20;

/**
 * Supported MCP protocol versions.
 */
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'] as const;

/**
 * Current MCP protocol version used by this server.
 */
export const CURRENT_MCP_PROTOCOL_VERSION = '2025-11-25';

/**
 * Default fallback MCP protocol version for backwards compatibility.
 */
export const FALLBACK_MCP_PROTOCOL_VERSION = '2025-03-26';

// =============================================================================
// Debugging & Inspection Constants
// =============================================================================

/**
 * Default maximum depth for stack traces to prevent overly verbose output.
 * Users can override this per-request.
 */
export const DEFAULT_MAX_STACK_DEPTH = 20;

/**
 * Default maximum number of console output entries to return.
 * Prevents overwhelming the client with too much output.
 */
export const DEFAULT_CONSOLE_OUTPUT_LIMIT = 50;

/**
 * Maximum allowed console output entries per request.
 * Hard limit to prevent memory issues.
 */
export const MAX_CONSOLE_OUTPUT_LIMIT = 1000;

/**
 * Maximum size of the console output buffer.
 * Older entries are discarded when limit is reached.
 */
export const MAX_CONSOLE_BUFFER_SIZE = 1000;

// =============================================================================
// Expression Validation Constants
// =============================================================================

/**
 * Default maximum length for evaluated expressions.
 * Prevents prompt injection attacks via excessively long expressions.
 */
export const DEFAULT_MAX_EXPRESSION_LENGTH = 100;

/**
 * Minimum allowed expression length setting.
 * Must be long enough for basic expressions like variable names.
 */
export const MIN_EXPRESSION_LENGTH = 20;

/**
 * Maximum allowed expression length setting.
 * Upper bound to prevent abuse while allowing complex expressions.
 */
export const MAX_EXPRESSION_LENGTH = 400;

// =============================================================================
// Configuration Validation Constants
// =============================================================================

/**
 * Minimum port number for MCP server.
 * Ports below 1024 require root/admin privileges.
 */
export const MIN_PORT = 1024;

/**
 * Maximum port number for MCP server.
 * Standard maximum TCP port number.
 */
export const MAX_PORT = 65535;

/**
 * Minimum timeout for wait_for_breakpoint in milliseconds.
 * Must be at least 1 second to be practical.
 */
export const MIN_BREAKPOINT_TIMEOUT_MS = 1000;

/**
 * Maximum timeout for wait_for_breakpoint in milliseconds.
 * 5 minutes should be sufficient for any reasonable debugging scenario.
 */
export const MAX_BREAKPOINT_TIMEOUT_MS = 300000;

// =============================================================================
// Completion & Search Constants
// =============================================================================

/**
 * Maximum number of completion suggestions to return.
 * Prevents overwhelming the client with too many options.
 */
export const MAX_COMPLETIONS = 20;

/**
 * Maximum number of files to search when providing file path completions.
 * Limits search time and memory usage.
 */
export const MAX_FILE_SEARCH_RESULTS = 100;

/**
 * Maximum number of files to cache for file path completions.
 * Set high to support large projects. The cache is built once and
 * kept in sync with file system events, so this doesn't impact
 * per-keystroke performance.
 */
export const MAX_FILE_CACHE_SIZE = 100000;

/**
 * Maximum number of scopes to query per variable-completion request.
 * Keeps DAP round-trips bounded so completions stay responsive while typing.
 */
export const MAX_VARIABLE_COMPLETION_SCOPES = 4;
