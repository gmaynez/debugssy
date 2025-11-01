// SPDX-License-Identifier: Apache-2.0

import * as vscode from "vscode";
import { Logger } from "../utils/Logger";

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type ValidationLevel = "strict" | "moderate" | "permissive" | "disabled";

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  riskLevel?: RiskLevel;
}

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
  private readonly jsSafeFunctions = new Set([
    // Array read-only methods
    "filter",
    "map",
    "reduce",
    "reduceRight",
    "find",
    "findIndex",
    "findLast",
    "findLastIndex",
    "some",
    "every",
    "includes",
    "indexOf",
    "lastIndexOf",
    "slice",
    "concat",
    "join",
    "at",
    "entries",
    "keys",
    "values",
    "flat",
    "flatMap",
    "toSorted",
    "toReversed",
    "toSpliced",
    // String read-only methods
    "charAt",
    "charCodeAt",
    "codePointAt",
    "indexOf",
    "lastIndexOf",
    "includes",
    "startsWith",
    "endsWith",
    "slice",
    "substring",
    "substr",
    "split",
    "match",
    "matchAll",
    "search",
    "toLowerCase",
    "toUpperCase",
    "trim",
    "trimStart",
    "trimEnd",
    "repeat",
    "padStart",
    "padEnd",
    "normalize",
    "localeCompare",
    "toString",
    "valueOf",
    // Object utilities (as method calls)
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "getOwnPropertyDescriptor",
    "getOwnPropertyNames",
    "getOwnPropertySymbols",
    // Math methods (all are pure)
    "abs",
    "acos",
    "acosh",
    "asin",
    "asinh",
    "atan",
    "atan2",
    "atanh",
    "cbrt",
    "ceil",
    "clz32",
    "cos",
    "cosh",
    "exp",
    "expm1",
    "floor",
    "fround",
    "hypot",
    "imul",
    "log",
    "log10",
    "log1p",
    "log2",
    "max",
    "min",
    "pow",
    "random",
    "round",
    "sign",
    "sin",
    "sinh",
    "sqrt",
    "tan",
    "tanh",
    "trunc",
    // Number methods
    "toExponential",
    "toFixed",
    "toPrecision",
    "toString",
    "valueOf",
    // Date getters (read-only)
    "getDate",
    "getDay",
    "getFullYear",
    "getHours",
    "getMilliseconds",
    "getMinutes",
    "getMonth",
    "getSeconds",
    "getTime",
    "getTimezoneOffset",
    "getUTCDate",
    "getUTCDay",
    "getUTCFullYear",
    "getUTCHours",
    "getUTCMilliseconds",
    "getUTCMinutes",
    "getUTCMonth",
    "getUTCSeconds",
    "toDateString",
    "toISOString",
    "toJSON",
    "toLocaleDateString",
    "toLocaleString",
    "toLocaleTimeString",
    "toString",
    "toTimeString",
    "toUTCString",
    "valueOf",
    // Common getters pattern
    "get",
    "has",
    "size",
    "length",
  ]);

  // Safe built-in JavaScript/TypeScript static functions
  private readonly jsSafeStaticFunctions = new Set([
    // Object static methods
    "Object.keys",
    "Object.values",
    "Object.entries",
    "Object.fromEntries",
    "Object.getOwnPropertyNames",
    "Object.getOwnPropertyDescriptor",
    "Object.getOwnPropertyDescriptors",
    "Object.getOwnPropertySymbols",
    "Object.getPrototypeOf",
    "Object.is",
    "Object.hasOwn",
    "Object.isExtensible",
    "Object.isFrozen",
    "Object.isSealed",
    // Array static methods
    "Array.isArray",
    "Array.from",
    "Array.of",
    // JSON methods
    "JSON.stringify",
    "JSON.parse",
    // Number static methods
    "Number.isFinite",
    "Number.isInteger",
    "Number.isNaN",
    "Number.isSafeInteger",
    "Number.parseFloat",
    "Number.parseInt",
    // String static methods
    "String.fromCharCode",
    "String.fromCodePoint",
    // Math (entire namespace is safe)
    "Math.abs",
    "Math.acos",
    "Math.acosh",
    "Math.asin",
    "Math.asinh",
    "Math.atan",
    "Math.atan2",
    "Math.atanh",
    "Math.cbrt",
    "Math.ceil",
    "Math.clz32",
    "Math.cos",
    "Math.cosh",
    "Math.exp",
    "Math.expm1",
    "Math.floor",
    "Math.fround",
    "Math.hypot",
    "Math.imul",
    "Math.log",
    "Math.log10",
    "Math.log1p",
    "Math.log2",
    "Math.max",
    "Math.min",
    "Math.pow",
    "Math.random",
    "Math.round",
    "Math.sign",
    "Math.sin",
    "Math.sinh",
    "Math.sqrt",
    "Math.tan",
    "Math.tanh",
    "Math.trunc",
    // Date constructors (when used for parsing)
    "Date.now",
    "Date.parse",
    "Date.UTC",
  ]);

  private logger: Logger;

  // Pre-compiled regex patterns for mutation detection to avoid repeated compilation
  private readonly mutationRegexCache: Map<string, RegExp>;

  // Language detection cache per session to avoid redundant lookups
  private readonly languageCache: Map<string, string>;

  // Disposable for the session termination listener
  private readonly sessionTerminationDisposable: vscode.Disposable | undefined;
  // Safe built-in Python functions and methods
  private readonly pythonSafeFunctions = new Set([
    // List read-only methods
    "count",
    "index",
    "copy",
    // String read-only methods
    "capitalize",
    "casefold",
    "center",
    "count",
    "encode",
    "endswith",
    "expandtabs",
    "find",
    "format",
    "format_map",
    "index",
    "isalnum",
    "isalpha",
    "isascii",
    "isdecimal",
    "isdigit",
    "isidentifier",
    "islower",
    "isnumeric",
    "isprintable",
    "isspace",
    "istitle",
    "isupper",
    "join",
    "ljust",
    "lower",
    "lstrip",
    "partition",
    "replace",
    "rfind",
    "rindex",
    "rjust",
    "rpartition",
    "rsplit",
    "rstrip",
    "split",
    "splitlines",
    "startswith",
    "strip",
    "swapcase",
    "title",
    "translate",
    "upper",
    "zfill",
    // Dict read-only methods
    "get",
    "items",
    "keys",
    "values",
    "copy",
    // Set read-only methods
    "copy",
    "difference",
    "intersection",
    "isdisjoint",
    "issubset",
    "issuperset",
    "symmetric_difference",
    "union",
    // Common built-in functions
    "len",
    "type",
    "str",
    "repr",
    "int",
    "float",
    "bool",
    "list",
    "tuple",
    "dict",
    "set",
    "abs",
    "all",
    "any",
    "bin",
    "chr",
    "dir",
    "divmod",
    "enumerate",
    "filter",
    "format",
    "frozenset",
    "hash",
    "hex",
    "id",
    "isinstance",
    "issubclass",
    "iter",
    "map",
    "max",
    "min",
    "oct",
    "ord",
    "pow",
    "range",
    "reversed",
    "round",
    "slice",
    "sorted",
    "sum",
    "zip",
    // Common getters pattern
    "get",
    "has",
    "size",
  ]);
  // Safe built-in Python module functions (module.function)
  private readonly pythonSafeStaticFunctions = new Set([
    // json module
    "json.dumps",
    "json.loads",
    // math module (all are pure)
    "math.ceil",
    "math.floor",
    "math.trunc",
    "math.sqrt",
    "math.pow",
    "math.exp",
    "math.log",
    "math.log10",
    "math.log2",
    "math.sin",
    "math.cos",
    "math.tan",
    "math.asin",
    "math.acos",
    "math.atan",
    "math.sinh",
    "math.cosh",
    "math.tanh",
    "math.degrees",
    "math.radians",
    "math.isnan",
    "math.isinf",
    "math.isfinite",
    // re module (read-only)
    "re.match",
    "re.search",
    "re.findall",
    "re.finditer",
    "re.split",
    // datetime parsing
    "datetime.datetime.now",
    "datetime.datetime.strptime",
    "datetime.date.today",
  ]);
  // Safe C# methods (LINQ, Collections, String)
  private readonly csharpSafeFunctions = new Set([
    // LINQ read-only methods
    "Select",
    "Where",
    "OrderBy",
    "OrderByDescending",
    "ThenBy",
    "ThenByDescending",
    "First",
    "FirstOrDefault",
    "Last",
    "LastOrDefault",
    "Single",
    "SingleOrDefault",
    "ElementAt",
    "ElementAtOrDefault",
    "Any",
    "All",
    "Contains",
    "Count",
    "Sum",
    "Average",
    "Min",
    "Max",
    "Aggregate",
    "Take",
    "Skip",
    "TakeWhile",
    "SkipWhile",
    "Distinct",
    "GroupBy",
    "Join",
    "Concat",
    "Union",
    "Intersect",
    "Except",
    "Zip",
    "OfType",
    "Cast",
    "ToList",
    "ToArray",
    "ToDictionary",
    "ToHashSet",
    "AsEnumerable",
    "AsQueryable",
    // String methods (read-only)
    "Substring",
    "Contains",
    "StartsWith",
    "EndsWith",
    "IndexOf",
    "LastIndexOf",
    "Split",
    "Join",
    "Replace",
    "Trim",
    "TrimStart",
    "TrimEnd",
    "ToUpper",
    "ToLower",
    "ToUpperInvariant",
    "ToLowerInvariant",
    "PadLeft",
    "PadRight",
    "Format",
    "IsNullOrEmpty",
    "IsNullOrWhiteSpace",
    // Collection read-only methods
    "GetEnumerator",
    "Count",
    "Length",
    "Contains",
    "IndexOf",
    "Find",
    "FindAll",
    "FindIndex",
    "FindLast",
    "FindLastIndex",
    "Exists",
    "TrueForAll",
    "BinarySearch",
    "CopyTo",
    // Object methods
    "ToString",
    "GetHashCode",
    "GetType",
    "Equals",
  ]);
  // Safe C# static functions (System namespace)
  private readonly csharpSafeStaticFunctions = new Set([
    // Math (all pure)
    "Math.Abs",
    "Math.Acos",
    "Math.Asin",
    "Math.Atan",
    "Math.Atan2",
    "Math.Ceiling",
    "Math.Cos",
    "Math.Cosh",
    "Math.Exp",
    "Math.Floor",
    "Math.Log",
    "Math.Log10",
    "Math.Max",
    "Math.Min",
    "Math.Pow",
    "Math.Round",
    "Math.Sign",
    "Math.Sin",
    "Math.Sinh",
    "Math.Sqrt",
    "Math.Tan",
    "Math.Tanh",
    "Math.Truncate",
    // Convert (type conversions)
    "Convert.ToInt32",
    "Convert.ToInt64",
    "Convert.ToDouble",
    "Convert.ToDecimal",
    "Convert.ToString",
    "Convert.ToBoolean",
    "Convert.ToDateTime",
    "Convert.ToBase64String",
    "Convert.FromBase64String",
    // String static methods
    "String.Join",
    "String.Concat",
    "String.Format",
    "String.IsNullOrEmpty",
    "String.IsNullOrWhiteSpace",
    // DateTime (read-only)
    "DateTime.Now",
    "DateTime.UtcNow",
    "DateTime.Today",
    "DateTime.Parse",
    "DateTime.TryParse",
    // Enumerable static methods
    "Enumerable.Range",
    "Enumerable.Repeat",
    "Enumerable.Empty",
  ]);
  // Safe Java methods (Stream API, Collections, String)
  private readonly javaSafeFunctions = new Set([
    // Stream API (read-only)
    "stream",
    "parallelStream",
    "filter",
    "map",
    "flatMap",
    "distinct",
    "sorted",
    "peek",
    "limit",
    "skip",
    "forEach",
    "forEachOrdered",
    "toArray",
    "reduce",
    "collect",
    "min",
    "max",
    "count",
    "anyMatch",
    "allMatch",
    "noneMatch",
    "findFirst",
    "findAny",
    "mapToInt",
    "mapToLong",
    "mapToDouble",
    "flatMapToInt",
    "flatMapToLong",
    "flatMapToDouble",
    // Collection read-only methods
    "size",
    "isEmpty",
    "contains",
    "containsAll",
    "get",
    "indexOf",
    "lastIndexOf",
    "iterator",
    "listIterator",
    "subList",
    "toArray",
    "stream",
    // String methods (read-only)
    "length",
    "charAt",
    "substring",
    "indexOf",
    "lastIndexOf",
    "startsWith",
    "endsWith",
    "contains",
    "toLowerCase",
    "toUpperCase",
    "trim",
    "strip",
    "split",
    "join",
    "replace",
    "replaceAll",
    "replaceFirst",
    "matches",
    "format",
    "valueOf",
    "concat",
    "isEmpty",
    "isBlank",
    "repeat",
    "lines",
    "chars",
    "codePoints",
    // Object methods
    "toString",
    "hashCode",
    "equals",
    "getClass",
  ]);
  // Safe Java static functions
  private readonly javaSafeStaticFunctions = new Set([
    // Math (all pure)
    "Math.abs",
    "Math.acos",
    "Math.asin",
    "Math.atan",
    "Math.atan2",
    "Math.ceil",
    "Math.cos",
    "Math.cosh",
    "Math.exp",
    "Math.floor",
    "Math.log",
    "Math.log10",
    "Math.max",
    "Math.min",
    "Math.pow",
    "Math.round",
    "Math.signum",
    "Math.sin",
    "Math.sinh",
    "Math.sqrt",
    "Math.tan",
    "Math.tanh",
    "Math.toDegrees",
    "Math.toRadians",
    // Collections utilities (read-only)
    "Collections.max",
    "Collections.min",
    "Collections.frequency",
    "Collections.binarySearch",
    "Collections.indexOfSubList",
    "Collections.lastIndexOfSubList",
    "Collections.unmodifiableList",
    "Collections.unmodifiableSet",
    "Collections.unmodifiableMap",
    // Arrays utilities (read-only)
    "Arrays.toString",
    "Arrays.asList",
    "Arrays.binarySearch",
    "Arrays.equals",
    "Arrays.stream",
    "Arrays.copyOf",
    "Arrays.copyOfRange",
    // String static methods
    "String.valueOf",
    "String.format",
    "String.join",
    // System read-only
    "System.currentTimeMillis",
    "System.nanoTime",
    "System.getProperty",
  ]);
  // Safe C/C++ functions (standard library read-only)
  private readonly cppSafeFunctions = new Set([
    // String functions (read-only)
    "strlen",
    "strcmp",
    "strncmp",
    "strchr",
    "strrchr",
    "strstr",
    "strcpy",
    "strncpy",
    "strcat",
    "strncat",
    "strcspn",
    "strspn",
    "strpbrk",
    "strtok",
    // Math functions (all pure)
    "abs",
    "fabs",
    "ceil",
    "floor",
    "sqrt",
    "pow",
    "exp",
    "log",
    "log10",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "atan2",
    "sinh",
    "cosh",
    "tanh",
    "fmod",
    "round",
    // Memory read operations (safe in debugging)
    "memcmp",
    "strlen",
    "sizeof",
    // Type conversion
    "atoi",
    "atof",
    "atol",
    "strtol",
    "strtod",
    "strtoul",
    // Character functions
    "isalpha",
    "isdigit",
    "isalnum",
    "isspace",
    "isupper",
    "islower",
    "toupper",
    "tolower",
    // Time functions (read-only)
    "time",
    "clock",
    "difftime",
    "strftime",
    "localtime",
    "gmtime",
  ]);
  // Safe Go functions (standard library read-only)
  private readonly goSafeFunctions = new Set([
    // String functions
    "len",
    "cap",
    "append",
    "copy",
    "strings.Contains",
    "strings.HasPrefix",
    "strings.HasSuffix",
    "strings.Index",
    "strings.LastIndex",
    "strings.Split",
    "strings.Join",
    "strings.Replace",
    "strings.ToUpper",
    "strings.ToLower",
    "strings.Trim",
    "strings.TrimSpace",
    // Math functions
    "math.Abs",
    "math.Ceil",
    "math.Floor",
    "math.Max",
    "math.Min",
    "math.Sqrt",
    "math.Pow",
    "math.Sin",
    "math.Cos",
    "math.Tan",
    "math.Log",
    "math.Exp",
    "math.Round",
    // fmt (read-only formatting)
    "fmt.Sprintf",
    "fmt.Sprint",
    "fmt.Sprintln",
    // Time (read-only)
    "time.Now",
    "time.Since",
    "time.Until",
    "time.Parse",
    "time.Format",
    // Conversion
    "strconv.Atoi",
    "strconv.Itoa",
    "strconv.ParseInt",
    "strconv.ParseFloat",
    "strconv.FormatInt",
  ]);

  constructor() {
    this.logger = Logger.getInstance();

    // Pre-compile all mutation regex patterns to avoid repeated compilation
    this.mutationRegexCache = new Map();
    const allMutationMethods = [
      // JavaScript/TypeScript
      "push",
      "pop",
      "shift",
      "unshift",
      "splice",
      "sort",
      "reverse",
      "fill",
      "copyWithin",
      "delete",
      "clear",
      "set",
      "add",
      // Python
      "append",
      "extend",
      "insert",
      "remove",
      "clear",
      "discard",
      "update",
      // C#
      "Add",
      "Remove",
      "RemoveAt",
      "RemoveAll",
      "Insert",
      "Sort",
      "Reverse",
      "AddRange",
      "InsertRange",
      "RemoveRange",
      "Push",
      "Pop",
      "Enqueue",
      "Dequeue",
      // Java
      "addAll",
      "removeAll",
      "retainAll",
      "put",
      "putAll",
      "replaceAll",
      "shuffle",
    ];

    for (const method of allMutationMethods) {
      this.mutationRegexCache.set(
        method,
        new RegExp(`(?:\\.|\\?\\.)${method}\\s*\\(`, "i"),
      );
    }

    // Initialize language cache
    this.languageCache = new Map();

    // Listen for debug session termination to clear cache entries
    // Store the disposable for proper cleanup when validator is disposed
    if (typeof vscode !== "undefined") {
      this.sessionTerminationDisposable =
        vscode.debug.onDidTerminateDebugSession((session) => {
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
  validateExpression(
    expression: string,
    session?: vscode.DebugSession,
  ): ValidationResult {
    // Trim whitespace for consistent validation
    const trimmed = expression.trim();

    if (!trimmed) {
      return { allowed: false, reason: "Empty expression", riskLevel: "low" };
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
  shouldElicit(
    riskLevel: RiskLevel | undefined,
    validationLevel: ValidationLevel,
  ): boolean {
    if (validationLevel === "disabled") {
      return false;
    }
    if (!riskLevel) {
      return false;
    }

    // Map validation levels to minimum risk thresholds
    const thresholds: Record<ValidationLevel, RiskLevel[]> = {
      strict: ["critical", "high", "medium", "low"], // Elicit for all risks
      moderate: ["critical", "high", "medium"], // Elicit for CRITICAL + HIGH + MEDIUM
      permissive: ["critical", "high"], // Elicit for CRITICAL + HIGH only
      disabled: [], // Never elicit
    };

    return thresholds[validationLevel].includes(riskLevel);
  }

  /**
   * Formats a validation result into a user-friendly message for elicitation.
   * Message severity is proportionate to the actual risk level.
   * @param _expression - The expression being validated (shown by MCP client in parameters, unused here)
   * @param result - The validation result containing risk level and reason
   */
  formatElicitationMessage(
    _expression: string,
    result: ValidationResult,
  ): string {
    // Expression is shown in the MCP client's parameter display, so we don't repeat it in the message
    const { riskLevel, reason } = result;

    switch (riskLevel) {
      case "critical":
        return `🔴 CRITICAL: ${reason}

This operation can modify files, execute processes, or make network requests.

Only proceed if you fully understand the consequences.`;

      case "high":
        return `⚠️ ${reason}

This will modify your application's state during debugging. Changes may cause unexpected behavior or mask bugs.`;

      case "medium":
        return `⚠️ ${reason}

This function could modify state, trigger side effects, or perform unexpected operations. Safe built-in functions (Array.map, Object.keys, JSON.stringify) are allowed automatically.`;

      case "low":
      default:
        return `ℹ️ ${reason}

Getter methods are typically safe, but custom getters may include logging or state changes. Quick confirmation recommended.`;
    }
  }

  /**
   * Detects CRITICAL system-level operations that can affect files, processes, or network.
   * These are the most dangerous operations that should always require explicit approval.
   *
   * If language is known, only checks language-specific patterns for efficiency.
   * Otherwise, checks all patterns as a safety measure for unknown languages.
   */
  private detectCriticalOperations(
    expression: string,
    language?: string,
  ): ValidationResult | null {
    // If language is known, only check language-specific critical operations
    if (language) {
      switch (language) {
        case "javascript":
          return this.detectJavaScriptCritical(expression);
        case "python":
          return this.detectPythonCritical(expression);
        case "cpp":
          return this.detectCppCritical(expression);
        case "csharp":
          return this.detectCSharpCritical(expression);
        case "java":
          return this.detectJavaCritical(expression);
        default:
          // For unknown languages, check all patterns as a safety measure
          return (
            this.detectJavaScriptCritical(expression) ||
            this.detectPythonCritical(expression) ||
            this.detectCppCritical(expression) ||
            this.detectCSharpCritical(expression) ||
            this.detectJavaCritical(expression)
          );
      }
    }

    // No language provided (no session), check all patterns
    return (
      this.detectJavaScriptCritical(expression) ||
      this.detectPythonCritical(expression) ||
      this.detectCppCritical(expression) ||
      this.detectCSharpCritical(expression) ||
      this.detectJavaCritical(expression)
    );
  }

  /**
   * Detects critical JavaScript/Node.js operations (file system, process, network).
   */
  private detectJavaScriptCritical(
    expression: string,
  ): ValidationResult | null {
    // File system operations
    if (
      /\bfs\s*\.\s*(unlink|rmdir|rm|write|mkdir|rename|delete|chmod|chown|truncate|appendFile|writeFile)/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "File System Operation: can modify/delete files",
        riskLevel: "critical",
      };
    }

    // Process execution
    if (
      /\b(child_process|exec|execSync|spawn|spawnSync|fork|execFile)\s*[.([]/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "Process Execution: can run system commands",
        riskLevel: "critical",
      };
    }

    // Process control
    if (/\bprocess\s*\.\s*(exit|kill|abort)\s*\(/i.test(expression)) {
      return {
        allowed: false,
        reason: "Process Control: can terminate application",
        riskLevel: "critical",
      };
    }

    // Network operations (fetch, axios, http)
    if (
      /\b(fetch|axios|XMLHttpRequest)\s*[.([]/i.test(expression) ||
      /\bhttps?\s*\.\s*(get|post|put|delete|request)/i.test(expression)
    ) {
      return {
        allowed: false,
        reason: "Network Operation: can make external requests",
        riskLevel: "critical",
      };
    }

    // Dynamic module loading - only flag dangerous modules
    if (
      /\brequire\s*\(\s*['"](?:fs|child_process|net|http|https|crypto|vm)['"]/.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "System Module Loading: dangerous module detected",
        riskLevel: "critical",
      };
    }

    return null;
  }

  /**
   * Detects critical Python operations (os, subprocess, file operations).
   */
  private detectPythonCritical(expression: string): ValidationResult | null {
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
   * Detects critical C/C++ operations (system, file operations).
   */
  private detectCppCritical(expression: string): ValidationResult | null {
    // System and process operations
    if (
      /\b(system|exec[lv]?p?e?|popen|_popen|_wsystem)\s*\(/i.test(expression)
    ) {
      return {
        allowed: false,
        reason: "System Command: can execute shell commands (C/C++)",
        riskLevel: "critical",
      };
    }

    // File operations
    if (
      /\b(remove|unlink|rmdir|rename|chmod|chown|creat|mkdir)\s*\(/i.test(
        expression,
      ) ||
      /\b(fopen|freopen)\s*\([^)]*['"][wa]/i.test(expression)
    ) {
      return {
        allowed: false,
        reason: "File System Operation: can modify or delete files (C/C++)",
        riskLevel: "critical",
      };
    }

    return null;
  }

  /**
   * Detects critical C# operations (Process, File, Directory, Network).
   */
  private detectCSharpCritical(expression: string): ValidationResult | null {
    // Process operations
    if (
      /\b(Process\s*\.\s*Start|ProcessStartInfo|System\s*\.\s*Diagnostics\s*\.\s*Process)\s*[.([]/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "Process Execution: can run system commands (C#)",
        riskLevel: "critical",
      };
    }

    // File and Directory operations
    if (
      /\b(File|Directory)\s*\.\s*(Delete|WriteAllText|WriteAllBytes|Create|Move|Replace|Copy|AppendAllText|CreateDirectory)\s*\(/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "File System Operation: can modify/delete files (C#)",
        riskLevel: "critical",
      };
    }

    // FileStream/StreamWriter with write modes
    if (
      /\b(FileStream|StreamWriter|FileInfo|DirectoryInfo)\s*\(/i.test(
        expression,
      ) &&
      /\b(FileMode\s*\.\s*(Create|Append|Truncate|OpenOrCreate)|FileAccess\s*\.\s*Write)/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "File System Operation: opening file for writing (C#)",
        riskLevel: "critical",
      };
    }

    // Network operations
    if (/\b(HttpClient|WebClient|HttpWebRequest)\s*[.([]/i.test(expression)) {
      return {
        allowed: false,
        reason: "Network Operation: can make external requests (C#)",
        riskLevel: "critical",
      };
    }

    return null;
  }

  /**
   * Detects critical Java operations (Runtime.exec, File, Network).
   */
  private detectJavaCritical(expression: string): ValidationResult | null {
    // Process execution
    if (
      /\b(Runtime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec|ProcessBuilder)\s*[.([]/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "Process Execution: can run system commands (Java)",
        riskLevel: "critical",
      };
    }

    // File operations
    if (
      /\b(File|Files)\s*\.\s*(delete|createNewFile|mkdir|mkdirs|renameTo|write|writeString|writeBytes|move|copy|deleteIfExists)\s*\(/i.test(
        expression,
      ) ||
      /\bnew\s+File(Writer|OutputStream|Reader|InputStream)\s*\(/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "File System Operation: can modify/delete files (Java)",
        riskLevel: "critical",
      };
    }

    // Network operations
    if (
      /\b(HttpClient|HttpURLConnection|URL\s*\([^)]*\)\s*\.\s*openConnection|URLConnection)\s*[.([]/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "Network Operation: can make external requests (Java)",
        riskLevel: "critical",
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
      type === "node" ||
      type === "chrome" ||
      type === "pwa-node" ||
      type === "pwa-chrome" ||
      type === "node2" ||
      type === "extensionhost" ||
      type === "pwa-extensionhost" ||
      type === "msedge" ||
      type === "pwa-msedge" ||
      type === "webkit"
    ) {
      language = "javascript";
    }
    // Python family
    else if (
      type === "python" ||
      type === "debugpy" ||
      type === "pythonexperimental"
    ) {
      language = "python";
    }
    // Go
    else if (type === "go" || type === "dlv" || type === "go-debug") {
      language = "go";
    }
    // Java family
    else if (type === "java" || type === "javadebug") {
      language = "java";
    }
    // Rust (check before C++ since lldb is ambiguous)
    else if (type === "rust" || type === "rust-lldb") {
      language = "rust";
    }
    // C/C++ family (includes lldb which could be Rust, but Rust-specific is checked above)
    else if (
      type === "cppdbg" ||
      type === "lldb" ||
      type === "gdb" ||
      type === "cppvsdbg"
    ) {
      language = "cpp";
    }
    // C# family
    else if (type === "coreclr" || type === "clr" || type === "dotnet") {
      language = "csharp";
    }
    // Ruby
    else if (type === "ruby" || type === "rdbg") {
      language = "ruby";
    }
    // PHP
    else if (type === "php" || type === "php-debug") {
      language = "php";
    } else {
      this.logger.debug(
        `Unknown debug session type: ${type}, using generic validation with whitelists`,
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
  private validateByLanguage(
    expression: string,
    language: string,
  ): ValidationResult | null {
    switch (language) {
      case "javascript":
        return this.validateJavaScript(expression);
      case "python":
        return this.validatePython(expression);
      case "csharp":
        return this.validateCSharp(expression);
      case "java":
        return this.validateJava(expression);
      case "cpp":
        return this.validateCpp(expression);
      case "go":
        return this.validateGo(expression);
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
    mutationMethods: string[],
  ): ValidationResult | null {
    for (const method of mutationMethods) {
      const regex = this.mutationRegexCache.get(method);
      if (regex && regex.test(expression)) {
        return {
          allowed: false,
          reason: `State Mutation: ${method}() modifies data`,
          riskLevel: "high",
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
    methodWhitelist: Set<string>,
  ): ValidationResult | null {
    for (const call of calls) {
      // Check if it's a whitelisted static function
      if (staticWhitelist.has(call)) {
        continue;
      }

      // Check if it's a whitelisted method
      const methodName = call.split(".").pop() || call;
      if (methodWhitelist.has(methodName)) {
        continue;
      }

      // Check if it looks like a getter (LOW risk)
      if (this.isGetterPattern(methodName)) {
        return {
          allowed: false,
          reason: `Getter Method: ${call}()`,
          riskLevel: "low",
        };
      }

      // Unknown function call
      return {
        allowed: false,
        reason: `User-Defined Function: ${call}()`,
        riskLevel: "medium",
      };
    }
    return null;
  }

  /**
   * JavaScript/TypeScript specific validation.
   * Allows whitelisted safe functions, blocks mutation methods and code generation.
   */
  private validateJavaScript(expression: string): ValidationResult | null {
    // Block common mutation methods
    const mutationCheck = this.checkMutationMethods(expression, [
      "push",
      "pop",
      "shift",
      "unshift",
      "splice",
      "sort",
      "reverse",
      "fill",
      "copyWithin",
      "delete",
      "clear",
      "set",
      "add",
    ]);
    if (mutationCheck) {
      return mutationCheck;
    }

    // Block eval, Function constructor, etc. (code generation)
    if (/\beval\s*\(|\bFunction\s*\(/i.test(expression)) {
      return {
        allowed: false,
        reason: "Code Execution: eval/Function not allowed",
        riskLevel: "high",
      };
    }

    // Check function calls against whitelists
    if (/[\w_\]]\s*\(/.test(expression)) {
      const calls = this.extractFunctionCalls(expression);
      return this.checkAgainstWhitelists(
        calls,
        this.jsSafeStaticFunctions,
        this.jsSafeFunctions,
      );
    }

    return null;
  }

  /**
   * Python-specific validation.
   * Allows whitelisted safe functions, blocks mutation methods and code execution.
   */
  private validatePython(expression: string): ValidationResult | null {
    // Block common mutation methods
    const mutationCheck = this.checkMutationMethods(expression, [
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
      const calls = this.extractFunctionCalls(expression);
      return this.checkAgainstWhitelists(
        calls,
        this.pythonSafeStaticFunctions,
        this.pythonSafeFunctions,
      );
    }

    return null;
  }

  /**
   * C# specific validation.
   * Allows whitelisted LINQ, collections, and safe functions, blocks mutation and reflection.
   */
  private validateCSharp(expression: string): ValidationResult | null {
    // Block common mutation methods
    const mutationCheck = this.checkMutationMethods(expression, [
      "Add",
      "Remove",
      "RemoveAt",
      "RemoveAll",
      "Clear",
      "Insert",
      "Sort",
      "Reverse",
      "AddRange",
      "InsertRange",
      "RemoveRange",
      "Push",
      "Pop",
      "Enqueue",
      "Dequeue",
    ]);
    if (mutationCheck) {
      return mutationCheck;
    }

    // Block reflection and dynamic code execution
    if (
      /\b(Activator\.CreateInstance|Assembly\.Load|Invoke|GetType\(\)|typeof\(|nameof\()/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "Code Execution: reflection/dynamic invocation not allowed",
        riskLevel: "high",
      };
    }

    // Check function calls against whitelists
    if (/[\w_\]]\s*\(/.test(expression)) {
      const calls = this.extractFunctionCalls(expression);
      return this.checkAgainstWhitelists(
        calls,
        this.csharpSafeStaticFunctions,
        this.csharpSafeFunctions,
      );
    }

    return null;
  }

  /**
   * Java specific validation.
   * Allows whitelisted Stream API, collections, and safe functions, blocks mutation and reflection.
   */
  private validateJava(expression: string): ValidationResult | null {
    // Block common mutation methods
    const mutationCheck = this.checkMutationMethods(expression, [
      "add",
      "remove",
      "clear",
      "set",
      "addAll",
      "removeAll",
      "retainAll",
      "put",
      "putAll",
      "replaceAll",
      "sort",
      "shuffle",
    ]);
    if (mutationCheck) {
      return mutationCheck;
    }

    // Block reflection and dynamic class loading
    if (
      /\b(Class\.forName|Method\.invoke|Field\.set|Constructor\.newInstance|ClassLoader\.loadClass)/i.test(
        expression,
      )
    ) {
      return {
        allowed: false,
        reason: "Code Execution: reflection/dynamic class loading not allowed",
        riskLevel: "high",
      };
    }

    // Check function calls against whitelists
    if (/[\w_\]]\s*\(/.test(expression)) {
      const calls = this.extractFunctionCalls(expression);
      return this.checkAgainstWhitelists(
        calls,
        this.javaSafeStaticFunctions,
        this.javaSafeFunctions,
      );
    }

    return null;
  }

  /**
   * C/C++ specific validation.
   * Allows whitelisted standard library functions, blocks dangerous operations.
   */
  private validateCpp(expression: string): ValidationResult | null {
    // Check function calls against whitelist (C/C++ doesn't use separate static/method sets)
    if (/[\w_\]]\s*\(/.test(expression)) {
      const calls = this.extractFunctionCalls(expression);
      // Use empty set for static functions since C/C++ functions are in cppSafeFunctions
      return this.checkAgainstWhitelists(
        calls,
        new Set(),
        this.cppSafeFunctions,
      );
    }

    return null;
  }

  /**
   * Go specific validation.
   * Allows whitelisted standard library functions, blocks dangerous operations.
   */
  private validateGo(expression: string): ValidationResult | null {
    // Check function calls against whitelist (Go uses goSafeFunctions for both static and methods)
    if (/[\w_\]]\s*\(/.test(expression)) {
      const calls = this.extractFunctionCalls(expression);
      return this.checkAgainstWhitelists(
        calls,
        this.goSafeFunctions,
        this.goSafeFunctions,
      );
    }

    return null;
  }

  /**
   * Extracts function/method call names from an expression.
   * Returns array of function names (e.g., ['map', 'Object.keys', 'myFunc'])
   */
  private extractFunctionCalls(expression: string): string[] {
    const calls: string[] = [];

    // Match: identifier( or object.method( or module.function(
    // This regex captures the function/method name before the opening parenthesis
    const regex = /([\w.]+)\s*\(/g;
    let match;

    while ((match = regex.exec(expression)) !== null) {
      if (match[1]) {
        calls.push(match[1]);
      }
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
        reason: "State Mutation: assignment modifies variables",
        riskLevel: "high",
      };
    }

    // HIGH RISK: Compound assignment operators
    if (/(\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)/.test(expression)) {
      return {
        allowed: false,
        reason: "State Mutation: compound assignment modifies variables",
        riskLevel: "high",
      };
    }

    // HIGH RISK: Increment/decrement operators
    if (/(\+\+|--)/.test(expression)) {
      return {
        allowed: false,
        reason: "State Mutation: increment/decrement modifies variables",
        riskLevel: "high",
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
        const methodName = call.split(".").pop() || call;
        if (this.jsSafeFunctions.has(methodName)) {
          continue; // This call is safe
        }

        // Also check Python built-ins as they're common debugging functions
        if (
          this.pythonSafeFunctions.has(methodName) ||
          this.pythonSafeStaticFunctions.has(call)
        ) {
          continue; // This call is safe
        }

        // Check if it looks like a getter (LOW risk) vs unknown function (MEDIUM risk)
        if (this.isGetterPattern(methodName)) {
          return {
            allowed: false,
            reason: `Getter Method: ${call}()`,
            riskLevel: "low",
          };
        }

        // Unknown function call - not in any whitelist
        return {
          allowed: false,
          reason: `User-Defined Function: ${call}()`,
          riskLevel: "medium",
        };
      }

      // All function calls are whitelisted (high-risk operators handled above)
      return { allowed: true };
    }

    // MEDIUM RISK: Bitwise operators (unusual in debugging, could be obfuscation)
    if (/[&|^~](?![&|])/.test(expression) || /(<<|>>)/.test(expression)) {
      return {
        allowed: false,
        reason: "Unusual Pattern: bitwise operators (rare in debugging)",
        riskLevel: "medium",
      };
    }

    // MEDIUM RISK: Lambda/arrow functions (could be used for side effects)
    // Match: => or lambda or func
    if (/(=>|->|\blambda\b|\bfunc\b)/.test(expression)) {
      return {
        allowed: false,
        reason: "Anonymous Function: potential side effects",
        riskLevel: "medium",
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
      name.startsWith("get") ||
      name.startsWith("is") ||
      name.startsWith("has") ||
      name.startsWith("should") ||
      name.startsWith("can") ||
      name.startsWith("to")
    ) {
      return true;
    }

    // Common read-only property-like methods
    if (name === "length" || name === "size" || name === "count") {
      return true;
    }

    return false;
  }
}
