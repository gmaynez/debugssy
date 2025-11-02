// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from "../types";
import { RUST_SAFE_FUNCTIONS } from "../safeLists";

/**
 * Detects critical Rust operations (std::process, file operations, network).
 */
export function detectRustCritical(
  expression: string,
): ValidationResult | null {
  // Process execution
  if (
    /\b(std::process::Command|Command\s*::\s*new|process\s*::\s*Command)\s*[.([]/i.test(
      expression,
    ) ||
    /\bCommand\s*::\s*new\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: "Process Execution: can run system commands (Rust)",
      riskLevel: "critical",
    };
  }

  // File operations with write/delete
  if (
    /\b(std::fs::|fs::)(remove_file|remove_dir|remove_dir_all|create_dir|create_dir_all|write|rename|set_permissions|copy)\s*\(/i.test(
      expression,
    ) ||
    /\bFile\s*::\s*(create|open)\s*\(/i.test(expression) ||
    /\bOpenOptions\s*::\s*new\s*\(\s*\)\s*\.\s*(write|append|create|truncate)/i.test(
      expression,
    )
  ) {
    return {
      allowed: false,
      reason: "File System Operation: can modify or delete files (Rust)",
      riskLevel: "critical",
    };
  }

  // Network operations
  if (
    /\b(reqwest::|hyper::|TcpStream\s*::\s*connect|UdpSocket\s*::\s*bind|std::net::)/i.test(
      expression,
    )
  ) {
    return {
      allowed: false,
      reason: "Network Operation: can make external requests (Rust)",
      riskLevel: "critical",
    };
  }

  return null;
}

/**
 * Rust specific validation.
 * Allows whitelisted standard library functions, blocks unsafe and dangerous operations.
 */
export function validateRust(
  expression: string,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>,
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[],
): ValidationResult | null {
  // Block unsafe blocks (extremely dangerous in Rust)
  if (/\bunsafe\s*\{/.test(expression)) {
    return {
      allowed: false,
      reason: "Code Execution: unsafe blocks not allowed",
      riskLevel: "high",
    };
  }

  // Block dynamic library loading
  if (/\b(libloading::|Library\s*::\s*new|dlopen)/i.test(expression)) {
    return {
      allowed: false,
      reason: "Code Execution: dynamic library loading not allowed",
      riskLevel: "high",
    };
  }

  // Block mutable operations on collections (Vec, HashMap mutations)
  if (
    /\.(push|pop|insert|remove|clear|append|extend|drain|split_off|truncate|swap_remove)\s*\(/i.test(
      expression,
    )
  ) {
    return {
      allowed: false,
      reason: "State Mutation: modifies collection data",
      riskLevel: "high",
    };
  }

  // Check function calls against whitelist
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(
      calls,
      RUST_SAFE_FUNCTIONS,
      RUST_SAFE_FUNCTIONS,
    );
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including closures)
    return { allowed: true };
  }

  return null;
}
