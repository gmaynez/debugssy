// SPDX-License-Identifier: Apache-2.0

import * as vscode from "vscode";
import { z } from "zod";
import {
  DEFAULT_BREAKPOINT_TIMEOUT_MS,
  MIN_PORT,
  MAX_PORT,
  MIN_BREAKPOINT_TIMEOUT_MS,
  MAX_BREAKPOINT_TIMEOUT_MS,
  MIN_EXPRESSION_LENGTH,
  MAX_EXPRESSION_LENGTH,
  DEFAULT_MAX_EXPRESSION_LENGTH,
} from "./constants";
import { Logger } from "./utils/Logger";

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
  automationLevel: z.enum(["assisted", "full"]),
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
  maxExpressionLength: z
    .number()
    .int()
    .min(MIN_EXPRESSION_LENGTH, {
      message: `Max expression length must be >= ${MIN_EXPRESSION_LENGTH}`,
    })
    .max(MAX_EXPRESSION_LENGTH, {
      message: `Max expression length must be <= ${MAX_EXPRESSION_LENGTH}`,
    }),
  expressionValidationLevel: z.enum([
    "strict",
    "moderate",
    "permissive",
    "disabled",
  ]),
});

export type DebugConfiguration = z.infer<typeof DebugConfigurationSchema>;

export class ConfigManager {
  private static readonly CONFIG_SECTION = "debugssy";
  private configChangeEmitter = new vscode.EventEmitter<DebugConfiguration>();
  public readonly onConfigChange = this.configChangeEmitter.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
        this.configChangeEmitter.fire(this.getConfig());
      }
    });
  }

  getConfig(): DebugConfiguration {
    const config = vscode.workspace.getConfiguration(
      ConfigManager.CONFIG_SECTION,
    );
    const rawConfig = {
      enabled: config.get<boolean>("mcp.enabled", true),
      port: config.get<number>("mcp.port", 3000),
      automationLevel: config.get<"assisted" | "full">(
        "automationLevel",
        "assisted",
      ),
      waitForBreakpointTimeout: config.get<number>(
        "waitForBreakpointTimeout",
        DEFAULT_BREAKPOINT_TIMEOUT_MS,
      ),
      allowStepOperations: config.get<boolean>("allowStepOperations", false),
      maxExpressionLength: config.get<number>(
        "maxExpressionLength",
        DEFAULT_MAX_EXPRESSION_LENGTH,
      ),
      expressionValidationLevel: config.get<
        "strict" | "moderate" | "permissive" | "disabled"
      >("expressionValidationLevel", "moderate"),
    };

    // Validate configuration using Zod schema
    const result = DebugConfigurationSchema.safeParse(rawConfig);

    if (!result.success) {
      // Log validation errors but return defaults to prevent extension failure
      const logger = Logger.getInstance();
      logger.error("Invalid configuration detected:", result.error.issues);
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join(", ");
      vscode.window.showWarningMessage(
        `Debugssy: Invalid configuration (${issues}). Using defaults.`,
      );

      // Return validated defaults
      return DebugConfigurationSchema.parse({
        enabled: true,
        port: 3000,
        automationLevel: "assisted",
        waitForBreakpointTimeout: DEFAULT_BREAKPOINT_TIMEOUT_MS,
        allowStepOperations: false,
        maxExpressionLength: DEFAULT_MAX_EXPRESSION_LENGTH,
        expressionValidationLevel: "moderate",
      });
    }

    return result.data;
  }

  dispose(): void {
    this.configChangeEmitter.dispose();
  }
}
