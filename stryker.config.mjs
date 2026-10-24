// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  concurrency: 4,
  mutate: [
    'src/MCPServer.ts',
    'src/extension.ts',
    'src/routing/ToolRouter.ts',
    'src/routing/CompletionProvider.ts',
    'src/routing/ResourceProvider.ts',
    'src/routing/PromptHandler.ts',
    'src/routing/promptTemplates.ts',
    'src/tools/Breakpoints.ts',
    'src/tools/DebugControl.ts',
    'src/tools/Inspection.ts',
    'src/dap/Client.ts',
    'src/security/ExpressionValidator.ts',
    'src/security/McpRequestValidator.ts',
    'src/security/expression/validators/*.ts',
    'src/utils/sortByRelevance.ts',
    'src/Config.ts',
  ],
  thresholds: {
    break: 70,
  },
  vitest: {
    configFile: 'vitest.config.mts',
  },
};

export default config;
