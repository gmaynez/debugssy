// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import { ConfigManager, DebugConfiguration } from './Config';
import { MCPServer } from './MCPServer';
import { DAPClient } from './dap/Client';
import { createToolRegistry, ToolRegistry } from './tools';
import { Logger } from './utils/Logger';

/**
 * Encapsulates all extension state and dependencies to avoid module-level mutable state.
 * This improves testability and makes dependencies explicit.
 */
class ExtensionContext {
  private mcpServer: MCPServer | undefined;
  private readonly configManager: ConfigManager;
  private readonly dapClient: DAPClient;
  private readonly toolRegistry: ToolRegistry;

  constructor() {
    this.configManager = new ConfigManager();
    this.dapClient = new DAPClient();
    this.toolRegistry = createToolRegistry(this.dapClient, this.configManager);
  }

  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  getDAPClient(): DAPClient {
    return this.dapClient;
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getMCPServer(): MCPServer | undefined {
    return this.mcpServer;
  }

  async startMCPServer(port: number): Promise<void> {
    try {
      this.mcpServer = new MCPServer(port, this.toolRegistry, this.configManager);
      await this.mcpServer.start();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      vscode.window.showErrorMessage(`Failed to start MCP Server: ${errorMessage}`);
      this.mcpServer = undefined;
    }
  }

  async stopMCPServer(): Promise<void> {
    if (this.mcpServer) {
      await this.mcpServer.stop();
      this.mcpServer.dispose(); // Clean up resources before discarding
      this.mcpServer = undefined;
      vscode.window.showInformationMessage('Debugssy MCP Server stopped');
    }
  }

  /**
   * Main configuration change handler that delegates to specific handlers.
   */
  async handleConfigChange(
    newConfig: DebugConfiguration,
    previousConfig: DebugConfiguration
  ): Promise<void> {
    await this.handleServerEnabledChange(newConfig, previousConfig);
    await this.handlePortChange(newConfig, previousConfig);
    await this.handleAutomationLevelChange(newConfig, previousConfig);
    await this.handleStepOperationsChange(newConfig, previousConfig);
  }

  async dispose(): Promise<void> {
    if (this.mcpServer) {
      await this.mcpServer.stop();
      this.mcpServer.dispose(); // Clean up event listeners
    }
    this.toolRegistry.dispose(); // Clean up tool registry event listeners
    this.dapClient.dispose();
    this.configManager.dispose();
  }

  /**
   * Handles changes to the enabled state of the MCP server.
   */
  private async handleServerEnabledChange(
    newConfig: DebugConfiguration,
    _previousConfig: DebugConfiguration
  ): Promise<void> {
    const mcpServer = this.getMCPServer();

    if (newConfig.enabled && !mcpServer) {
      await this.startMCPServer(newConfig.port);
    } else if (!newConfig.enabled && mcpServer) {
      await this.stopMCPServer();
    }
  }

  /**
   * Handles changes to the MCP server port.
   */
  private async handlePortChange(
    newConfig: DebugConfiguration,
    previousConfig: DebugConfiguration
  ): Promise<void> {
    const mcpServer = this.getMCPServer();

    if (mcpServer && newConfig.port !== previousConfig.port) {
      await mcpServer.updatePort(newConfig.port);
      vscode.window.showInformationMessage(
        `Debugssy: MCP server restarted on port ${newConfig.port}`
      );
    }
  }

  /**
   * Handles changes to the automation level.
   */
  private async handleAutomationLevelChange(
    newConfig: DebugConfiguration,
    previousConfig: DebugConfiguration
  ): Promise<void> {
    const mcpServer = this.getMCPServer();

    if (mcpServer && newConfig.automationLevel !== previousConfig.automationLevel) {
      await mcpServer.handleAutomationLevelChange(newConfig.automationLevel);
      vscode.window.showInformationMessage(`Debugssy: Mode set to '${newConfig.automationLevel}'`);
    }
  }

  /**
   * Handles changes to the step operations setting.
   */
  private async handleStepOperationsChange(
    newConfig: DebugConfiguration,
    previousConfig: DebugConfiguration
  ): Promise<void> {
    const mcpServer = this.getMCPServer();

    if (mcpServer && newConfig.allowStepOperations !== previousConfig.allowStepOperations) {
      await mcpServer.handleStepOperationsChange(newConfig.allowStepOperations);
      vscode.window.showInformationMessage(
        `Debugssy: Step operations ${newConfig.allowStepOperations ? 'enabled' : 'disabled'}`
      );
    }
  }
}

let extensionContext: ExtensionContext | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const logger = Logger.getInstance();
  logger.info('Debugssy extension is now active');

