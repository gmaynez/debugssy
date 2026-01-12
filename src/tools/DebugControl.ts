// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import { ConfigManager } from '../Config';

export interface DebugControlResult {
  success: boolean;
  message?: string;
  error?: string;
}

export class DebugControlTools implements vscode.Disposable {
  private activeSession: vscode.DebugSession | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private configManager: ConfigManager) {
    // Initialize with current active session (if any) to avoid race condition
    // where extension loads after debug session has already started
    this.activeSession = vscode.debug.activeDebugSession;

    // Then subscribe to future changes and store disposables for cleanup
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => {
        this.activeSession = session;
      })
    );

    this.disposables.push(
      vscode.debug.onDidTerminateDebugSession(() => {
        this.activeSession = undefined;
      })
    );
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  async startDebugging(args: {
    workspaceFolder?: string;
    /** Debug configuration object. Must include type, name, and request properties. */
    configuration?: Record<string, unknown>;
    name?: string;
  }): Promise<DebugControlResult> {
    try {
      // Check automation level
      const automationLevel = this.configManager.getConfig().automationLevel;
      if (automationLevel === 'assisted') {
        return {
          success: false,
          error:
            'Cannot start debugging in assisted mode. Please start debugging manually using VS Code UI, or switch to full automation mode.',
        };
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return {
          success: false,
          error: 'No workspace folder open',
        };
      }

      // Select workspace folder
      let folder = workspaceFolders[0];
      if (!folder) {
        return {
          success: false,
          error: 'No workspace folder available',
        };
      }

      if (args.workspaceFolder) {
        const found = workspaceFolders.find(
          (f) => f.name === args.workspaceFolder || f.uri.fsPath === args.workspaceFolder
        );
        if (found) {
          folder = found;
        }
      }

      // Use provided configuration or try to find one by name
      let config: Record<string, unknown> | vscode.DebugConfiguration | undefined =
        args.configuration;
      if (!config && args.name) {
        const configs = vscode.workspace
          .getConfiguration('launch', folder.uri)
          .get<vscode.DebugConfiguration[]>('configurations', []);
        config = configs.find((c) => c.name === args.name);
      }

      if (!config) {
        return {
          success: false,
          error: 'No debug configuration provided or found',
        };
      }

      // Validate required configuration fields before calling VS Code
      const configType = config.type as string | undefined;
      const configName = config.name as string | undefined;
      const configRequest = config.request as string | undefined;
      if (!configType || !configName || !configRequest) {
        const missing = [
          !configType && 'type',
          !configName && 'name',
          !configRequest && 'request',
        ].filter(Boolean);
        return {
          success: false,
          error: `Invalid debug configuration: missing required field(s): ${missing.join(', ')}`,
        };
      }

      const success = await vscode.debug.startDebugging(
        folder,
        config as vscode.DebugConfiguration
      );
      return {
        success,
        message: success ? 'Debug session started' : 'Failed to start debug session',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async stopDebugging(): Promise<DebugControlResult> {
    try {
      if (!this.activeSession) {
        return {
          success: false,
          error: 'No active debug session',
        };
      }

      await vscode.debug.stopDebugging(this.activeSession);
      return {
        success: true,
        message: 'Debug session stopped',
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async continueExecution(): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.continue',
      'Execution continued',
      'Please click Continue in VS Code debugger UI when ready to proceed.'
    );
  }

  async stepOver(): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.stepOver',
      'Stepped over',
      'Please click Step Over in VS Code debugger UI.'
    );
  }

  async stepInto(): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.stepInto',
      'Stepped into',
      'Please click Step Into in VS Code debugger UI.'
    );
  }

  async stepOut(): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.stepOut',
      'Stepped out',
      'Please click Step Out in VS Code debugger UI.'
    );
  }

  async pause(): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.pause',
      'Execution paused',
      'Please click Pause in VS Code debugger UI.'
    );
  }

  async restart(): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.restart',
      'Debug session restarted',
      'Please click Restart in VS Code debugger UI.'
    );
  }

  getActiveSession(): vscode.DebugSession | undefined {
    return this.activeSession;
  }

  private async executeCommandWithAutomationCheck(
    command: string,
    successMessage: string,
    assistedMessage: string
  ): Promise<DebugControlResult> {
    const automationLevel = this.configManager.getConfig().automationLevel;
    if (automationLevel === 'assisted') {
      return {
        success: true,
        message: `Assisted mode: ${assistedMessage}`,
      };
    }
    return this.executeCommand(command, successMessage);
  }

  private async executeCommand(
    command: string,
    successMessage: string
  ): Promise<DebugControlResult> {
    try {
      if (!this.activeSession) {
        return {
          success: false,
          error: 'No active debug session',
        };
      }

      await vscode.commands.executeCommand(command);
      return {
        success: true,
        message: successMessage,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
