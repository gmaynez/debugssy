// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from '../types';
import { JAVA_SAFE_METHODS, JAVA_SAFE_STATIC_FUNCTIONS } from '../safeLists';

/**
 * Detects critical Java operations (Runtime.exec, File, Network).
 */
export function detectJavaCritical(expression: string): ValidationResult | null {
  // Process execution
  if (
    /\b(Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec|ProcessBuilder)\s*[.([]/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Process Execution: can run system commands (Java)',
      riskLevel: 'critical',
    };
  }

  // File operations (dot and bracket notation)
  if (
    /\b(File|Files)\s*(?:\.\s*|\[['"])(delete|createNewFile|mkdir|mkdirs|renameTo|write|writeString|writeBytes|move|copy|deleteIfExists)(?:['"]\]|\s*\()/i.test(
      expression
    ) ||
    /\bnew\s+File(Writer|OutputStream|Reader|InputStream)\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: can modify/delete files (Java)',
      riskLevel: 'critical',
    };
  }

  // Network operations
  if (
    /\b(HttpClient|HttpURLConnection|URL\s*\([^)]*\)\s*\.\s*openConnection|URLConnection)\s*[.([]/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Network Operation: can make external requests (Java)',
      riskLevel: 'critical',
    };
  }

  // Process/JVM termination
  if (
    /\bSystem\s*\.\s*exit\s*\(/i.test(expression) ||
    /\bRuntime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*halt\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Process Control: can terminate JVM (Java)',
      riskLevel: 'critical',
    };
  }

  return null;
}

/**
 * Java specific validation.
 * Allows whitelisted Stream API, collections, and safe functions, blocks mutation and reflection.
 */
export function validateJava(
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
    'add',
    'remove',
    'clear',
    'set',
    'addAll',
    'removeAll',
    'retainAll',
    'put',
    'putAll',
    'replaceAll',
    'sort',
    'shuffle',
  ]);
  if (mutationCheck) {
    return mutationCheck;
  }

  // Block reflection and dynamic class loading
  if (
    /\b(Class\s*\.\s*forName|\.invoke\s*\(|Field\s*\.\s*set|Constructor\s*\.\s*newInstance|ClassLoader\s*\.\s*loadClass)/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: reflection/dynamic class loading not allowed',
      riskLevel: 'high',
    };
  }

  // Block script engine execution (JavaScript, Groovy, etc.)
  if (
    /\b(ScriptEngine|ScriptEngineManager|Compilable|Invocable)\s*[.(]/i.test(expression) ||
    /\.eval\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: script engine execution not allowed',
      riskLevel: 'high',
    };
  }

  // Block string obfuscation patterns
  if (
    /\bBase64\s*\.\s*(getDecoder|getUrlDecoder|getMimeDecoder)\s*\(\s*\)\s*\.\s*decode\s*\(/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'String Obfuscation: Base64 decoding can hide malicious code',
      riskLevel: 'high',
    };
  }

  // Check function calls against whitelists
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(
      calls,
      JAVA_SAFE_STATIC_FUNCTIONS,
      JAVA_SAFE_METHODS
    );
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including lambdas in Stream API)
    return { allowed: true };
  }

  return null;
}
