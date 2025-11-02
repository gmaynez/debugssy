// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from '../types';
import { CPP_SAFE_FUNCTIONS } from '../safeLists';

/**
 * Detects critical C/C++ operations (system, file operations).
 */
export function detectCppCritical(expression: string): ValidationResult | null {
  // System and process operations
  if (/\b(system|exec[lv]?p?e?|popen|_popen|_wsystem)\s*\(/i.test(expression)) {
    return {
      allowed: false,
      reason: 'System Command: can execute shell commands (C/C++)',
      riskLevel: 'critical',
    };
  }

  // File operations (C/C++ typically doesn't use bracket notation for function calls,
  // but we'll be defensive and check for it anyway)
  if (
    /\b(remove|unlink|rmdir|rename|chmod|chown|creat|mkdir)\s*\(/i.test(expression) ||
    /\b(fopen|freopen)\s*\([^)]*['"][wa]/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: can modify or delete files (C/C++)',
      riskLevel: 'critical',
    };
  }

  return null;
}

/**
 * C/C++ specific validation.
 * Allows whitelisted standard library functions, blocks dangerous operations.
 */
export function validateCpp(
  expression: string,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[]
): ValidationResult | null {
  // Check function calls against whitelist (C/C++ doesn't use separate static/method sets)
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    // Use empty set for static functions since C/C++ functions are in cppSafeFunctions
    const whitelistResult = checkAgainstWhitelists(calls, new Set(), CPP_SAFE_FUNCTIONS);
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including lambdas)
    return { allowed: true };
  }

  return null;
}
