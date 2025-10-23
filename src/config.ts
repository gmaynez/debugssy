import * as vscode from 'vscode';

export interface DebugConfiguration {
    enabled: boolean;
    port: number;
    automationLevel: 'assisted' | 'full';
    waitForBreakpointTimeout: number;
    allowStepOperations: boolean;
}

export class ConfigManager {
    private static readonly CONFIG_SECTION = 'debugssy';
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
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        return {
            enabled: config.get<boolean>('mcp.enabled', true),
            port: config.get<number>('mcp.port', 3000),
            automationLevel: config.get<'assisted' | 'full'>('automationLevel', 'assisted'),
            waitForBreakpointTimeout: config.get<number>('waitForBreakpointTimeout', 10000),
            allowStepOperations: config.get<boolean>('allowStepOperations', false)
        };
    }

    dispose(): void {
        this.configChangeEmitter.dispose();
    }
}

