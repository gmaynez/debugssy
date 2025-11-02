// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from "../types";
import {
  PYTHON_SAFE_METHODS,
  PYTHON_SAFE_STATIC_FUNCTIONS,
} from "../safeLists";

/**
 * Detects critical Python operations (os, subprocess, file operations).
 */
export function detectPythonCritical(
  expression: string,
): ValidationResult | null {
  // Python os module operations
  if (
    /\bos\s*\.\s*(system|popen|exec[lv]?p?e?|spawn[lv]?p?e?|remove|unlink|rmdir|rename|chmod|chown|kill|mkdir|makedirs)\s*\(/i.test(
      expression,
    )
  ) {
    return {
      allowed: false,
      reason:
        "System Operation: os module can execute commands or modify files",
      riskLevel: "critical",
    };
  }

  // Python subprocess module
  if (
    /\bsubprocess\s*\.\s*(run|call|check_call|check_output|Popen|getoutput|getstatusoutput)\s*\(/i.test(
      expression,
    )
  ) {
    return {
      allowed: false,
      reason: "Process Execution: subprocess module can run system commands",
      riskLevel: "critical",
    };
  }

  // Python file operations with write modes
  const openPositionalWritePattern =
    /\bopen\s*\(\s*[^,]+,\s*(?:mode\s*=\s*)?['"][^'"]*(?:[wax]|\+)[^'"]*['"]/i;
  const openNamedModeWritePattern =
    /\bopen\s*\([^)]*mode\s*=\s*['"][^'"]*(?:[wax]|\+)[^'"]*['"]/i;

  if (
    openPositionalWritePattern.test(expression) ||
    openNamedModeWritePattern.test(expression) ||
    /\bPath\s*\([^)]*\)\s*\.\s*(write_text|write_bytes|unlink|rmdir|mkdir|rename|replace|chmod)\s*\(/i.test(
      expression,
    )
  ) {
    return {
      allowed: false,
      reason: "File System Operation: can modify or delete files",
      riskLevel: "critical",
    };
  }

  return null;
}

/**
 * Python-specific validation.
 * Allows whitelisted safe functions, blocks mutation methods and code execution.
 */
export function validatePython(
  expression: string,
  checkMutationMethods: (
    expression: string,
    methods: string[],
  ) => ValidationResult | null,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>,
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[],
): ValidationResult | null {
  // Block common mutation methods
  const mutationCheck = checkMutationMethods(expression, [
    "append",
    "extend",
    "insert",
    "remove",
    "pop",
    "clear",
    "sort",
    "reverse",
    "update",
    "add",
    "discard",
  ]);
  if (mutationCheck) {
    return mutationCheck;
  }

  // Block eval, exec, compile, __import__ (code execution)
  if (/\b(eval|exec|compile|__import__)\s*\(/i.test(expression)) {
    return {
      allowed: false,
      reason: "Code Execution: eval/exec not allowed",
      riskLevel: "high",
    };
  }

  // Check function calls against whitelists
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(
      calls,
      PYTHON_SAFE_STATIC_FUNCTIONS,
      PYTHON_SAFE_METHODS,
    );
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including lambdas in callbacks)
    return { allowed: true };
  }

  return null;
}
