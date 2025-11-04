// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { Logger } from '../utils/Logger';
import { MUTATION_METHODS } from './expression/mutationMethods';
import {
  JS_SAFE_METHODS,
  JS_SAFE_STATIC_FUNCTIONS,
  PYTHON_SAFE_METHODS,
  PYTHON_SAFE_STATIC_FUNCTIONS,
} from './expression/safeLists';
import type { RiskLevel, ValidationLevel, ValidationResult } from './expression/types';
import { detectJavaScriptCritical, validateJavaScript } from './expression/validators/javascript';
import { detectPythonCritical, validatePython } from './expression/validators/python';
import { detectCSharpCritical, validateCSharp } from './expression/validators/csharp';
import { detectJavaCritical, validateJava } from './expression/validators/java';
import { detectCppCritical, validateCpp } from './expression/validators/cpp';
import { detectGoCritical, validateGo } from './expression/validators/go';
import { detectRustCritical, validateRust } from './expression/validators/rust';
import { detectRubyCritical, validateRuby } from './expression/validators/ruby';
import { detectPHPCritical, validatePHP } from './expression/validators/php';

export type { RiskLevel, ValidationLevel, ValidationResult };

/**
 * Validates expressions for potential side effects before evaluation.
 * Uses pattern-based validation with whitelists of known-safe functions.
 *
 * This provides defense-in-depth against:
 * - Unintended side effects (function calls, assignments)
 * - Code execution that modifies program state
 * - Potentially expensive operations
 *
 * Approach:
 * - Whitelists known-safe built-in functions (Array.map, Object.keys, JSON.stringify, etc.)
 * - Blocks assignments, mutations, and unknown function calls
 * - Users can approve blocked expressions via MCP elicitation
 */
export class ExpressionValidator {
  // Safe built-in JavaScript/TypeScript functions and methods
  private readonly jsSafeFunctions = JS_SAFE_METHODS;

  // Safe built-in JavaScript/TypeScript static functions
  private readonly jsSafeStaticFunctions = JS_SAFE_STATIC_FUNCTIONS;

  // Safe built-in Python functions and methods
  private readonly pythonSafeFunctions = PYTHON_SAFE_METHODS;
  // Safe built-in Python module functions (module.function)
  private readonly pythonSafeStaticFunctions = PYTHON_SAFE_STATIC_FUNCTIONS;

  private logger: Logger;

  // Pre-compiled regex patterns for mutation detection to avoid repeated compilation
  private readonly mutationRegexCache: Map<string, RegExp>;

  // Language detection cache per session to avoid redundant lookups
  private readonly languageCache: Map<string, string>;

  // Disposable for the session termination listener
  private readonly sessionTerminationDisposable: vscode.Disposable | undefined;

  constructor() {
    this.logger = Logger.getInstance();

    // Pre-compile all mutation regex patterns to avoid repeated compilation
    this.mutationRegexCache = new Map();
    for (const method of MUTATION_METHODS) {
      this.mutationRegexCache.set(method, new RegExp(`(?:\\.|\\?\\.)${method}\\s*\\(`, 'i'));
    }

    // Initialize language cache
    this.languageCache = new Map();

    // Listen for debug session termination to clear cache entries
    // Store the disposable for proper cleanup when validator is disposed
    if (typeof vscode !== 'undefined') {
      this.sessionTerminationDisposable = vscode.debug.onDidTerminateDebugSession((session) => {
        this.languageCache.delete(session.id);
      });
    }
  }

  /**
   * Disposes resources and cleans up event listeners.
   * Should be called when the validator is no longer needed.
   */
  dispose(): void {
    this.sessionTerminationDisposable?.dispose();
    this.languageCache.clear();
  }

