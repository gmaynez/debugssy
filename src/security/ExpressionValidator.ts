// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type ValidationLevel = 'strict' | 'moderate' | 'permissive' | 'disabled';

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
        'filter', 'map', 'reduce', 'reduceRight', 'find', 'findIndex', 'findLast', 'findLastIndex',
        'some', 'every', 'includes', 'indexOf', 'lastIndexOf', 'slice', 'concat', 'join',
        'at', 'entries', 'keys', 'values', 'flat', 'flatMap', 'toSorted', 'toReversed', 'toSpliced',
        // String read-only methods
        'charAt', 'charCodeAt', 'codePointAt', 'indexOf', 'lastIndexOf', 'includes', 'startsWith',
        'endsWith', 'slice', 'substring', 'substr', 'split', 'match', 'matchAll', 'search',
        'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd', 'repeat', 'padStart', 'padEnd',
        'normalize', 'localeCompare', 'toString', 'valueOf',
        // Object utilities (as method calls)
        'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
        'toLocaleString', 'getOwnPropertyDescriptor', 'getOwnPropertyNames', 'getOwnPropertySymbols',
        // Math methods (all are pure)
        'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'ceil',
        'clz32', 'cos', 'cosh', 'exp', 'expm1', 'floor', 'fround', 'hypot', 'imul', 'log',
        'log10', 'log1p', 'log2', 'max', 'min', 'pow', 'random', 'round', 'sign', 'sin',
        'sinh', 'sqrt', 'tan', 'tanh', 'trunc',
        // Number methods
        'toExponential', 'toFixed', 'toPrecision', 'toString', 'valueOf',
        // Date getters (read-only)
        'getDate', 'getDay', 'getFullYear', 'getHours', 'getMilliseconds', 'getMinutes',
        'getMonth', 'getSeconds', 'getTime', 'getTimezoneOffset', 'getUTCDate', 'getUTCDay',
        'getUTCFullYear', 'getUTCHours', 'getUTCMilliseconds', 'getUTCMinutes', 'getUTCMonth',
        'getUTCSeconds', 'toDateString', 'toISOString', 'toJSON', 'toLocaleDateString',
        'toLocaleString', 'toLocaleTimeString', 'toString', 'toTimeString', 'toUTCString', 'valueOf',
        // Common getters pattern
        'get', 'has', 'size', 'length'
    ]);

    // Safe built-in JavaScript/TypeScript static functions
    private readonly jsSafeStaticFunctions = new Set([
        // Object static methods
        'Object.keys', 'Object.values', 'Object.entries', 'Object.fromEntries',
        'Object.getOwnPropertyNames', 'Object.getOwnPropertyDescriptor', 'Object.getOwnPropertyDescriptors',
        'Object.getOwnPropertySymbols', 'Object.getPrototypeOf', 'Object.is', 'Object.hasOwn',
        'Object.isExtensible', 'Object.isFrozen', 'Object.isSealed',
        // Array static methods
        'Array.isArray', 'Array.from', 'Array.of',
        // JSON methods
        'JSON.stringify', 'JSON.parse',
        // Number static methods
        'Number.isFinite', 'Number.isInteger', 'Number.isNaN', 'Number.isSafeInteger',
        'Number.parseFloat', 'Number.parseInt',
        // String static methods
        'String.fromCharCode', 'String.fromCodePoint',
        // Math (entire namespace is safe)
        'Math.abs', 'Math.acos', 'Math.acosh', 'Math.asin', 'Math.asinh', 'Math.atan',
        'Math.atan2', 'Math.atanh', 'Math.cbrt', 'Math.ceil', 'Math.clz32', 'Math.cos',
        'Math.cosh', 'Math.exp', 'Math.expm1', 'Math.floor', 'Math.fround', 'Math.hypot',
        'Math.imul', 'Math.log', 'Math.log10', 'Math.log1p', 'Math.log2', 'Math.max',
        'Math.min', 'Math.pow', 'Math.random', 'Math.round', 'Math.sign', 'Math.sin',
        'Math.sinh', 'Math.sqrt', 'Math.tan', 'Math.tanh', 'Math.trunc',
        // Date constructors (when used for parsing)
        'Date.now', 'Date.parse', 'Date.UTC'
    ]);

    // Safe built-in Python functions and methods
    private readonly pythonSafeFunctions = new Set([
        // List read-only methods
        'count', 'index', 'copy',
        // String read-only methods
        'capitalize', 'casefold', 'center', 'count', 'encode', 'endswith', 'expandtabs',
        'find', 'format', 'format_map', 'index', 'isalnum', 'isalpha', 'isascii', 'isdecimal',
        'isdigit', 'isidentifier', 'islower', 'isnumeric', 'isprintable', 'isspace', 'istitle',
        'isupper', 'join', 'ljust', 'lower', 'lstrip', 'partition', 'replace', 'rfind',
        'rindex', 'rjust', 'rpartition', 'rsplit', 'rstrip', 'split', 'splitlines', 'startswith',
        'strip', 'swapcase', 'title', 'translate', 'upper', 'zfill',
        // Dict read-only methods
        'get', 'items', 'keys', 'values', 'copy',
        // Set read-only methods
        'copy', 'difference', 'intersection', 'isdisjoint', 'issubset', 'issuperset',
        'symmetric_difference', 'union',
        // Common built-in functions
        'len', 'type', 'str', 'repr', 'int', 'float', 'bool', 'list', 'tuple', 'dict', 'set',
        'abs', 'all', 'any', 'bin', 'chr', 'dir', 'divmod', 'enumerate', 'filter', 'format',
        'frozenset', 'hash', 'hex', 'id', 'isinstance', 'issubclass', 'iter', 'map', 'max',
        'min', 'oct', 'ord', 'pow', 'range', 'reversed', 'round', 'slice', 'sorted', 'sum',
        'zip',
        // Common getters pattern
        'get', 'has', 'size'
    ]);

    // Safe built-in Python module functions (module.function)
    private readonly pythonSafeStaticFunctions = new Set([
        // json module
        'json.dumps', 'json.loads',
        // math module (all are pure)
        'math.ceil', 'math.floor', 'math.trunc', 'math.sqrt', 'math.pow', 'math.exp', 'math.log',
        'math.log10', 'math.log2', 'math.sin', 'math.cos', 'math.tan', 'math.asin', 'math.acos',
        'math.atan', 'math.sinh', 'math.cosh', 'math.tanh', 'math.degrees', 'math.radians',
        'math.isnan', 'math.isinf', 'math.isfinite',
        // re module (read-only)
        're.match', 're.search', 're.findall', 're.finditer', 're.split',
        // datetime parsing
        'datetime.datetime.now', 'datetime.datetime.strptime', 'datetime.date.today'
    ]);
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

        // 1. Check CRITICAL first (system-level dangers)
        const criticalCheck = this.detectCriticalOperations(trimmed);
        if (criticalCheck) {
            return criticalCheck;
        }

        // 2. Try language-specific validation (HIGH risk: mutations, eval)
        if (session) {
            const language = this.detectLanguage(session);
            const languageResult = this.validateByLanguage(trimmed, language);
            if (languageResult) {
                return languageResult;
            }
        }

        // 3. Fall back to generic pattern-based validation (MEDIUM/LOW)
        return this.validateGeneric(trimmed);
    }

    /**
     * Detects CRITICAL system-level operations that can affect files, processes, or network.
     * These are the most dangerous operations that should always require explicit approval.
     */
    private detectCriticalOperations(expression: string): ValidationResult | null {
        // File system operations
        if (/\bfs\s*\.\s*(unlink|rmdir|rm|write|mkdir|rename|delete|chmod|chown|truncate|appendFile|writeFile)/i.test(expression)) {
            return {
                allowed: false,
                reason: 'File system operation detected (can modify/delete files)',
                riskLevel: 'critical'
            };
        }
        
        // Process execution
        if (/\b(child_process|exec|execSync|spawn|spawnSync|fork|execFile)\s*[.([]/i.test(expression)) {
            return {
                allowed: false,
                reason: 'Process execution detected (can run system commands)',
                riskLevel: 'critical'
            };
        }
        
        // Process control
        if (/\bprocess\s*\.\s*(exit|kill|abort)\s*\(/i.test(expression)) {
            return {
                allowed: false,
                reason: 'Process control operation (can terminate application)',
                riskLevel: 'critical'
            };
        }
        
        // Network operations (fetch, axios, http)
        if (/\b(fetch|axios|XMLHttpRequest)\s*[.([]/i.test(expression) ||
            /\bhttps?\s*\.\s*(get|post|put|delete|request)/i.test(expression)) {
            return {
                allowed: false,
                reason: 'Network operation detected (can make external requests)',
                riskLevel: 'critical'
            };
        }
        
        // Dynamic module loading
        if (/\brequire\s*\(/i.test(expression) && !/['"]fs['"]|['"]child_process['"]/.test(expression)) {
            // Only flag as critical if requiring potentially dangerous modules
            // Common debugging requires (util, path) are less risky
            if (/require\s*\(\s*['"](?:fs|child_process|net|http|https|crypto|vm)['"]/.test(expression)) {
                return {
                    allowed: false,
                    reason: 'System module loading detected (require with dangerous module)',
                    riskLevel: 'critical'
                };
            }
        }
        
        return null;
    }

    /**
     * Detects the programming language from the debug session type.
     */
    private detectLanguage(session: vscode.DebugSession): string {
        const type = session.type.toLowerCase();
        
        // Common debug adapter types
        // JavaScript/TypeScript family
        if (type === 'node' || type === 'chrome' || type === 'pwa-node' || type === 'pwa-chrome' || 
            type === 'node2' || type === 'extensionhost' || type === 'pwa-extensionhost' ||
            type === 'msedge' || type === 'pwa-msedge' || type === 'webkit') {
            return 'javascript';
        }
        
        // Python family
        if (type === 'python' || type === 'debugpy' || type === 'pythonexperimental') {
            return 'python';
        }
        
        // Go
        if (type === 'go' || type === 'dlv' || type === 'go-debug') {
            return 'go';
        }
        
        // Java family
        if (type === 'java' || type === 'javadebug') {
            return 'java';
        }
        
        // C/C++ family
        if (type === 'cppdbg' || type === 'lldb' || type === 'gdb' || type === 'cppvsdbg') {
            return 'cpp';
        }
        
        // C# family
        if (type === 'coreclr' || type === 'clr' || type === 'dotnet') {
            return 'csharp';
        }
        
        // Ruby
        if (type === 'ruby' || type === 'rdbg') {
            return 'ruby';
        }
        
        // PHP
        if (type === 'php' || type === 'php-debug') {
            return 'php';
        }
        
        // Rust
        if (type === 'rust' || type === 'lldb' || type === 'rust-lldb') {
            return 'rust';
        }
        
        console.log(`Unknown debug session type: ${type}, using generic validation with whitelists`);
        return type;
    }

    /**
     * Apply language-specific validation rules if available.
     * Returns null if no specific rules apply, falling back to generic validation.
     */
    private validateByLanguage(expression: string, language: string): ValidationResult | null {
        switch (language) {
            case 'javascript':
                return this.validateJavaScript(expression);
            case 'python':
                return this.validatePython(expression);
            default:
                // No specific rules for this language
                return null;
        }
    }

    /**
     * JavaScript/TypeScript specific validation.
     * Allows whitelisted safe functions, blocks mutation methods and code generation.
     */
    private validateJavaScript(expression: string): ValidationResult | null {
        // Block common mutation methods explicitly (high priority check)
        const mutationMethods = [
            'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse',
            'fill', 'copyWithin', 'delete', 'clear', 'set', 'add'
        ];
        
        for (const method of mutationMethods) {
            const regex = new RegExp(`\\.${method}\\s*\\(`, 'i');
            if (regex.test(expression)) {
                return {
                    allowed: false,
                    reason: `Side effect: ${method}() modifies state`,
                    riskLevel: 'high'
                };
            }
        }

        // Block eval, Function constructor, etc. (code generation)
        if (/\beval\s*\(|\bFunction\s*\(/i.test(expression)) {
            return {
                allowed: false,
                reason: 'Code generation (eval/Function) not allowed',
                riskLevel: 'high'
            };
        }

        // Check if expression contains function calls
        if (/[\w_\]]\s*\(/.test(expression)) {
            // Extract all function/method calls
            const calls = this.extractFunctionCalls(expression);
            
            for (const call of calls) {
                // Check if it's a whitelisted static function (e.g., Object.keys, JSON.stringify)
                if (this.jsSafeStaticFunctions.has(call)) {
                    continue; // This call is safe
                }
                
                // Check if it's a whitelisted method (e.g., .map, .filter)
                const methodName = call.split('.').pop() || call;
                if (this.jsSafeFunctions.has(methodName)) {
                    continue; // This call is safe
                }
                
                // Check if it looks like a getter (LOW risk) vs unknown function (MEDIUM risk)
                if (this.isGetterPattern(methodName)) {
                    return {
                        allowed: false,
                        reason: `Getter-style method: ${call}()`,
                        riskLevel: 'low'
                    };
                }
                
                // Unknown function call - not whitelisted
                return {
                    allowed: false,
                    reason: `Unknown function: ${call}()`,
                    riskLevel: 'medium'
                };
            }
        }

        // All checks passed
        return null;
    }

    /**
     * Python-specific validation.
     * Allows whitelisted safe functions, blocks mutation methods and code execution.
     */
    private validatePython(expression: string): ValidationResult | null {
        // Block common mutation methods explicitly (high priority check)
        const mutationMethods = [
            'append', 'extend', 'insert', 'remove', 'pop', 'clear',
            'sort', 'reverse', 'update', 'add', 'discard'
        ];
        
        for (const method of mutationMethods) {
            const regex = new RegExp(`\\.${method}\\s*\\(`, 'i');
            if (regex.test(expression)) {
                return {
                    allowed: false,
                    reason: `Side effect: ${method}() modifies state`,
                    riskLevel: 'high'
                };
            }
        }

        // Block eval, exec, compile, __import__ (code execution)
        if (/\b(eval|exec|compile|__import__)\s*\(/i.test(expression)) {
            return {
                allowed: false,
                reason: 'Code execution (eval/exec) not allowed',
                riskLevel: 'high'
            };
        }

        // Check if expression contains function calls
        if (/[\w_\]]\s*\(/.test(expression)) {
            // Extract all function/method calls
            const calls = this.extractFunctionCalls(expression);
            
            for (const call of calls) {
                // Check if it's a whitelisted module function (e.g., json.dumps, math.sqrt)
                if (this.pythonSafeStaticFunctions.has(call)) {
                    continue; // This call is safe
                }
                
                // Check if it's a whitelisted built-in or method (e.g., len, .split)
                const methodName = call.split('.').pop() || call;
                if (this.pythonSafeFunctions.has(methodName)) {
                    continue; // This call is safe
                }
                
                // Check if it looks like a getter (LOW risk) vs unknown function (MEDIUM risk)
                if (this.isGetterPattern(methodName)) {
                    return {
                        allowed: false,
                        reason: `Getter-style method: ${call}()`,
                        riskLevel: 'low'
                    };
                }
                
                // Unknown function call - not whitelisted
                return {
                    allowed: false,
                    reason: `Unknown function: ${call}()`,
                    riskLevel: 'medium'
                };
            }
        }

        // All checks passed
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
        // Check if expression contains function calls
        if (/[\w_\]]\s*\(/.test(expression)) {
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
                        reason: `Getter-style method: ${call}()`,
                        riskLevel: 'low'
                    };
                }
                
                // Unknown function call - not in any whitelist
                return {
                    allowed: false,
                    reason: `Unknown function: ${call}()`,
                    riskLevel: 'medium'
                };
            }
            
            // All function calls are whitelisted
            return { allowed: true };
        }

        // HIGH RISK: Assignment operators
        // Match: = but not ==, !=, <=, >=, ===, !==
        if (/(?<![=!<>])=(?!=)/.test(expression)) {
            return {
                allowed: false,
                reason: 'Assignment operators not allowed',
                riskLevel: 'high'
            };
        }

        // HIGH RISK: Compound assignment operators
        if (/(\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)/.test(expression)) {
            return {
                allowed: false,
                reason: 'Compound assignment operators not allowed',
                riskLevel: 'high'
            };
        }

        // HIGH RISK: Increment/decrement operators
        if (/(\+\+|--)/.test(expression)) {
            return {
                allowed: false,
                reason: 'Increment/decrement operators not allowed',
                riskLevel: 'high'
            };
        }

        // MEDIUM RISK: Bitwise operators (unusual in debugging, could be obfuscation)
        if (/[&|^~](?![&|])/.test(expression) || /(<<|>>)/.test(expression)) {
            return {
                allowed: false,
                reason: 'Bitwise operators discouraged (use with caution)',
                riskLevel: 'medium'
            };
        }

        // LOW RISK: Lambda/arrow functions (could be used for side effects)
        // Match: => or lambda or func
        if (/(=>|->|\blambda\b|\bfunc\b)/.test(expression)) {
            return {
                allowed: false,
                reason: 'Anonymous functions not allowed (potential side effects)',
                riskLevel: 'medium'
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
        if (name.startsWith('get') || name.startsWith('is') || name.startsWith('has') || 
            name.startsWith('should') || name.startsWith('can') || name.startsWith('to')) {
            return true;
        }
        
        // Common read-only property-like methods
        if (name === 'length' || name === 'size' || name === 'count') {
            return true;
        }
        
        return false;
    }

    /**
     * Determines if we should elicit user approval based on risk level and validation level.
     * Uses threshold-based logic like log levels.
     */
    shouldElicit(riskLevel: RiskLevel | undefined, validationLevel: ValidationLevel): boolean {
        if (validationLevel === 'disabled') return false;
        if (!riskLevel) return false;
        
        // Map validation levels to minimum risk thresholds
        const thresholds: Record<ValidationLevel, RiskLevel[]> = {
            'strict': ['critical', 'high', 'medium', 'low'],      // Elicit for all risks
            'moderate': ['critical', 'high', 'medium'],           // Elicit for CRITICAL + HIGH + MEDIUM
            'permissive': ['critical', 'high'],                   // Elicit for CRITICAL + HIGH only
            'disabled': []                                         // Never elicit
        };
        
        return thresholds[validationLevel].includes(riskLevel);
    }

    /**
     * Formats a validation result into a user-friendly message for elicitation.
     * Message severity is proportionate to the actual risk level.
     * @param _expression - The expression being validated (shown by MCP client in parameters, unused here)
     * @param result - The validation result containing risk level and reason
     */
    formatElicitationMessage(_expression: string, result: ValidationResult): string {
        // Expression is shown in the MCP client's parameter display, so we don't repeat it in the message
        const { riskLevel, reason } = result;
        
        switch (riskLevel) {
            case 'critical':
                return `🔴 CRITICAL: ${reason}

This operation can modify files, execute processes, or make network requests.

Only proceed if you fully understand the consequences.`;

            case 'high':
                return `⚠️ ${reason}

This will modify your application's state during debugging. Changes may cause unexpected behavior or mask bugs.`;

            case 'medium':
                return `⚠️ ${reason}

This function could modify state, trigger side effects, or perform unexpected operations. Safe built-in functions (Array.map, Object.keys, JSON.stringify) are allowed automatically.`;

            case 'low':
            default:
                return `ℹ️ ${reason}

Getter methods are typically safe, but custom getters may include logging or state changes. Quick confirmation recommended.`;
        }
    }
}

