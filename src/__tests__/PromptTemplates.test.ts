// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, expect, it } from 'vitest';
import {
  BEST_PRACTICES_PREFIX,
  RESOURCE_READING_GUIDANCE_FULL,
  generateAutoDebugSessionPrompt,
  generateDebugCrashPrompt,
  generateDebugLoopPrompt,
  generateInspectFunctionPrompt,
  generateTraceVariablePrompt,
} from '../routing/promptTemplates';

describe('prompt template contracts', () => {
  it('keeps shared guidance stable', () => {
    expect(BEST_PRACTICES_PREFIX).toMatchSnapshot();
    expect(RESOURCE_READING_GUIDANCE_FULL).toMatchSnapshot();
  });

  it('keeps crash prompts stable across modes and optional paths', () => {
    expect(generateDebugCrashPrompt({ errorMessage: 'boom' }, 'assisted')).toMatchSnapshot();
    expect(
      generateDebugCrashPrompt({ errorMessage: 'boom', filePath: '/src/app.ts' }, 'full')
    ).toMatchSnapshot();
  });

  it('keeps variable tracing prompts stable across modes', () => {
    expect(generateTraceVariablePrompt({ variableName: 'counter' }, 'assisted')).toMatchSnapshot();
    expect(
      generateTraceVariablePrompt(
        { variableName: 'counter', expectedValue: '2', actualValue: '3' },
        'full'
      )
    ).toMatchSnapshot();
  });

  it('keeps function inspection prompts stable across modes and optional issues', () => {
    expect(
      generateInspectFunctionPrompt(
        { functionName: 'parse', filePath: '/src/parser.ts', issue: 'Returns null' },
        'assisted'
      )
    ).toMatchSnapshot();
    expect(
      generateInspectFunctionPrompt({ functionName: 'parse', filePath: '/src/parser.ts' }, 'full')
    ).toMatchSnapshot();
  });

  it('keeps loop prompts stable across modes and optional iteration counts', () => {
    expect(
      generateDebugLoopPrompt({ loopLocation: '/src/loop.ts', expectedIterations: 4 }, 'assisted')
    ).toMatchSnapshot();
    expect(generateDebugLoopPrompt({ loopLocation: '/src/loop.ts' }, 'full')).toMatchSnapshot();
  });

  it('keeps autonomous session prompts stable with and without an entry point', () => {
    expect(generateAutoDebugSessionPrompt({ issue: 'Crashes at startup' })).toMatchSnapshot();
    expect(
      generateAutoDebugSessionPrompt({ issue: 'Crashes at startup', entryPoint: '/src/index.ts' })
    ).toMatchSnapshot();
  });
});
