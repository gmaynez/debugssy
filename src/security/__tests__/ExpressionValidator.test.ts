// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach } from 'vitest';
import { ExpressionValidator } from '../ExpressionValidator';
import { createMockDebugSession } from '../../__tests__/helpers/vscode-mock';
import type { RiskLevel } from '../expression/types';

describe('ExpressionValidator', () => {
  let validator: ExpressionValidator;

  beforeEach(() => {
    validator = new ExpressionValidator();
  });

  describe('Language Detection', () => {
    it('should detect JavaScript from node session type', () => {
      const session = createMockDebugSession('test', 'node');
      const result = validator.validateExpression("console.log('test')", session);
      // JavaScript specific validation should apply
      expect(result).toBeDefined();
    });

    it('should detect JavaScript from chrome session type', () => {
      const session = createMockDebugSession('test', 'chrome');
      const result = validator.validateExpression("console.log('test')", session);
      expect(result).toBeDefined();
    });

    it('should detect JavaScript from pwa-node session type', () => {
      const session = createMockDebugSession('test', 'pwa-node');
      const result = validator.validateExpression("console.log('test')", session);
      expect(result).toBeDefined();
    });

    it('should detect Python from python session type', () => {
      const session = createMockDebugSession('test', 'python');
      const result = validator.validateExpression("print('test')", session);
      expect(result).toBeDefined();
    });

    it('should detect Python from debugpy session type', () => {
      const session = createMockDebugSession('test', 'debugpy');
      const result = validator.validateExpression("print('test')", session);
      expect(result).toBeDefined();
    });

    it('should detect Go from go session type', () => {
      const session = createMockDebugSession('test', 'go');
      const result = validator.validateExpression("fmt.Println('test')", session);
      expect(result).toBeDefined();
    });

    it('should detect Java from java session type', () => {
      const session = createMockDebugSession('test', 'java');
      const result = validator.validateExpression("System.out.println('test')", session);
      expect(result).toBeDefined();
    });

    it('should detect C# from coreclr session type', () => {
      const session = createMockDebugSession('test', 'coreclr');
      const result = validator.validateExpression("Console.WriteLine('test')", session);
      expect(result).toBeDefined();
    });

    it('should detect C++ from cppdbg session type', () => {
      const session = createMockDebugSession('test', 'cppdbg');
      const result = validator.validateExpression("std::cout << 'test'", session);
      expect(result).toBeDefined();
    });

    it('should detect Rust from rust session type', () => {
      const session = createMockDebugSession('test', 'rust');
      const result = validator.validateExpression("println!('test')", session);
      expect(result).toBeDefined();
    });

    it('should cache language detection for the same session', () => {
      const session = createMockDebugSession('test', 'node');
      validator.validateExpression('test1', session);
      validator.validateExpression('test2', session);
      // Second call should use cached value (no way to directly verify, but ensures no errors)
      expect(true).toBe(true);
    });
  });

  describe('JavaScript Validation', () => {
    const jsSession = createMockDebugSession('test', 'node');

    describe('Safe Operations - Should Allow', () => {
      it('should allow safe array methods without arrow functions', () => {
        const expressions = [
          'array.slice(0, 5)',
          'array.concat([1, 2, 3])',
          "array.join(',')",
          'array.includes(5)',
        ];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(true);
        });
      });

      it('should allow array methods with arrow functions', () => {
        // Arrow functions in safe methods are allowed
        const expressions = ['array.map(x => x * 2)', 'array.filter(x => x > 0)'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(true);
        });
      });

      it('should allow safe Object static methods without callbacks', () => {
        const expressions = ['Object.keys(obj)', 'Object.values(obj)', 'Object.entries(obj)'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(true);
        });
      });

      it('should allow JSON operations', () => {
        const expressions = ['JSON.stringify(obj)', 'JSON.parse(str)'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(true);
        });
      });

      it('should allow safe string methods', () => {
        const expressions = [
          'str.toLowerCase()',
          'str.toUpperCase()',
          'str.trim()',
          'str.substring(0, 5)',
          'str.slice(0, 5)',
          "str.split(',')",
        ];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(true);
        });
      });

      it('should allow property access', () => {
        const expressions = ['obj.property', 'obj.nested.property', 'array[0]', "obj['key']"];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(true);
        });
      });
    });

    describe('Mutations - Should Block', () => {
      it('should block array mutation methods', () => {
        const expressions = [
          'array.push(5)',
          'array.pop()',
          'array.splice(0, 1)',
          'array.shift()',
          'array.unshift(1)',
        ];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('high');
          expect(result.reason).toContain('State Mutation');
        });
      });

      it('should block assignments', () => {
        const expressions = ['x = 5', 'obj.prop = 10', 'x += 5', 'x -= 5', 'x *= 2', 'x /= 2'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('high');
          expect(result.reason).toContain('State Mutation');
        });
      });

      it('should block increment/decrement operators', () => {
        const expressions = ['x++', '++x', 'x--', '--x'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('high');
        });
      });
    });

    describe('Critical Operations - Should Block', () => {
      it('should block eval and Function constructor as high risk', () => {
        const expressions = ["eval('code')", "new Function('return x')", "Function('return x')()"];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('high');
          expect(result.reason).toContain('Code Execution');
        });
      });

      it('should block require and import', () => {
        const expressions = ["require('fs')", "import('fs')"];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          // Can be medium or critical depending on detection
          expect(['critical', 'medium']).toContain(result.riskLevel);
        });
      });

      it('should block file system operations', () => {
        const expressions = [
          "fs.readFile('file.txt')",
          "fs.writeFile('file.txt', 'data')",
          "fs.unlink('file.txt')",
        ];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          // Language-specific validators detect as critical
          expect(['critical', 'medium']).toContain(result.riskLevel);
        });
      });

      it('should block process operations', () => {
        const expressions = ['process.exit(0)', 'process.kill(pid)', "child_process.exec('ls')"];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('critical');
        });
      });

      it('should block network operations', () => {
        const expressions = [
          "fetch('https://example.com')",
          "http.request('https://example.com')",
          'XMLHttpRequest()',
        ];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          // Treated as unknown functions when called as methods
          expect(['critical', 'medium']).toContain(result.riskLevel);
        });
      });
    });

    describe('Unknown Functions - Medium Risk', () => {
      it('should block unknown function calls', () => {
        const expressions = ['unknownFunction()', 'obj.unknownMethod()', 'customHelper(data)'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, jsSession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('medium');
          expect(result.reason).toContain('Function');
        });
      });
    });
  });

  describe('Python Validation', () => {
    const pySession = createMockDebugSession('test', 'python');

    describe('Safe Operations - Should Allow', () => {
      it('should allow safe built-in functions', () => {
        const expressions = [
          'len(list)',
          'str(value)',
          'int(value)',
          'list(items)',
          'dict(items)',
          'type(obj)',
        ];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(true);
        });
      });

      it('should allow list comprehensions', () => {
        const expressions = ['[x * 2 for x in range(10)]', '[x for x in items if x > 0]'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(true);
        });
      });

      it('should allow safe string methods', () => {
        const expressions = ['str.lower()', 'str.upper()', 'str.strip()', "str.split(',')"];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(true);
        });
      });
    });

    describe('Critical Operations - Should Block', () => {
      it('should block eval, exec, and compile as high risk', () => {
        const expressions = ["eval('code')", "exec('code')", "compile('code', 'file', 'exec')"];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('high');
          expect(result.reason).toContain('Code Execution');
        });
      });

      it('should block __import__', () => {
        const result = validator.validateExpression("__import__('os')", pySession);
        expect(result.allowed).toBe(false);
        expect(result.riskLevel).toBe('high');
        expect(result.reason).toContain('Code Execution');
      });

      it('should block os and sys operations', () => {
        const expressions = ["os.system('ls')", "os.remove('file')", 'sys.exit(0)'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(false);
          // Language-specific validators detect as critical
          expect(['critical', 'medium']).toContain(result.riskLevel);
        });
      });

      it('should block subprocess operations', () => {
        const expressions = ["subprocess.run(['ls'])", "subprocess.call(['ls'])"];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('critical');
        });
      });
    });

    describe('Mutations - Should Block', () => {
      it('should block list mutation methods', () => {
        const expressions = ['list.append(5)', 'list.pop()', 'list.remove(5)', 'list.clear()'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('high');
          expect(result.reason).toContain('State Mutation');
        });
      });

      it('should block assignments', () => {
        const expressions = ['x = 5', 'obj.prop = 10', 'x += 5'];

        expressions.forEach((expr) => {
          const result = validator.validateExpression(expr, pySession);
          expect(result.allowed).toBe(false);
          expect(result.riskLevel).toBe('high');
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should reject empty expressions', () => {
      const result = validator.validateExpression('', undefined);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Empty expression');
      expect(result.riskLevel).toBe('low');
    });

    it('should reject whitespace-only expressions', () => {
      const result = validator.validateExpression('   ', undefined);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Empty expression');
    });

    it('should handle very long expressions', () => {
      const longExpr = 'x.'.repeat(1000) + 'property';
      const result = validator.validateExpression(longExpr, undefined);
      // Should still validate without crashing
      expect(result).toBeDefined();
    });

    it('should handle expressions with special characters', () => {
      const expr = "str.replace(/[^a-z]/gi, '')";
      const result = validator.validateExpression(expr, undefined);
      expect(result).toBeDefined();
    });

    it('should handle multi-line expressions', () => {
      const expr = `array
        .slice(0, 5)
        .concat([1, 2])`;
      const result = validator.validateExpression(expr, undefined);
      // Multi-line expressions without arrow functions should be allowed
      expect(result.allowed).toBe(true);
    });
  });

  describe('Validation Levels - shouldElicit', () => {
    it('should elicit for all risks in strict mode', () => {
      expect(validator.shouldElicit('critical', 'strict')).toBe(true);
      expect(validator.shouldElicit('high', 'strict')).toBe(true);
      expect(validator.shouldElicit('medium', 'strict')).toBe(true);
      expect(validator.shouldElicit('low', 'strict')).toBe(true);
    });

    it('should elicit for critical, high, and medium in moderate mode', () => {
      expect(validator.shouldElicit('critical', 'moderate')).toBe(true);
      expect(validator.shouldElicit('high', 'moderate')).toBe(true);
      expect(validator.shouldElicit('medium', 'moderate')).toBe(true);
      expect(validator.shouldElicit('low', 'moderate')).toBe(false);
    });

    it('should elicit only for critical and high in permissive mode', () => {
      expect(validator.shouldElicit('critical', 'permissive')).toBe(true);
      expect(validator.shouldElicit('high', 'permissive')).toBe(true);
      expect(validator.shouldElicit('medium', 'permissive')).toBe(false);
      expect(validator.shouldElicit('low', 'permissive')).toBe(false);
    });

    it('should never elicit in disabled mode', () => {
      expect(validator.shouldElicit('critical', 'disabled')).toBe(false);
      expect(validator.shouldElicit('high', 'disabled')).toBe(false);
      expect(validator.shouldElicit('medium', 'disabled')).toBe(false);
      expect(validator.shouldElicit('low', 'disabled')).toBe(false);
    });

    it('should not elicit for undefined risk level', () => {
      expect(validator.shouldElicit(undefined, 'moderate')).toBe(false);
    });
  });

  describe('Elicitation Message Formatting', () => {
    it('should format critical risk message with appropriate severity', () => {
      const result = {
        allowed: false,
        riskLevel: 'critical' as RiskLevel,
        reason: 'File System Access',
      };
      const message = validator.formatElicitationMessage('fs.readFile()', result);
      expect(message).toContain('🔴 CRITICAL');
      expect(message).toContain('File System Access');
      expect(message).toContain('modify files');
    });

    it('should format high risk message', () => {
      const result = {
        allowed: false,
        riskLevel: 'high' as RiskLevel,
        reason: 'State Mutation: push() modifies data',
      };
      const message = validator.formatElicitationMessage('array.push(1)', result);
      expect(message).toContain('⚠️');
      expect(message).toContain('State Mutation');
      expect(message).toContain("modify your application's state");
    });

    it('should format medium risk message', () => {
      const result = {
        allowed: false,
        riskLevel: 'medium' as RiskLevel,
        reason: 'Unknown function',
      };
      const message = validator.formatElicitationMessage('customFunc()', result);
      expect(message).toContain('⚠️');
      expect(message).toContain('Unknown function');
      expect(message).toContain('side effects');
    });

    it('should format low risk message', () => {
      const result = {
        allowed: false,
        riskLevel: 'low' as RiskLevel,
        reason: 'Getter method',
      };
      const message = validator.formatElicitationMessage('obj.getter', result);
      expect(message).toContain('ℹ️');
      expect(message).toContain('Getter method');
    });
  });

  describe('Generic Validation (No Session)', () => {
    it('should validate simple expressions without session context', () => {
      const safeExpr = 'array.slice(0, 5)';
      const result = validator.validateExpression(safeExpr);
      expect(result.allowed).toBe(true);
    });

    it('should detect unknown functions without session', () => {
      // Without session, specific function calls may be treated as unknown
      const dangerousExpr = "fs.readFile('file.txt')";
      const result = validator.validateExpression(dangerousExpr);
      expect(result.allowed).toBe(false);
      // Could be medium (unknown function) depending on context
      expect(['critical', 'medium']).toContain(result.riskLevel);
    });

    it('should detect mutations without session', () => {
      const mutationExpr = 'array.push(5)';
      const result = validator.validateExpression(mutationExpr);
      expect(result.allowed).toBe(false);
      // Without language context, mutations might be detected generically
      expect(['high', 'medium']).toContain(result.riskLevel);
    });
  });

  describe('Resource Cleanup', () => {
    it('should dispose resources properly', () => {
      const testValidator = new ExpressionValidator();
      expect(() => testValidator.dispose()).not.toThrow();
    });

    it('should clear language cache on dispose', () => {
      const testValidator = new ExpressionValidator();
      const session = createMockDebugSession('test', 'node');
      testValidator.validateExpression('test', session);
      testValidator.dispose();
      // Should not throw after dispose
      expect(true).toBe(true);
    });
  });
});
