// SPDX-License-Identifier: Apache-2.0

/**
 * Application-wide constants to avoid magic numbers and improve maintainability.
 */

/**
 * Extension version - should match package.json
 * This is used for server identification and health checks.
 */
export const EXTENSION_VERSION = '1.1.1';

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
 */
export const MCP_SERVER_READY_DELAY_MS = 100;

/**
 * Supported MCP protocol versions.
 */
export const SUPPORTED_MCP_PROTOCOL_VERSIONS = ['2025-03-26', '2025-06-18'] as const;

/**
 * Current MCP protocol version used by this server.
 */
export const CURRENT_MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * Default fallback MCP protocol version for backwards compatibility.
 */
export const FALLBACK_MCP_PROTOCOL_VERSION = '2025-03-26';

