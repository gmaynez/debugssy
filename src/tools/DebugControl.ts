// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import { ConfigManager } from '../Config';
import { DebugNotActiveError, createErrorResult } from '../errors';
import type { DebugControlResult } from '../routing/types/toolResults';

export type { DebugControlResult } from '../routing/types/toolResults';

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
        this.activeSession = vscode.debug.activeDebugSession;
      })
    );

    this.disposables.push(
      vscode.debug.onDidChangeActiveDebugSession((session) => {
        this.activeSession = session;
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
        if (!found) {
          return {
            success: false,
            error: `Workspace folder not found: ${args.workspaceFolder}`,
          };
        }
        folder = found;
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

      // Validate runtime types before crossing the VS Code API boundary.
      const requiredFields = ['type', 'name', 'request'] as const;
      const missing = requiredFields.filter((field) => config[field] === undefined);
      if (missing.length > 0) {
        return {
          success: false,
          error: `Invalid debug configuration: missing required field(s): ${missing.join(', ')}`,
        };
      }
      const invalid = requiredFields.filter(
        (field) => typeof config[field] !== 'string' || !(config[field] as string).trim()
      );
      if (invalid.length > 0) {
        return {
          success: false,
          error: `Invalid debug configuration: field(s) must be non-empty strings: ${invalid.join(', ')}`,
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
      return createErrorResult(error);
    }
  }

  async stopDebugging(_args?: Record<string, unknown>): Promise<DebugControlResult> {
    try {
      const session = this.getCurrentSession();
      if (!session) {
        throw new DebugNotActiveError('stop_debugging');
      }

      await vscode.debug.stopDebugging(session);
      return {
        success: true,
        message: 'Debug session stopped',
      };
    } catch (error: unknown) {
      return createErrorResult(error);
    }
  }

  async continueExecution(_args?: Record<string, unknown>): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.continue',
      'Execution continued',
      'Please click Continue in VS Code debugger UI when ready to proceed.'
    );
  }

  async stepOver(_args?: Record<string, unknown>): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.stepOver',
      'Stepped over',
      'Please click Step Over in VS Code debugger UI.'
    );
  }

  async stepInto(_args?: Record<string, unknown>): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.stepInto',
      'Stepped into',
      'Please click Step Into in VS Code debugger UI.'
    );
  }

  async stepOut(_args?: Record<string, unknown>): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.stepOut',
      'Stepped out',
      'Please click Step Out in VS Code debugger UI.'
    );
  }

  async pause(_args?: Record<string, unknown>): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.pause',
      'Execution paused',
      'Please click Pause in VS Code debugger UI.'
    );
  }

  async restart(_args?: Record<string, unknown>): Promise<DebugControlResult> {
    return this.executeCommandWithAutomationCheck(
      'workbench.action.debug.restart',
      'Debug session restarted',
      'Please click Restart in VS Code debugger UI.'
    );
  }

  getActiveSession(): vscode.DebugSession | undefined {
    return this.getCurrentSession();
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
      if (!this.getCurrentSession()) {
        throw new DebugNotActiveError(command);
      }

      await vscode.commands.executeCommand(command);
      return {
        success: true,
        message: successMessage,
      };
    } catch (error: unknown) {
      return createErrorResult(error);
    }
  }

  private getCurrentSession(): vscode.DebugSession | undefined {
    return vscode.debug.activeDebugSession ?? this.activeSession;
  }
}
