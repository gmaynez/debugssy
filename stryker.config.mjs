// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/routing/ToolRouter.ts',
    'src/routing/PromptHandler.ts',
    'src/routing/promptTemplates.ts',
    'src/tools/Breakpoints.ts',
    'src/tools/DebugControl.ts',
    'src/tools/Inspection.ts',
    'src/dap/Client.ts',
    'src/security/ExpressionValidator.ts',
    'src/security/McpRequestValidator.ts',
    'src/Config.ts',
  ],
  vitest: {
    configFile: 'vitest.config.mts',
  },
};

export default config;
