// SPDX-License-Identifier: Apache-2.0

import type { ValidationResult } from '../types';
import { CSHARP_SAFE_METHODS, CSHARP_SAFE_STATIC_FUNCTIONS } from '../safeLists';

/**
 * Detects critical C# operations (Process, File, Directory, Network).
 */
export function detectCSharpCritical(expression: string): ValidationResult | null {
  // Process operations (dot and bracket notation)
  if (
    /\b(Process\s*(?:\.\s*|\[['"])Start|ProcessStartInfo|System\s*\.\s*Diagnostics\s*\.\s*Process)(?:['"]\])?\s*[.([]/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Process Execution: can run system commands (C#)',
      riskLevel: 'critical',
    };
  }

  // File and Directory operations (dot and bracket notation)
  if (
    /\b(File|Directory)\s*(?:\.\s*|\[['"])(Delete|WriteAllText|WriteAllBytes|Create|Move|Replace|Copy|AppendAllText|CreateDirectory)(?:['"]\]|\s*\()/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: can modify/delete files (C#)',
      riskLevel: 'critical',
    };
  }

  // FileStream/StreamWriter with write modes
  if (
    /\b(FileStream|StreamWriter|FileInfo|DirectoryInfo)\s*\(/i.test(expression) &&
    /\b(FileMode\s*\.\s*(Create|Append|Truncate|OpenOrCreate)|FileAccess\s*\.\s*Write)/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'File System Operation: opening file for writing (C#)',
      riskLevel: 'critical',
    };
  }

  // Network operations
  if (/\b(HttpClient|WebClient|HttpWebRequest)\s*[.([]/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Network Operation: can make external requests (C#)',
      riskLevel: 'critical',
    };
  }

  // Process/Application termination
  if (/\bEnvironment\s*\.\s*(Exit|FailFast)\s*\(/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Process Control: can terminate application (C#)',
      riskLevel: 'critical',
    };
  }

  return null;
}

/**
 * C# specific validation.
 * Allows whitelisted LINQ, collections, and safe functions, blocks mutation and reflection.
 */
export function validateCSharp(
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
    'Add',
    'Remove',
    'RemoveAt',
    'RemoveAll',
    'Clear',
    'Insert',
    'Sort',
    'Reverse',
    'AddRange',
    'InsertRange',
    'RemoveRange',
    'Push',
    'Pop',
    'Enqueue',
    'Dequeue',
  ]);
  if (mutationCheck) {
    return mutationCheck;
  }

  // Block reflection and dynamic code execution
  if (
    /\b(Activator\s*\.\s*CreateInstance|Assembly\s*\.\s*(Load|LoadFrom|LoadFile)|\.Invoke\s*\(|\.GetType\s*\(\s*\)|typeof\s*\(|nameof\s*\()/i.test(
      expression
    )
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: reflection/dynamic invocation not allowed',
      riskLevel: 'high',
    };
  }

  // Block additional reflection patterns (Type.GetMethod, etc.)
  if (
    /\bType\s*\.\s*(GetMethod|GetField|GetProperty|GetConstructor|GetMember)\s*\(/i.test(
      expression
    ) ||
    /\.(GetMethod|GetField|GetProperty|GetConstructor)\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'Code Execution: reflection member access not allowed',
      riskLevel: 'high',
    };
  }

  // Block dynamic code generation
  if (/\b(DynamicMethod|Expression\s*\.\s*Compile|ILGenerator)\s*[.(]/i.test(expression)) {
    return {
      allowed: false,
      reason: 'Code Execution: dynamic code generation not allowed',
      riskLevel: 'high',
    };
  }

  // Block string obfuscation patterns
  if (
    /\bConvert\s*\.\s*FromBase64String\s*\(/i.test(expression) ||
    /\bEncoding\s*\.\s*\w+\s*\.\s*GetString\s*\(/i.test(expression)
  ) {
    return {
      allowed: false,
      reason: 'String Obfuscation: base64/encoding can hide malicious code',
      riskLevel: 'high',
    };
  }

  // Check function calls against whitelists
  if (/[\w_\]]\s*\(/.test(expression)) {
    const calls = extractFunctionCalls(expression);
    const whitelistResult = checkAgainstWhitelists(
      calls,
      CSHARP_SAFE_STATIC_FUNCTIONS,
      CSHARP_SAFE_METHODS
    );
    // If whitelist check returned a result (blocked), return it
    if (whitelistResult) {
      return whitelistResult;
    }
    // All calls are whitelisted - allow expression (including lambdas in LINQ)
    return { allowed: true };
  }

  return null;
}
