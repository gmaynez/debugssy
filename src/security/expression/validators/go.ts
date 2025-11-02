// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from '../types';
import { GO_SAFE_FUNCTIONS } from '../safeLists';

/**
 * Detects critical Go operations (os/exec, file operations, network).
 */
export function detectGoCritical(expression: string): ValidationResult | null {
  // Process execution (os/exec, Command)
  if (
    /\b(os\/exec|exec\s*\.\s*Command|exec\s*\.\s*CommandContext)\s*\(/i.test(expression) ||
    /\bCommand\s*\(\s*["'][^"']*["']/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Process Execution: can run system commands (Go)',
      riskLevel: 'critical',
    };
  }

  // File operations with write/delete
  if (
    /\bos\s*\.\s*(Remove|RemoveAll|Create|OpenFile|Mkdir|MkdirAll|Rename|Chmod|Chown)\s*\(/i.test(
      expression
    ) ||
    /\bioutil\s*\.\s*(WriteFile|TempFile|TempDir)\s*\(/i.test(expression) ||
    /\bos\s*\.\s*OpenFile\s*\([^)]*os\s*\.\s*(O_WRONLY|O_RDWR|O_CREATE|O_APPEND|O_TRUNC)/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: can modify or delete files (Go)',
      riskLevel: 'critical',
    };
  }

  // Network operations
  if (
    /\b(http\s*\.\s*(Get|Post|Head|Put|Delete|PostForm)|net\s*\.\s*Dial|http\s*\.\s*Client\s*\{)/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Network Operation: can make external requests (Go)',
      riskLevel: 'critical',
    };
  }

  return null;
}

/**
 * Go specific validation.
 * Allows whitelisted standard library functions, blocks dangerous operations.
 */
export function validateGo(
  expression: string,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[]
): ValidationResult | null {
  // Block reflection and unsafe operations
  if (
    /\b(reflect\s*\.\s*(ValueOf|Call|CallSlice|MethodByName|FieldByName)|unsafe\s*\.\s*Pointer)/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: reflection/unsafe operations not allowed',
      riskLevel: 'high',
    };
  }

  // Check function calls against whitelist (Go uses goSafeFunctions for both static and methods)
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(calls, GO_SAFE_FUNCTIONS, GO_SAFE_FUNCTIONS);
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including anonymous functions)
    return { allowed: true };
  }

  return null;
}
