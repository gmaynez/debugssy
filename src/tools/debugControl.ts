import * as vscode from 'vscode';
import { ConfigManager } from '../config';

export interface DebugControlResult {
    success: boolean;
    message?: string;
    error?: string;
}

export class DebugControlTools {
    private activeSession: vscode.DebugSession | undefined;

    constructor(private configManager?: ConfigManager) {
        vscode.debug.onDidStartDebugSession((session) => {
            this.activeSession = session;
        });

        vscode.debug.onDidTerminateDebugSession(() => {
            this.activeSession = undefined;
        });
    }

    async startDebugging(args: {
        workspaceFolder?: string;
        configuration?: any;
        name?: string;
    }): Promise<DebugControlResult> {
        try {
            // Check automation level
            const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
            if (automationLevel === 'assisted') {
                return {
                    success: false,
                    error: 'Cannot start debugging in assisted mode. Please start debugging manually using VS Code UI, or switch to full automation mode.'
                };
            }

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return {
                    success: false,
                    error: 'No workspace folder open'
                };
            }

            // Select workspace folder
            let folder = workspaceFolders[0];
            if (args.workspaceFolder) {
                const found = workspaceFolders.find(
                    (f) => f.name === args.workspaceFolder || f.uri.fsPath === args.workspaceFolder
                );
                if (found) {
                    folder = found;
                }
            }

            // Use provided configuration or try to find one
            let config = args.configuration;
            if (!config && args.name) {
                const configs = vscode.workspace.getConfiguration('launch', folder.uri).get<any[]>('configurations', []);
                config = configs.find((c) => c.name === args.name);
            }

            if (!config) {
                return {
                    success: false,
                    error: 'No debug configuration provided or found'
                };
            }

            const success = await vscode.debug.startDebugging(folder, config);
            return {
                success,
                message: success ? 'Debug session started' : 'Failed to start debug session'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async stopDebugging(): Promise<DebugControlResult> {
        try {
            if (!this.activeSession) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            await vscode.debug.stopDebugging(this.activeSession);
            return {
                success: true,
                message: 'Debug session stopped'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async continueExecution(): Promise<DebugControlResult> {
        const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
        if (automationLevel === 'assisted') {
            return {
                success: true,
                message: 'Assisted mode: Please click Continue in VS Code debugger UI when ready to proceed.'
            };
        }
        return this.executeCommand('workbench.action.debug.continue', 'Execution continued');
    }

    async stepOver(): Promise<DebugControlResult> {
        const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
        if (automationLevel === 'assisted') {
            return {
                success: true,
                message: 'Assisted mode: Please click Step Over in VS Code debugger UI.'
            };
        }
        return this.executeCommand('workbench.action.debug.stepOver', 'Stepped over');
    }

    async stepInto(): Promise<DebugControlResult> {
        const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
        if (automationLevel === 'assisted') {
            return {
                success: true,
                message: 'Assisted mode: Please click Step Into in VS Code debugger UI.'
            };
        }
        return this.executeCommand('workbench.action.debug.stepInto', 'Stepped into');
    }

    async stepOut(): Promise<DebugControlResult> {
        const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
        if (automationLevel === 'assisted') {
            return {
                success: true,
                message: 'Assisted mode: Please click Step Out in VS Code debugger UI.'
            };
        }
        return this.executeCommand('workbench.action.debug.stepOut', 'Stepped out');
    }

    async pause(): Promise<DebugControlResult> {
        const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
        if (automationLevel === 'assisted') {
            return {
                success: true,
                message: 'Assisted mode: Please click Pause in VS Code debugger UI.'
            };
        }
        return this.executeCommand('workbench.action.debug.pause', 'Execution paused');
    }

    async restart(): Promise<DebugControlResult> {
        const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
        if (automationLevel === 'assisted') {
            return {
                success: true,
                message: 'Assisted mode: Please click Restart in VS Code debugger UI.'
            };
        }
        return this.executeCommand('workbench.action.debug.restart', 'Debug session restarted');
    }

    private async executeCommand(command: string, successMessage: string): Promise<DebugControlResult> {
        try {
            if (!this.activeSession) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            await vscode.commands.executeCommand(command);
            return {
                success: true,
                message: successMessage
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    getActiveSession(): vscode.DebugSession | undefined {
        return this.activeSession;
    }
}

