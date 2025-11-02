// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from "../types";
import { GO_SAFE_FUNCTIONS } from "../safeLists";

/**
 * Go specific validation.
 * Allows whitelisted standard library functions, blocks dangerous operations.
 */
export function validateGo(
  expression: string,
  checkAgainstWhitelists: (
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>,
  ) => ValidationResult | null,
  extractFunctionCalls: (expression: string) => string[],
): ValidationResult | null {
  // Check function calls against whitelist (Go uses goSafeFunctions for both static and methods)
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(
      calls,
      GO_SAFE_FUNCTIONS,
      GO_SAFE_FUNCTIONS,
    );
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including anonymous functions)
    return { allowed: true };
  }

  return null;
}
