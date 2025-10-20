// ESLint 9+ Flat Config Format
// Migrated from .eslintrc.json to flat config

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import js from '@eslint/js';

export default [
  // Apply to all TypeScript files
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Base ESLint recommended rules
      ...js.configs.recommended.rules,
      
      // TypeScript ESLint recommended rules
      ...tsPlugin.configs.recommended.rules,
      
      // Custom rules from original config (adjusted for v8)
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'property',
          modifiers: ['readonly'],
          format: ['camelCase', 'UPPER_CASE'],
        },
      ],
      // Note: @typescript-eslint/semi was removed in v8 - use a formatter like Prettier for style
      'curly': 'warn',
      'eqeqeq': 'warn',
      'no-throw-literal': 'warn',
      'semi': 'off', // Keep semicolon handling off to avoid conflicts
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow unused variables that start with underscore (intentionally unused parameters)
      '@typescript-eslint/no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'caughtErrorsIgnorePattern': '^_'
      }],
    },
  },
  // Ignore patterns
  {
    ignores: ['out/**', 'dist/**', '**/*.d.ts', 'node_modules/**'],
  },
];

