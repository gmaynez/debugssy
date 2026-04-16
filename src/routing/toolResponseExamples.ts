// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import type {
  EvaluateExpressionResult,
  GetCallStackResult,
  GetConsoleOutputResult,
  GetDebugStateResult,
  GetVariablesResult,
} from './types/toolResults';

export const TOOL_RESPONSE_EXAMPLES: {
  getDebugStatePaused: GetDebugStateResult;
  getVariablesLocalScope: GetVariablesResult;
  getCallStack: GetCallStackResult;
  evaluateExpression: EvaluateExpressionResult;
  getConsoleOutput: GetConsoleOutputResult;
} = {
  getDebugStatePaused: {
    success: true,
    data: {
      hasActiveSession: true,
      sessionName: 'Launch Program',
      sessionType: 'node',
      executionState: 'paused',
      stoppedInfo: {
        reason: 'breakpoint',
        threadId: 1,
        allThreadsStopped: true,
      },
      currentLocation: {
        file: '/workspace/src/app.ts',
        line: 45,
        column: 1,
        functionName: 'processUser',
      },
    },
  },
  getVariablesLocalScope: {
    success: true,
    data: {
      frameId: 42,
      scopes: [
        {
          name: 'Local: processUser',
          variables: [
            { name: 'user', value: '{ id: 1, active: true }', type: 'User' },
            { name: 'retryCount', value: '0', type: 'number' },
          ],
        },
      ],
    },
  },
  getCallStack: {
    success: true,
    data: {
      frames: [
        {
          id: 42,
          name: 'processUser',
          source: '/workspace/src/app.ts',
          line: 45,
          column: 1,
        },
        {
          id: 41,
          name: 'handleRequest',
          source: '/workspace/src/server.ts',
          line: 18,
          column: 1,
        },
      ],
      totalFrames: 2,
      truncated: false,
    },
  },
  evaluateExpression: {
    success: true,
    data: {
      expression: 'user.id',
      result: '1',
      type: 'number',
    },
  },
  getConsoleOutput: {
    success: true,
    data: {
      entries: [
        {
          category: 'console',
          output: 'Loaded user profile',
          timestamp: 1713276000000,
          source: '/workspace/src/app.ts',
          line: 44,
        },
      ],
      count: 1,
      truncated: false,
    },
  },
};

export const RESOURCE_RESPONSE_EXAMPLES = {
  listResources: {
    resources: [
      {
        uri: 'debugssy:///myproject/launch.json',
        name: 'myproject Debug Configurations',
        description:
          'Debug configurations from myproject/.vscode/launch.json. Use the "name" field from configurations when calling start_debugging.',
        mimeType: 'application/json',
      },
    ],
  },
  readLaunchJson: {
    contents: [
      {
        uri: 'debugssy:///myproject/launch.json',
        mimeType: 'application/json',
        text: '{\n  "configurations": [\n    { "name": "Launch Program" }\n  ]\n}',
      },
    ],
  },
};

export function formatJsonExample(example: unknown): string {
  return JSON.stringify(example);
}
