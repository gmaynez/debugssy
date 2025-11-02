// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from '../types';
import { RUBY_SAFE_METHODS, RUBY_SAFE_STATIC_FUNCTIONS } from '../safeLists';

/**
 * Detects critical Ruby operations (system, file operations, network).
 */
export function detectRubyCritical(expression: string): ValidationResult | null {
  // Process execution (system, exec, spawn, backticks, %x)
  if (
    /\b(system|exec|spawn|fork|`|%x\{|%x\[|%x\(|Kernel\s*\.\s*(system|exec|spawn))\s*[(`[{(]/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Process Execution: can run system commands (Ruby)',
      riskLevel: 'critical',
    };
  }

  // File operations with write/delete (dot and bracket notation)
  if (
    /\bFile\s*(?:\.\s*|\[['"])(delete|unlink|rename|chmod|chown|truncate|write|open)\s*\(/i.test(
      expression
    ) ||
    /\bFile\s*\.\s*open\s*\([^)]*['"][wa]/i.test(expression) ||
    /\bFileUtils\s*\.\s*(rm|rm_rf|rm_r|remove|mkdir|mv|cp|touch|chmod|chown)\s*\(/i.test(
      expression
    ) ||
    /\bDir\s*\.\s*(delete|rmdir|mkdir|unlink)\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: can modify or delete files (Ruby)',
      riskLevel: 'critical',
    };
  }

  // Network operations
  if (
    /\b(Net::HTTP|Net::FTP|Net::SMTP|TCPSocket|UDPSocket|open-uri|URI\s*\.\s*open)\s*[.([]/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Network Operation: can make external requests (Ruby)',
      riskLevel: 'critical',
    };
  }

  return null;
}

/**
 * Ruby specific validation.
 * Allows whitelisted safe functions, blocks eval, send, and dangerous operations.
 */
export function validateRuby(
  expression: string,
  checkMutationMethods: (expression: string, methods: string[]) => ValidationResult | null,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[]
): ValidationResult | null {
  // Block eval and dynamic code execution
  if (/\b(eval|instance_eval|class_eval|module_eval|binding\s*\.\s*eval)\s*\(/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Code Execution: eval not allowed',
      riskLevel: 'high',
    };
  }

  // Block send, public_send, __send__ (dynamic method invocation - can bypass validation)
  if (/\b(send|public_send|__send__)\s*\(/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Code Execution: dynamic method invocation not allowed',
      riskLevel: 'high',
    };
  }

  // Block require/load with variables (potential code loading)
  if (
    /\b(require|load|require_relative)\s*\(\s*[^'"]/i.test(expression) ||
    /\b(require|load|require_relative)\s*\(\s*['"][^'"]*#\{/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: dynamic require/load not allowed',
      riskLevel: 'high',
    };
  }

  // Block common mutation methods
  const mutationCheck = checkMutationMethods(expression, [
    'push',
    '<<',
    'pop',
    'shift',
    'unshift',
    'insert',
    'delete',
    'delete_at',
    'delete_if',
    'clear',
    'concat',
    'replace',
    'fill',
    'sort!',
    'reverse!',
    'shuffle!',
    'rotate!',
    'compact!',
    'flatten!',
    'uniq!',
    'map!',
    'select!',
    'reject!',
  ]);
  if (mutationCheck) {
    return mutationCheck;
  }

  // Check function calls against whitelists
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(
      calls,
      RUBY_SAFE_STATIC_FUNCTIONS,
      RUBY_SAFE_METHODS
    );
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including blocks/lambdas)
    return { allowed: true };
  }

  return null;
}
