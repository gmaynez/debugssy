// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import { z } from 'zod';
import {
  DEFAULT_BREAKPOINT_TIMEOUT_MS,
  MIN_PORT,
  MAX_PORT,
  MIN_BREAKPOINT_TIMEOUT_MS,
  MAX_BREAKPOINT_TIMEOUT_MS,
  MIN_EXPRESSION_LENGTH,
  MAX_EXPRESSION_LENGTH,
  DEFAULT_MAX_EXPRESSION_LENGTH,
  DEFAULT_MINIFY_MCP_RESPONSES,
} from './constants';
import { Logger } from './utils/Logger';

/**
 * Zod schema for runtime validation of configuration values.
 * Ensures configuration meets requirements even if user provides invalid values.
 */
export const DebugConfigurationSchema = z.object({
  enabled: z.boolean(),
  port: z
    .number()
    .int()
    .min(MIN_PORT, { message: `Port must be >= ${MIN_PORT}` })
    .max(MAX_PORT, { message: `Port must be <= ${MAX_PORT}` }),
  automationLevel: z.enum(['assisted', 'full']),
  waitForBreakpointTimeout: z
    .number()
    .int()
    .min(MIN_BREAKPOINT_TIMEOUT_MS, {
      message: `Timeout must be >= ${MIN_BREAKPOINT_TIMEOUT_MS}ms`,
    })
    .max(MAX_BREAKPOINT_TIMEOUT_MS, {
      message: `Timeout must be <= ${MAX_BREAKPOINT_TIMEOUT_MS}ms`,
    }),
  allowStepOperations: z.boolean(),
  minifyResponses: z.boolean(),
  maxExpressionLength: z
    .number()
    .int()
    .min(MIN_EXPRESSION_LENGTH, {
      message: `Max expression length must be >= ${MIN_EXPRESSION_LENGTH}`,
    })
    .max(MAX_EXPRESSION_LENGTH, {
      message: `Max expression length must be <= ${MAX_EXPRESSION_LENGTH}`,
    }),
  expressionValidationLevel: z.enum(['strict', 'moderate', 'permissive', 'disabled']),
});

export type DebugConfiguration = z.infer<typeof DebugConfigurationSchema>;

export class ConfigManager {
  private static readonly CONFIG_SECTION = 'debugssy';
  private configChangeEmitter = new vscode.EventEmitter<DebugConfiguration>();
  public readonly onConfigChange = this.configChangeEmitter.event;
  private configChangeSubscription: vscode.Disposable;

  constructor() {
    this.configChangeSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
        this.configChangeEmitter.fire(this.getConfig());
      }
    });
  }

  getConfig(): DebugConfiguration {
    const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
    const rawConfig = {
      enabled: config.get<boolean>('mcp.enabled', true),
      port: config.get<number>('mcp.port', 3000),
      automationLevel: config.get<'assisted' | 'full'>('automationLevel', 'assisted'),
      waitForBreakpointTimeout: config.get<number>(
        'waitForBreakpointTimeout',
        DEFAULT_BREAKPOINT_TIMEOUT_MS
      ),
      allowStepOperations: config.get<boolean>('allowStepOperations', false),
      minifyResponses: config.get<boolean>('mcp.minifyResponses', DEFAULT_MINIFY_MCP_RESPONSES),
      maxExpressionLength: config.get<number>('maxExpressionLength', DEFAULT_MAX_EXPRESSION_LENGTH),
      expressionValidationLevel: config.get<'strict' | 'moderate' | 'permissive' | 'disabled'>(
        'expressionValidationLevel',
        'moderate'
      ),
    };

    const defaults: DebugConfiguration = {
      enabled: true,
      port: 3000,
      automationLevel: 'assisted',
      waitForBreakpointTimeout: DEFAULT_BREAKPOINT_TIMEOUT_MS,
      allowStepOperations: false,
      minifyResponses: DEFAULT_MINIFY_MCP_RESPONSES,
      maxExpressionLength: DEFAULT_MAX_EXPRESSION_LENGTH,
      expressionValidationLevel: 'moderate',
    };
    const validatedConfig: Record<keyof DebugConfiguration, unknown> = { ...defaults };
    const validationIssues: z.ZodIssue[] = [];

    // Validate fields independently so one invalid setting does not discard valid explicit values.
    for (const key of Object.keys(defaults) as Array<keyof DebugConfiguration>) {
      const result = DebugConfigurationSchema.shape[key].safeParse(rawConfig[key]);
      if (result.success) {
        validatedConfig[key] = result.data;
      } else {
        validationIssues.push(
          ...result.error.issues.map((issue) => ({ ...issue, path: [key, ...issue.path] }))
        );
      }
    }

    if (validationIssues.length > 0) {
      const logger = Logger.getInstance();
      logger.error('Invalid configuration detected:', validationIssues);
      const issues = validationIssues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');
      vscode.window.showWarningMessage(
        `Debugssy: Invalid configuration (${issues}). Using defaults for invalid fields.`
      );
    }

    return DebugConfigurationSchema.parse(validatedConfig);
  }

  dispose(): void {
    this.configChangeSubscription.dispose();
    this.configChangeEmitter.dispose();
  }
}
