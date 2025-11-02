// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from '../types';
import { JS_SAFE_METHODS, JS_SAFE_STATIC_FUNCTIONS } from '../safeLists';

/**
 * Detects critical JavaScript/Node.js operations (file system, process, network).
 */
export function detectJavaScriptCritical(expression: string): ValidationResult | null {
  // File system operations (dot and bracket notation)
  if (
    /\bfs\s*(?:\.\s*|\[['"])(unlink|rmdir|rm|write|mkdir|rename|delete|chmod|chown|truncate|appendFile|writeFile)(?:['"]\]|\s*\()/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: can modify/delete files',
      riskLevel: 'critical',
    };
  }

  // Process execution
  if (/\b(child_process|exec|execSync|spawn|spawnSync|fork|execFile)\s*[.([]/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Process Execution: can run system commands',
      riskLevel: 'critical',
    };
  }

  // Process control (dot and bracket notation)
  if (/\bprocess\s*(?:\.\s*|\[['"])(exit|kill|abort)(?:['"]\]|\s*\()/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Process Control: can terminate application',
      riskLevel: 'critical',
    };
  }

  // Network operations (fetch, axios, http)
  if (
    /\b(fetch|axios|XMLHttpRequest)\s*[.([]/i.test(expression) ||
    /\bhttps?\s*(?:\.\s*|\[['"])(get|post|put|delete|request)(?:['"]\])/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Network Operation: can make external requests',
      riskLevel: 'critical',
    };
  }

  // Dynamic module loading - only flag dangerous modules
  if (/\brequire\s*\(\s*['"](?:fs|child_process|net|http|https|crypto|vm)['"]/.test(expression)) {
    return {
      allowed: false,
      reason: 'System Module Loading: dangerous module detected',
      riskLevel: 'critical',
    };
  }

  return null;
}

/**
 * JavaScript/TypeScript specific validation.
 * Allows whitelisted safe functions, blocks mutation methods and code generation.
 */
export function validateJavaScript(
  expression: string,
  checkMutationMethods: (expression: string, methods: string[]) => ValidationResult | null,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[]
): ValidationResult | null {
  // Block common mutation methods
  const mutationCheck = checkMutationMethods(expression, [
    'push',
    'pop',
    'shift',
    'unshift',
    'splice',
    'sort',
    'reverse',
    'fill',
    'copyWithin',
    'delete',
    'clear',
    'set',
    'add',
  ]);
  if (mutationCheck) {
    return mutationCheck;
  }

  // Block eval, Function constructor, etc. (code generation)
  if (/\beval\s*\(|\bFunction\s*\(/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Code Execution: eval/Function not allowed',
      riskLevel: 'high',
    };
  }

  // Check function calls against whitelists
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(
      calls,
      JS_SAFE_STATIC_FUNCTIONS,
      JS_SAFE_METHODS
    );
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including arrow functions in callbacks)
    return { allowed: true };
  }

  return null;
}
