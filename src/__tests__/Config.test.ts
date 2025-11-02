// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConfigManager, DebugConfigurationSchema } from "../Config";
import { vscode } from "./setup";

describe("ConfigManager", () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    // Reset the workspace configuration mock
    vi.clearAllMocks();
    configManager = new ConfigManager();
  });

  describe("Configuration Loading", () => {
    it("should load default configuration values", () => {
      // Mock VS Code configuration to return defaults
      vscode.workspace.getConfiguration = vi.fn(
        () =>
          ({
            get: vi.fn((_key: string, defaultValue: any) => defaultValue),
          }) as any,
      );

      const config = configManager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.port).toBe(3000);
      expect(config.automationLevel).toBe("assisted");
      expect(config.allowStepOperations).toBe(false);
      expect(config.maxExpressionLength).toBe(100);
      expect(config.expressionValidationLevel).toBe("moderate");
    });

    it("should load custom configuration values", () => {
      vscode.workspace.getConfiguration = vi.fn(
        () =>
          ({
            get: vi.fn((key: string, defaultValue: any) => {
              const config: Record<string, any> = {
                "mcp.enabled": false,
                "mcp.port": 8080,
                automationLevel: "full",
                waitForBreakpointTimeout: 10000,
                allowStepOperations: true,
                maxExpressionLength: 200,
                expressionValidationLevel: "strict",
              };
              return config[key] ?? defaultValue;
            }),
          }) as any,
      );

      const config = configManager.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.port).toBe(8080);
      expect(config.automationLevel).toBe("full");
      expect(config.waitForBreakpointTimeout).toBe(10000);
      expect(config.allowStepOperations).toBe(true);
      expect(config.maxExpressionLength).toBe(200);
      expect(config.expressionValidationLevel).toBe("strict");
    });
  });

  describe("Configuration Validation", () => {
    it("should validate port number range", () => {
      const validPort = {
        enabled: true,
        port: 3000,
        automationLevel: "assisted" as const,
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: "moderate" as const,
      };

      const result = DebugConfigurationSchema.safeParse(validPort);
      expect(result.success).toBe(true);
    });

    it("should reject port number below minimum", () => {
      const invalidPort = {
        enabled: true,
        port: 500, // Below 1024
        automationLevel: "assisted" as const,
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: "moderate" as const,
      };

      const result = DebugConfigurationSchema.safeParse(invalidPort);
      expect(result.success).toBe(false);
    });

    it("should reject port number above maximum", () => {
      const invalidPort = {
        enabled: true,
        port: 70000, // Above 65535
        automationLevel: "assisted" as const,
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: "moderate" as const,
      };

      const result = DebugConfigurationSchema.safeParse(invalidPort);
      expect(result.success).toBe(false);
    });

    it("should validate automation level enum values", () => {
      const validAssistedConfig = {
        enabled: true,
        port: 3000,
        automationLevel: "assisted" as const,
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: "moderate" as const,
      };

      const validFullConfig = {
        ...validAssistedConfig,
        automationLevel: "full" as const,
      };

      expect(
        DebugConfigurationSchema.safeParse(validAssistedConfig).success,
      ).toBe(true);
      expect(DebugConfigurationSchema.safeParse(validFullConfig).success).toBe(
        true,
      );
    });

    it("should validate expression validation level enum values", () => {
      const validLevels = [
        "strict",
        "moderate",
        "permissive",
        "disabled",
      ] as const;

      validLevels.forEach((level) => {
        const config = {
          enabled: true,
          port: 3000,
          automationLevel: "assisted" as const,
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: level,
        };

        const result = DebugConfigurationSchema.safeParse(config);
        expect(result.success).toBe(true);
      });
    });

    it("should validate wait for breakpoint timeout range", () => {
      const validTimeout = {
        enabled: true,
        port: 3000,
        automationLevel: "assisted" as const,
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: "moderate" as const,
      };

      expect(DebugConfigurationSchema.safeParse(validTimeout).success).toBe(
        true,
      );

      const tooLowTimeout = { ...validTimeout, waitForBreakpointTimeout: 500 };
      expect(DebugConfigurationSchema.safeParse(tooLowTimeout).success).toBe(
        false,
      );

      const tooHighTimeout = {
        ...validTimeout,
        waitForBreakpointTimeout: 400000,
      };
      expect(DebugConfigurationSchema.safeParse(tooHighTimeout).success).toBe(
        false,
      );
    });

    it("should validate max expression length range", () => {
      const validLength = {
        enabled: true,
        port: 3000,
        automationLevel: "assisted" as const,
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: "moderate" as const,
      };

      expect(DebugConfigurationSchema.safeParse(validLength).success).toBe(
        true,
      );

      const tooLowLength = { ...validLength, maxExpressionLength: 10 };
      expect(DebugConfigurationSchema.safeParse(tooLowLength).success).toBe(
        false,
      );

      const tooHighLength = { ...validLength, maxExpressionLength: 500 };
      expect(DebugConfigurationSchema.safeParse(tooHighLength).success).toBe(
        false,
      );
    });
  });

  describe("Configuration Change Events", () => {
    it("should fire onConfigChange event when configuration changes", () => {
      const changeListener = vi.fn();
      const disposable = configManager.onConfigChange(changeListener);

      // Simulate configuration change
      const changeHandler = (vscode.workspace.onDidChangeConfiguration as any)
        .mock.calls[0][0];

      // Mock that debugssy configuration changed
      const mockEvent = {
        affectsConfiguration: vi.fn(
          (section: string) => section === "debugssy",
        ),
      };

      vscode.workspace.getConfiguration = vi.fn(
        () =>
          ({
            get: vi.fn((key: string, defaultValue: any) => {
              if (key === "mcp.enabled") return false;
              return defaultValue;
            }),
          }) as any,
      );

      changeHandler(mockEvent);

      expect(changeListener).toHaveBeenCalled();
      disposable.dispose();
    });

    it("should not fire event for other configuration changes", () => {
      const changeListener = vi.fn();
      configManager.onConfigChange(changeListener);

      const changeHandler = (vscode.workspace.onDidChangeConfiguration as any)
        .mock.calls[0][0];

      // Mock that a different extension's configuration changed
      const mockEvent = {
        affectsConfiguration: vi.fn(
          (section: string) => section !== "debugssy",
        ),
      };

      changeHandler(mockEvent);

      expect(changeListener).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should return defaults when invalid configuration is provided", () => {
      vscode.workspace.getConfiguration = vi.fn(
        () =>
          ({
            get: vi.fn((key: string) => {
              // Return invalid values
              if (key === "mcp.port") return 999999; // Invalid port
              if (key === "maxExpressionLength") return 10; // Too low
              return undefined;
            }),
          }) as any,
      );

      const config = configManager.getConfig();

      // Should fallback to valid defaults
      expect(config.port).toBe(3000);
      expect(config.maxExpressionLength).toBe(100);
    });
  });

  describe("Resource Cleanup", () => {
    it("should dispose event listeners properly", () => {
      expect(() => configManager.dispose()).not.toThrow();
    });
  });
});