  /**
   * Validates an expression for potential side effects.
   * Returns whether the expression is allowed and why if blocked.
   *
   * Validation order (by risk level):
   * 1. CRITICAL - System operations (fs, process, network)
   * 2. HIGH - State mutations (push, splice, assignments, eval)
   * 3. MEDIUM - Unknown functions (user-defined)
   * 4. LOW - Getter patterns (likely safe)
   */
  validateExpression(expression: string, session?: vscode.DebugSession): ValidationResult {
    // Trim whitespace for consistent validation
    const trimmed = expression.trim();

    if (!trimmed) {
      return { allowed: false, reason: 'Empty expression', riskLevel: 'low' };
    }

    // Detect language once if session is provided to optimize subsequent checks
    const language = session ? this.detectLanguage(session) : undefined;

    // 1. Check CRITICAL first (system-level dangers)
    // Pass language to enable language-specific critical operation detection
    const criticalCheck = this.detectCriticalOperations(trimmed, language);
    if (criticalCheck) {
      return criticalCheck;
    }

    // 2. Try language-specific validation (HIGH risk: mutations, eval)
    if (language) {
      const languageResult = this.validateByLanguage(trimmed, language);
      if (languageResult) {
        return languageResult;
      }
    }

    // 3. Fall back to generic pattern-based validation (MEDIUM/LOW)
    return this.validateGeneric(trimmed);
  }

  /**
   * Determines if we should elicit user approval based on risk level and validation level.
   * Uses threshold-based logic like log levels.
   */
  shouldElicit(riskLevel: RiskLevel | undefined, validationLevel: ValidationLevel): boolean {
    if (validationLevel === 'disabled') {
      return false;
    }
    if (!riskLevel) {
      return false;
    }

    // Map validation levels to minimum risk thresholds
    const thresholds: Record<ValidationLevel, RiskLevel[]> = {
      strict: ['critical', 'high', 'medium', 'low'], // Elicit for all risks
      moderate: ['critical', 'high', 'medium'], // Elicit for CRITICAL + HIGH + MEDIUM
      permissive: ['critical', 'high'], // Elicit for CRITICAL + HIGH only
      disabled: [], // Never elicit
    };

    return thresholds[validationLevel].includes(riskLevel);
  }

  /**
   * Formats a validation result into a user-friendly message for elicitation.
   * Message severity is proportionate to the actual risk level.
   * Includes the expression in the message for visibility across all MCP clients.
   * @param expression - The expression being validated
   * @param result - The validation result containing risk level and reason
   */
  formatElicitationMessage(expression: string, result: ValidationResult): string {
    const { riskLevel, reason } = result;

    // Format the expression for display (truncate if very long)
    const maxLength = 200;
    const displayExpression =
      expression.length > maxLength ? expression.substring(0, maxLength) + '...' : expression;

    switch (riskLevel) {
      case 'critical':
        return `🔴 CRITICAL: ${reason}. Expression: "${displayExpression}" — This operation can modify files, execute processes, or make network requests. Only proceed if you fully understand the consequences.`;

      case 'high':
        return `⚠️ ${reason}. Expression: "${displayExpression}" — This will modify your application's state during debugging. Changes may cause unexpected behavior or mask bugs.`;

      case 'medium':
        return `⚠️ ${reason}. Expression: "${displayExpression}" — This function could modify state, trigger side effects, or perform unexpected operations. Safe built-in functions (Array.map, Object.keys, JSON.stringify) are allowed automatically.`;

      case 'low':
      default:
        return `ℹ️ ${reason}. Expression: "${displayExpression}" — Getter methods are typically safe, but custom getters may include logging or state changes. Quick confirmation recommended.`;
    }
  }

  /**
   * Detects CRITICAL system-level operations that can affect files, processes, or network.
   * These are the most dangerous operations that should always require explicit approval.
   *
   * If language is known, only checks language-specific patterns for efficiency.
   * Otherwise, checks all patterns as a safety measure for unknown languages.
   */
  private detectCriticalOperations(expression: string, language?: string): ValidationResult | null {
    // If language is known, only check language-specific critical operations
    if (language) {
      switch (language) {
        case 'javascript':
          return detectJavaScriptCritical(expression);
        case 'python':
          return detectPythonCritical(expression);
        case 'cpp':
          return detectCppCritical(expression);
        case 'csharp':
          return detectCSharpCritical(expression);
        case 'java':
          return detectJavaCritical(expression);
        case 'go':
          return detectGoCritical(expression);
        case 'rust':
          return detectRustCritical(expression);
        case 'ruby':
          return detectRubyCritical(expression);
        case 'php':
          return detectPHPCritical(expression);
        default:
          // For unknown languages, check all patterns as a safety measure
          return (
            detectJavaScriptCritical(expression) ||
            detectPythonCritical(expression) ||
            detectCppCritical(expression) ||
            detectCSharpCritical(expression) ||
            detectJavaCritical(expression) ||
            detectGoCritical(expression) ||
            detectRustCritical(expression) ||
            detectRubyCritical(expression) ||
            detectPHPCritical(expression)
          );
      }
    }

    // No language provided (no session), check all patterns
    return (
      detectJavaScriptCritical(expression) ||
      detectPythonCritical(expression) ||
      detectCppCritical(expression) ||
      detectCSharpCritical(expression) ||
      detectJavaCritical(expression) ||
      detectGoCritical(expression) ||
      detectRustCritical(expression) ||
      detectRubyCritical(expression) ||
      detectPHPCritical(expression)
    );
  }

