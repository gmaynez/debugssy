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
            if (!folder) {
                return {
                    success: false,
                    error: 'No workspace folder available'
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

    private async executeCommandWithAutomationCheck(
        command: string,
        successMessage: string,
        assistedMessage: string
    ): Promise<DebugControlResult> {
        const automationLevel = this.configManager?.getConfig().automationLevel || 'assisted';
        if (automationLevel === 'assisted') {
            return {
                success: true,
                message: `Assisted mode: ${assistedMessage}`
            };
        }
        return this.executeCommand(command, successMessage);
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

