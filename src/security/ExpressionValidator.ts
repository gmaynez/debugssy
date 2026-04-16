// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

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
   * 2. HIGH - Prototype chain, global access, obfuscation, mutations
   * 3. MEDIUM - Unknown functions (user-defined)
   * 4. LOW - Getter patterns (likely safe)
   */
  validateExpression(expression: string, session?: vscode.DebugSession): ValidationResult {
    // Trim whitespace and normalize Unicode (NFKC) to defeat confusable character attacks
    // e.g. fullwidth ｅｖａｌ → eval, look-alike Cyrillic letters, etc.
    const trimmed = expression.trim().normalize('NFKC');

    if (!trimmed) {
      return { allowed: false, reason: 'Empty expression', riskLevel: 'low' };
    }

    // Detect language once if session is provided to optimize subsequent checks
    const language = session ? this.detectLanguage(session) : undefined;

    // 0. Check for comment injection (could hide malicious code)
    const commentCheck = this.detectCommentInjection(trimmed);
    if (commentCheck) {
      return commentCheck;
    }

    // 1. Check CRITICAL first (system-level dangers)
    // Pass language to enable language-specific critical operation detection
    const criticalCheck = this.detectCriticalOperations(trimmed, language);
    if (criticalCheck) {
      return criticalCheck;
    }

    // 1.5 Check for prototype chain manipulation (HIGH risk - can bypass all protections)
    const prototypeCheck = this.detectPrototypeAccess(trimmed);
    if (prototypeCheck) {
      return prototypeCheck;
    }

    // 1.6 Check for global object access (HIGH risk - access to dangerous APIs)
    const globalCheck = this.detectGlobalAccess(trimmed);
    if (globalCheck) {
      return globalCheck;
    }

    // 1.7 Check for string construction obfuscation (HIGH risk - can construct any function name)
    const obfuscationCheck = this.detectStringObfuscation(trimmed);
    if (obfuscationCheck) {
      return obfuscationCheck;
    }

    // 1.8 Check for dangerous reflection/meta-programming operations
    const metaCheck = this.detectDangerousMetaOperations(trimmed);
    if (metaCheck) {
      return metaCheck;
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
   * Detects prototype chain access which can be used to bypass security checks.
   * Patterns like obj.__proto__, obj.constructor.constructor, Object.prototype
   * can be used to access Function constructor and execute arbitrary code.
   */
  private detectPrototypeAccess(expression: string): ValidationResult | null {
    // Direct __proto__ access
    if (/\b__proto__\b/.test(expression)) {
      return {
        allowed: false,
        reason: 'Prototype Access: __proto__ can modify object behavior',
        riskLevel: 'high',
      };
    }

    // Direct prototype property access (but allow "prototype" in strings)
    // Match .prototype or ['prototype'] or ["prototype"] but not inside string literals
    if (/(?<!['""])\bprototype\b(?!['"])/.test(expression)) {
      // More precise check: look for property access patterns
      if (/\.\s*prototype\b|\[\s*['"]prototype['"]\s*\]/.test(expression)) {
        return {
          allowed: false,
          reason: 'Prototype Access: prototype manipulation can bypass security',
          riskLevel: 'high',
        };
      }
    }

    // Constructor chain access - commonly used for Function constructor bypass
    // Matches: .constructor.constructor, ['constructor']['constructor'], mixed
    if (
      /\.constructor\s*\.constructor|\['constructor'\]\s*\['constructor'\]|\["constructor"\]\s*\["constructor"\]/.test(
        expression
      )
    ) {
      return {
        allowed: false,
        reason: 'Prototype Chain: constructor chain can execute arbitrary code',
        riskLevel: 'high',
      };
    }

    // Single constructor access followed by call (e.g., obj.constructor("code"))
    if (/\.constructor\s*\(|\['constructor'\]\s*\(|\["constructor"\]\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Constructor Access: can be used to execute arbitrary code',
        riskLevel: 'high',
      };
    }

    // Object.getPrototypeOf chain (can traverse prototype chain)
    if (/Object\s*\.\s*getPrototypeOf\s*\(\s*Object\s*\.\s*getPrototypeOf/.test(expression)) {
      return {
        allowed: false,
        reason: 'Prototype Chain: nested getPrototypeOf can access Function',
        riskLevel: 'high',
      };
    }

    // Object.setPrototypeOf (can modify prototype chain)
    if (/Object\s*\.\s*setPrototypeOf\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Prototype Modification: setPrototypeOf can alter object behavior',
        riskLevel: 'high',
      };
    }

    // Reflect.setPrototypeOf
    if (/Reflect\s*\.\s*setPrototypeOf\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Prototype Modification: Reflect.setPrototypeOf can alter object behavior',
        riskLevel: 'high',
      };
    }

    return null;
  }

  /**
   * Detects access to global objects which provide access to dangerous APIs.
   * globalThis, window, global, self can access process, require, eval, etc.
   */
  private detectGlobalAccess(expression: string): ValidationResult | null {
    // globalThis access (universal global in modern JS)
    if (/\bglobalThis\b/.test(expression)) {
      return {
        allowed: false,
        reason: 'Global Access: globalThis provides access to dangerous APIs',
        riskLevel: 'high',
      };
    }

    // window object (browser global)
    if (/\bwindow\s*[[.]/.test(expression)) {
      return {
        allowed: false,
        reason: 'Global Access: window provides access to dangerous APIs',
        riskLevel: 'high',
      };
    }

    // global object (Node.js global)
    // Be careful not to match "global" as part of other words
    if (/\bglobal\s*[[.]/.test(expression) && !/globalThis/.test(expression)) {
      return {
        allowed: false,
        reason: 'Global Access: global provides access to dangerous APIs',
        riskLevel: 'high',
      };
    }

    // self object (Web Workers global)
    if (/\bself\s*[[.]/.test(expression)) {
      return {
        allowed: false,
        reason: 'Global Access: self provides access to dangerous APIs',
        riskLevel: 'high',
      };
    }

    // this.constructor pattern at start (common bypass)
    if (/^\s*this\s*\.\s*constructor/.test(expression)) {
      return {
        allowed: false,
        reason: 'Constructor Access: this.constructor can access Function',
        riskLevel: 'high',
      };
    }

    return null;
  }

  /**
   * Detects string construction patterns used to obfuscate function names.
   * String.fromCharCode, atob, Buffer.from can construct "eval", "exec", etc.
   */
  private detectStringObfuscation(expression: string): ValidationResult | null {
    // String.fromCharCode - can construct any string from char codes
    if (/String\s*\.\s*fromCharCode\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'String Obfuscation: fromCharCode can construct dangerous function names',
        riskLevel: 'high',
      };
    }

    // String.fromCodePoint - similar to fromCharCode
    if (/String\s*\.\s*fromCodePoint\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'String Obfuscation: fromCodePoint can construct dangerous function names',
        riskLevel: 'high',
      };
    }

    // atob - base64 decode can hide function names
    if (/\batob\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'String Obfuscation: atob can decode hidden function names',
        riskLevel: 'high',
      };
    }

    // Buffer.from with encoding - can decode obfuscated strings
    if (/Buffer\s*\.\s*from\s*\([^)]*,\s*['"](?:base64|hex)['"]/.test(expression)) {
      return {
        allowed: false,
        reason: 'String Obfuscation: Buffer.from can decode hidden function names',
        riskLevel: 'high',
      };
    }

    // Python: bytes.fromhex, codecs.decode
    if (/bytes\s*\.\s*fromhex\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'String Obfuscation: bytes.fromhex can decode hidden function names',
        riskLevel: 'high',
      };
    }

    if (/codecs\s*\.\s*decode\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'String Obfuscation: codecs.decode can decode hidden function names',
        riskLevel: 'high',
      };
    }

    // chr() combined with ord() or int() for char-by-char construction (Python)
    // Pattern: chr(number) repeated or in comprehension
    if (/chr\s*\([^)]+\)\s*\+\s*chr\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'String Obfuscation: chr() concatenation can construct dangerous strings',
        riskLevel: 'high',
      };
    }

    // Detect expressions that index into strings/arrays using constructed indices
    // Pattern: someString[expression]() where expression involves math/function calls
    if (/\[\s*(?:\d+\s*[+\-*/]\s*\d+|\w+\s*\([^)]*\))\s*\]\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Index Obfuscation: computed index access with call',
        riskLevel: 'high',
      };
    }

    return null;
  }

  /**
   * Detects dangerous meta-programming and reflection operations.
   * These can modify object behavior or invoke arbitrary methods.
   */
  private detectDangerousMetaOperations(expression: string): ValidationResult | null {
    // Object.defineProperty - can add getters/setters with side effects
    if (/Object\s*\.\s*definePropert(?:y|ies)\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Meta-programming: defineProperty can modify object behavior',
        riskLevel: 'high',
      };
    }

    // Reflect.defineProperty
    if (/Reflect\s*\.\s*defineProperty\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Meta-programming: Reflect.defineProperty can modify object behavior',
        riskLevel: 'high',
      };
    }

    // Proxy constructor - can intercept any operation
    if (/new\s+Proxy\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Meta-programming: Proxy can intercept and modify any operation',
        riskLevel: 'high',
      };
    }

    // Reflect.apply, Reflect.construct - can invoke arbitrary functions
    if (/Reflect\s*\.\s*(?:apply|construct)\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Meta-programming: Reflect.apply/construct can invoke arbitrary functions',
        riskLevel: 'high',
      };
    }

    // Function.prototype.apply/call/bind with non-literal first argument
    // These are commonly used to change 'this' context for exploits
    if (
      /\.(?:apply|call|bind)\s*\(\s*(?:this|null|undefined|window|global|globalThis)/.test(
        expression
      )
    ) {
      return {
        allowed: false,
        reason: 'Meta-programming: apply/call/bind with global context',
        riskLevel: 'high',
      };
    }

    // with statement (changes scope chain) - rare but dangerous
    if (/\bwith\s*\(/.test(expression)) {
      return {
        allowed: false,
        reason: 'Scope Manipulation: with statement can change variable resolution',
        riskLevel: 'high',
      };
    }

    // Python's getattr/setattr/delattr with variable attribute names
    if (/(?:getattr|setattr|delattr)\s*\([^,]+,\s*[^'")\s]/.test(expression)) {
      // Matches getattr(obj, variable) but not getattr(obj, "literal")
      return {
        allowed: false,
        reason: 'Meta-programming: dynamic attribute access can bypass validation',
        riskLevel: 'high',
      };
    }

    // Python's vars(), locals(), globals() - access to scope dictionaries
    if (/\b(?:vars|locals|globals)\s*\(\s*\)/.test(expression)) {
      return {
        allowed: false,
        reason: 'Scope Access: vars/locals/globals expose internal scope',
        riskLevel: 'high',
      };
    }

    return null;
  }

  /**
   * Detects comment injection which could hide malicious code.
   * Examples: fs/star-star/.unlink(), process//newline.exit()
   */
  private detectCommentInjection(expression: string): ValidationResult | null {
    // JavaScript/C-style block comments: /* */
    if (/\/\*[\s\S]*?\*\//.test(expression)) {
      return {
        allowed: false,
        reason: 'Comment Injection: block comments can hide malicious code',
        riskLevel: 'high',
      };
    }

    // JavaScript/Python single-line comments: // or #
    // Note: # in Python, // in JS/C++/Java/etc.
    // Exclude :// (URLs like https://), # in strings, and Ruby symbols
    if (/(?<!:)\/\//.test(expression)) {
      return {
        allowed: false,
        reason: 'Comment Injection: line comments can hide malicious code',
        riskLevel: 'high',
      };
    }

    // Python # comments - but not in strings or as part of other constructs
    // Use negative lookbehind to exclude # after quotes or colons
    if (/(?<!['":\w])#(?![{[])/.test(expression)) {
      return {
        allowed: false,
        reason: 'Comment Injection: line comments can hide malicious code',
        riskLevel: 'high',
      };
    }

    // HTML comments (could be used in some contexts)
    if (/<!--[\s\S]*?-->/.test(expression)) {
      return {
        allowed: false,
        reason: 'Comment Injection: HTML comments detected',
        riskLevel: 'high',
      };
    }

    return null;
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
    if (/(?<![&|])[&|](?![&|=])|\^(?![=])|~/.test(expression) || /(<<|>>)/.test(expression)) {
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