  // Initialize extension context
  extensionContext = new ExtensionContext();
  const configManager = extensionContext.getConfigManager();
  const dapClient = extensionContext.getDAPClient();

  // Start MCP server if enabled
  const config = configManager.getConfig();
  if (config.enabled) {
    await extensionContext.startMCPServer(config.port);
  }

  // Watch for configuration changes
  let previousConfig = config;
  context.subscriptions.push(
    configManager.onConfigChange(async (newConfig) => {
      if (!extensionContext) {
        logger.error('Extension context is not initialized');
        return;
      }

      await extensionContext.handleConfigChange(newConfig, previousConfig);
      previousConfig = newConfig;
    })
  );

  // Track debug sessions
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      logger.info('Debug session started:', session.name);
      // Note: execution state will be set to 'running' by DAP 'continued' event
      // or 'paused' by DAP 'stopped' event
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      logger.info('Debug session terminated:', session.name);
      dapClient.reset();
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidChangeActiveDebugSession((session) => {
      if (session) {
        logger.info('Active debug session changed:', session.name);
      }
    })
  );

  // Register commands for manual control
  context.subscriptions.push(
    vscode.commands.registerCommand('debugssy.startServer', async () => {
      if (!extensionContext) {
        vscode.window.showErrorMessage('Extension context is not initialized');
        return;
      }

      const mcpServer = extensionContext.getMCPServer();
      const config = configManager.getConfig();

      if (mcpServer) {
        vscode.window.showInformationMessage('MCP Server is already running');
      } else {
        await extensionContext.startMCPServer(config.port);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debugssy.stopServer', async () => {
      if (!extensionContext) {
        vscode.window.showErrorMessage('Extension context is not initialized');
        return;
      }

      const mcpServer = extensionContext.getMCPServer();
      if (mcpServer) {
        await extensionContext.stopMCPServer();
      } else {
        vscode.window.showInformationMessage('MCP Server is not running');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debugssy.restartServer', async () => {
      if (!extensionContext) {
        vscode.window.showErrorMessage('Extension context is not initialized');
        return;
      }

      // Capture in local variable for use in async callback
      const extContext = extensionContext;
      const mcpServer = extContext.getMCPServer();
      const config = configManager.getConfig();

      // Show status message during restart
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Restarting Debugssy MCP Server...',
          cancellable: false,
        },
        async (progress) => {
          try {
            progress.report({ increment: 30, message: 'Stopping server...' });

            if (mcpServer) {
              await extContext.stopMCPServer();
            }

            progress.report({ increment: 30, message: 'Starting server...' });
            await extContext.startMCPServer(config.port);

            progress.report({ increment: 40, message: 'Done!' });

            // Give user a moment to see the completion
            await new Promise((resolve) => setTimeout(resolve, 500));

            vscode.window.showInformationMessage(
              `Debugssy MCP Server restarted successfully on port ${config.port}`
            );
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to restart MCP Server: ${errorMessage}`);
          }
        }
      );
    })
  );
}

export async function deactivate() {
  if (extensionContext) {
    await extensionContext.dispose();
    extensionContext = undefined;
  }
  Logger.getInstance().dispose();
}
