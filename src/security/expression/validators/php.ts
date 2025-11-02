// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from '../types';
import { PHP_SAFE_FUNCTIONS } from '../safeLists';

/**
 * Detects critical PHP operations (system commands, file operations, network).
 */
export function detectPHPCritical(expression: string): ValidationResult | null {
  // Process execution (many variants in PHP)
  if (/\b(exec|system|shell_exec|passthru|proc_open|popen|pcntl_exec|`)\s*[(`]/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Process Execution: can run system commands (PHP)',
      riskLevel: 'critical',
    };
  }

  // File operations with write/delete (dot and bracket notation)
  if (
    /\b(unlink|rmdir|fwrite|file_put_contents|fputs|ftruncate|rename|mkdir|chmod|chown|touch|copy|move_uploaded_file)\s*\(/i.test(
      expression
    ) ||
    /\bfopen\s*\([^)]*['"][wa]/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: can modify or delete files (PHP)',
      riskLevel: 'critical',
    };
  }

  // Network operations
  if (
    /\b(curl_exec|curl_init|fsockopen|pfsockopen|socket_create|socket_connect|stream_socket_client|stream_context_create)\s*\(/i.test(
      expression
    ) ||
    /\bfile_get_contents\s*\(\s*['"]https?:/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Network Operation: can make external requests (PHP)',
      riskLevel: 'critical',
    };
  }

  return null;
}

/**
 * PHP specific validation.
 * Allows whitelisted safe functions, blocks eval, create_function, and dangerous operations.
 */
export function validatePHP(
  expression: string,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[]
): ValidationResult | null {
  // Block eval and dynamic code execution
  if (
    /\b(eval|assert|create_function|call_user_func|call_user_func_array)\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: eval/dynamic execution not allowed',
      riskLevel: 'high',
    };
  }

  // Block variable function calls (potential code execution bypass)
  if (/\$\w+\s*\(/.test(expression)) {
    return {
      allowed: false,
      reason: 'Code Execution: variable function calls not allowed',
      riskLevel: 'high',
    };
  }

  // Block include/require with variables (potential remote code inclusion)
  if (
    /\b(include|require|include_once|require_once)\s*\(?(?!\s*['"])/i.test(expression) ||
    /\b(include|require|include_once|require_once)\s*\(\s*\$/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: dynamic include/require not allowed',
      riskLevel: 'high',
    };
  }

  // Block array mutation functions
  if (
    /\b(array_push|array_pop|array_shift|array_unshift|array_splice|sort|rsort|asort|arsort|ksort|krsort|usort|uasort|uksort|shuffle|array_walk|array_walk_recursive)\s*\(/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'State Mutation: modifies array data',
      riskLevel: 'high',
    };
  }

  // Check function calls against whitelist
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    // PHP uses same set for both function types (no method vs static distinction in whitelisting)
    const whitelistResult = checkAgainstWhitelists(calls, PHP_SAFE_FUNCTIONS, PHP_SAFE_FUNCTIONS);
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including closures)
    return { allowed: true };
  }

  return null;
}
