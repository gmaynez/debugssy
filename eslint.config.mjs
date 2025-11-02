// ESLint 9+ Flat Config Format
// Migrated from .eslintrc.json to flat config

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import js from "@eslint/js";

export default [
  // Apply to all TypeScript files
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Base ESLint recommended rules
      ...js.configs.recommended.rules,

      // TypeScript ESLint recommended rules
      ...tsPlugin.configs.recommended.rules,

      // Custom rules from original config (adjusted for v8)
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "allow",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        // Allow PascalCase for Zod schema variables (e.g., SetBreakpointArgsSchema)
        {
          selector: "variable",
          filter: {
            regex: ".*Schema$",
            match: true,
          },
          format: ["PascalCase"],
        },
        // Allow PascalCase for Validators object
        {
          selector: "variable",
          filter: {
            regex: "^Validators$",
            match: true,
          },
          format: ["PascalCase"],
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "property",
          modifiers: ["readonly"],
          format: ["camelCase", "UPPER_CASE"],
        },
        // Allow snake_case for MCP tool names in object properties
        {
          selector: "objectLiteralProperty",
          filter: {
            regex:
              "^(set_breakpoint|remove_breakpoint|list_breakpoints|toggle_breakpoint|remove_all_breakpoints|get_variables|get_call_stack|evaluate_expression|get_threads|get_debug_state|get_console_output|clear_console_output|start_debugging|stop_debugging|continue|pause|restart|wait_for_breakpoint|step_over|step_into|step_out)$",
            match: true,
          },
          format: null,
        },
      ],
      // Note: @typescript-eslint/semi was removed in v8 - use a formatter like Prettier for style
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
      semi: "off", // Keep semicolon handling off to avoid conflicts
      "@typescript-eslint/no-explicit-any": "off",
      // Allow unused variables that start with underscore (intentionally unused parameters)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Ignore patterns
  {
    ignores: ["out/**", "dist/**", "**/*.d.ts", "node_modules/**"],
  },
];