  /**
   * Detects the programming language from the debug session type.
   * Uses caching to avoid redundant detection for the same session.
   */
  private detectLanguage(session: vscode.DebugSession): string {
    // Check cache first (Performance Optimization #2)
    const cached = this.languageCache.get(session.id);
    if (cached) {
      return cached;
    }

    const type = session.type.toLowerCase();
    let language: string;

    // Common debug adapter types
    // JavaScript/TypeScript family
    if (
      type === 'node' ||
      type === 'chrome' ||
      type === 'pwa-node' ||
      type === 'pwa-chrome' ||
      type === 'node2' ||
      type === 'extensionhost' ||
      type === 'pwa-extensionhost' ||
      type === 'msedge' ||
      type === 'pwa-msedge' ||
      type === 'webkit'
    ) {
      language = 'javascript';
    }
    // Python family
    else if (type === 'python' || type === 'debugpy' || type === 'pythonexperimental') {
      language = 'python';
    }
    // Go
    else if (type === 'go' || type === 'dlv' || type === 'go-debug') {
      language = 'go';
    }
    // Java family
    else if (type === 'java' || type === 'javadebug') {
      language = 'java';
    }
    // Rust (check before C++ since lldb is ambiguous)
    else if (type === 'rust' || type === 'rust-lldb') {
      language = 'rust';
    }
    // C/C++ family (includes lldb which could be Rust, but Rust-specific is checked above)
    else if (type === 'cppdbg' || type === 'lldb' || type === 'gdb' || type === 'cppvsdbg') {
      language = 'cpp';
    }
    // C# family
    else if (type === 'coreclr' || type === 'clr' || type === 'dotnet') {
      language = 'csharp';
    }
    // Ruby
    else if (type === 'ruby' || type === 'rdbg') {
      language = 'ruby';
    }
    // PHP
    else if (type === 'php' || type === 'php-debug') {
      language = 'php';
    } else {
      this.logger.debug(
        `Unknown debug session type: ${type}, using generic validation with whitelists`
      );
      language = type;
    }

    // Store in cache for future calls
    this.languageCache.set(session.id, language);
    return language;
  }

