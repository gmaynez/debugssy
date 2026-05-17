// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/routing/ToolRouter.ts',
    'src/tools/Breakpoints.ts',
    'src/tools/DebugControl.ts',
    'src/tools/Inspection.ts',
    'src/security/ExpressionValidator.ts',
  ],
  vitest: {
    configFile: 'vitest.config.mts',
  },
};

export default config;