  /**
   * Apply language-specific validation rules if available.
   * Returns null if no specific rules apply, falling back to generic validation.
   */
  private validateByLanguage(expression: string, language: string): ValidationResult | null {
    switch (language) {
      case 'javascript':
        return validateJavaScript(
          expression,
          this.checkMutationMethods.bind(this),
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'python':
        return validatePython(
          expression,
          this.checkMutationMethods.bind(this),
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'csharp':
        return validateCSharp(
          expression,
          this.checkMutationMethods.bind(this),
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'java':
        return validateJava(
          expression,
          this.checkMutationMethods.bind(this),
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'cpp':
        return validateCpp(
          expression,
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'go':
        return validateGo(
          expression,
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'rust':
        return validateRust(
          expression,
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'ruby':
        return validateRuby(
          expression,
          this.checkMutationMethods.bind(this),
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      case 'php':
        return validatePHP(
          expression,
          this.checkAgainstWhitelists.bind(this),
          this.extractFunctionCalls.bind(this)
        );
      default:
        // No specific rules for this language
        return null;
    }
  }

  /**
   * Helper: Checks if expression contains any mutation methods from the given list.
   * Uses pre-compiled regex patterns from the cache for efficient matching.
   * Returns validation result if mutation detected, null otherwise.
   */
  private checkMutationMethods(
    expression: string,
    mutationMethods: string[]
  ): ValidationResult | null {
    for (const method of mutationMethods) {
      const regex = this.mutationRegexCache.get(method);
      if (regex && regex.test(expression)) {
        return {
          allowed: false,
          reason: `State Mutation: ${method}() modifies data`,
          riskLevel: 'high',
        };
      }
    }
    return null;
  }

  /**
   * Helper: Checks function calls against whitelists.
   * Returns validation result if unsafe call detected, null if all calls are safe.
   */
  private checkAgainstWhitelists(
    calls: string[],
    staticWhitelist: Set<string>,
    methodWhitelist: Set<string>
  ): ValidationResult | null {
    for (const call of calls) {
      // Check for suspicious bracket notation marker
      if (call === '__SUSPICIOUS_BRACKET_NOTATION__') {
        return {
          allowed: false,
          reason: 'Suspicious Pattern: bracket notation with expressions',
          riskLevel: 'high',
        };
      }

      // Check if it's a whitelisted static function
      if (staticWhitelist.has(call)) {
        continue;
      }

      // Check if it's a whitelisted method
      const methodName = call.split('.').pop() || call;
      if (methodWhitelist.has(methodName)) {
        continue;
      }

      // Check if it looks like a getter (LOW risk)
      if (this.isGetterPattern(methodName)) {
        return {
          allowed: false,
          reason: 'Getter Method',
          riskLevel: 'low',
        };
      }

      // Unknown function call
      return {
        allowed: false,
        reason: 'User-Defined Function',
        riskLevel: 'medium',
      };
    }
    return null;
  }

  /**
   * Extracts function/method call names from an expression.
   * Returns array of function names (e.g., ['map', 'Object.keys', 'myFunc'])
   * Also detects bracket notation calls (e.g., obj['method']())
   */
  private extractFunctionCalls(expression: string): string[] {
    const calls: string[] = [];

    // Match: identifier( or object.method( or module.function(
    // This regex captures the function/method name before the opening parenthesis
    const dotNotationRegex = /([\w.]+)\s*\(/g;
    let match;

    while ((match = dotNotationRegex.exec(expression)) !== null) {
      if (match[1]) {
        calls.push(match[1]);
      }
    }

    // Match bracket notation: obj['method']( or obj["method"](
    // Captures simple string literals in brackets
    const bracketNotationRegex = /\[(['"])(\w+)\1\]\s*\(/g;
    while ((match = bracketNotationRegex.exec(expression)) !== null) {
      if (match[2]) {
        // Add just the method name (not the full path)
        calls.push(match[2]);
      }
    }

    // Detect suspicious bracket notation patterns (concatenation, variables, template literals, escapes)
    // These should be flagged as unknown even if we can't extract the exact name

    // Pattern 1: Any + operator inside brackets (string concatenation)
    // Matches: ['a' + 'b'], ["x" + "y"], [a + b], ['del' + 'ete' + 'Task']
    if (/\[[^\]]*\+[^\]]*\]\s*\(/.test(expression)) {
      calls.push('__SUSPICIOUS_BRACKET_NOTATION__');
    }

    // Pattern 2: Template literals inside brackets
    // Matches: [`methodName`], [delete${x}]
    else if (/\[[^\]]*`[^\]]*\]\s*\(/.test(expression)) {
      calls.push('__SUSPICIOUS_BRACKET_NOTATION__');
    }

    // Pattern 3: Unquoted identifiers (variables) inside brackets
    // Matches: [variableName](, [x](, but NOT ['string'](
    // Look for brackets containing identifiers without surrounding quotes
    else if (/\[\s*[a-zA-Z_$][\w$]*\s*\]\s*\(/.test(expression)) {
      calls.push('__SUSPICIOUS_BRACKET_NOTATION__');
    }

    // Pattern 4: Character escape sequences (hex, unicode, octal) inside brackets
    // Matches: ['ad\x64Task'], ['add\u0054ask'], ['add\101sk']
    // These are evaluated by JS before validation, used to obfuscate method names
    else if (
      /\[[^\]]*\\(?:x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|[0-7]{1,3})[^\]]*\]\s*\(/.test(
        expression
      )
    ) {
      calls.push('__SUSPICIOUS_BRACKET_NOTATION__');
    }

    return calls;
  }

  /**
   * Generic pattern-based validation that works across most languages.
   * This is the fallback for languages without specific rules.
   * Uses JavaScript whitelists as a reasonable default since many languages share similar syntax.
   */
  private validateGeneric(expression: string): ValidationResult {
    // HIGH RISK: Assignment operators
    // Match: = but not ==, !=, <=, >=, ===, !==
    if (/(?<![=!<>])=(?!=)/.test(expression)) {
      return {
        allowed: false,
        reason: 'State Mutation: assignment modifies variables',
        riskLevel: 'high',
      };
    }

    // HIGH RISK: Compound assignment operators
    if (/(\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)/.test(expression)) {
      return {
        allowed: false,
        reason: 'State Mutation: compound assignment modifies variables',
        riskLevel: 'high',
      };
    }

    // HIGH RISK: Increment/decrement operators
    if (/(\+\+|--)/.test(expression)) {
      return {
        allowed: false,
        reason: 'State Mutation: increment/decrement modifies variables',
        riskLevel: 'high',
      };
    }

    const hasFunctionCalls = /[\w_\]]\s*\(/.test(expression);
    if (hasFunctionCalls) {
      // Even for unknown languages, check against JavaScript whitelists
      // since many languages (TypeScript, C#, Java, Go, etc.) have similar built-in functions
      const calls = this.extractFunctionCalls(expression);

      for (const call of calls) {
        // Check JavaScript static functions (Object.keys, JSON.stringify, Math.*)
        // These are common across many C-style languages
        if (this.jsSafeStaticFunctions.has(call)) {
          continue; // This call is safe
        }

        // Check JavaScript methods (filter, map, etc.)
        // Many languages have similar collection methods
        const methodName = call.split('.').pop() || call;
        if (this.jsSafeFunctions.has(methodName)) {
          continue; // This call is safe
        }

        // Also check Python built-ins as they're common debugging functions
        if (this.pythonSafeFunctions.has(methodName) || this.pythonSafeStaticFunctions.has(call)) {
          continue; // This call is safe
        }

        // Check if it looks like a getter (LOW risk) vs unknown function (MEDIUM risk)
        if (this.isGetterPattern(methodName)) {
          return {
            allowed: false,
            reason: 'Getter Method',
            riskLevel: 'low',
          };
        }

        // Unknown function call - not in any whitelist
        return {
          allowed: false,
          reason: 'User-Defined Function',
          riskLevel: 'medium',
        };
      }

      // All function calls are whitelisted (high-risk operators handled above)
      return { allowed: true };
    }

    // MEDIUM RISK: Bitwise operators (unusual in debugging, could be obfuscation)
    if (/[&|^~](?![&|])/.test(expression) || /(<<|>>)/.test(expression)) {
      return {
        allowed: false,
        reason: 'Unusual Pattern: bitwise operators (rare in debugging)',
        riskLevel: 'medium',
      };
    }

    // MEDIUM RISK: Lambda/arrow functions (could be used for side effects)
    // Match: => or lambda or func
    if (/(=>|->|\blambda\b|\bfunc\b)/.test(expression)) {
      return {
        allowed: false,
        reason: 'Anonymous Function: potential side effects',
        riskLevel: 'medium',
      };
    }

    // SAFE: Allow everything else (identifiers, properties, literals, safe operators)
    // This includes:
    // - Variable access: x, myVar
    // - Property access: obj.prop, obj['prop']
    // - Array access: arr[0], arr[i]
    // - Arithmetic: +, -, *, /, %
    // - Comparison: ==, !=, <, >, <=, >=, ===, !==
    // - Logical: &&, ||, !
    // - Ternary: ? :
    // - Literals: 123, "string", true, null
    return { allowed: true };
  }

  /**
   * Detects getter-like patterns that are likely read-only (LOW risk).
   * These follow common naming conventions for read-only operations.
   */
  private isGetterPattern(functionName: string): boolean {
    const name = functionName.toLowerCase();

    // Common getter prefixes
    if (
      name.startsWith('get') ||
      name.startsWith('is') ||
      name.startsWith('has') ||
      name.startsWith('should') ||
      name.startsWith('can') ||
      name.startsWith('to')
    ) {
      return true;
    }

    // Common read-only property-like methods
    if (name === 'length' || name === 'size' || name === 'count') {
      return true;
    }

    return false;
  }
}
