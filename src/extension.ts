import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { MCPServer } from './mcpServer';
import { DAPClient } from './dap/client';
import { createToolRegistry, ToolRegistry } from './tools';

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
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to start MCP Server: ${error.message}`);
            this.mcpServer = undefined;
        }
    }

    async stopMCPServer(): Promise<void> {
        if (this.mcpServer) {
            await this.mcpServer.stop();
            this.mcpServer = undefined;
            vscode.window.showInformationMessage('Debugssy MCP Server stopped');
        }
    }

    async dispose(): Promise<void> {
        if (this.mcpServer) {
            await this.mcpServer.stop();
        }
        this.dapClient.dispose();
        this.configManager.dispose();
    }
}

let extensionContext: ExtensionContext | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Debugssy extension is now active');

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
            const mcpServer = extensionContext!.getMCPServer();
            
            if (newConfig.enabled && !mcpServer) {
                await extensionContext!.startMCPServer(newConfig.port);
            } else if (!newConfig.enabled && mcpServer) {
                await extensionContext!.stopMCPServer();
            } else if (mcpServer && newConfig.port !== previousConfig.port) {
                await mcpServer.updatePort(newConfig.port);
                vscode.window.showInformationMessage(
                    `Debugssy: MCP server restarted on port ${newConfig.port}`
                );
            } else if (mcpServer && newConfig.automationLevel !== previousConfig.automationLevel) {
                // Automation level changed - restart server with single consolidated notification
                await mcpServer.handleAutomationLevelChange(newConfig.automationLevel);
                vscode.window.showInformationMessage(
                    `Debugssy: Automation mode changed to '${newConfig.automationLevel}'. MCP server restarted on port ${newConfig.port}.`
                );
            }
            previousConfig = newConfig;
        })
    );

    // Track debug sessions
    context.subscriptions.push(
        vscode.debug.onDidStartDebugSession((session) => {
            console.log('Debug session started:', session.name);
            // Note: execution state will be set to 'running' by DAP 'continued' event
            // or 'paused' by DAP 'stopped' event
        })
    );

    context.subscriptions.push(
        vscode.debug.onDidTerminateDebugSession((session) => {
            console.log('Debug session terminated:', session.name);
            dapClient.reset();
        })
    );

    context.subscriptions.push(
        vscode.debug.onDidChangeActiveDebugSession((session) => {
            if (session) {
                console.log('Active debug session changed:', session.name);
            }
        })
    );

    // Register commands for manual control
    context.subscriptions.push(
        vscode.commands.registerCommand('debugssy.startServer', async () => {
            const mcpServer = extensionContext!.getMCPServer();
            const config = configManager.getConfig();
            
            if (mcpServer) {
                vscode.window.showInformationMessage('MCP Server is already running');
            } else {
                await extensionContext!.startMCPServer(config.port);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugssy.stopServer', async () => {
            const mcpServer = extensionContext!.getMCPServer();
            if (mcpServer) {
                await extensionContext!.stopMCPServer();
            } else {
                vscode.window.showInformationMessage('MCP Server is not running');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugssy.restartServer', async () => {
            const mcpServer = extensionContext!.getMCPServer();
            const config = configManager.getConfig();
            
            if (mcpServer) {
                await extensionContext!.stopMCPServer();
            }
            await extensionContext!.startMCPServer(config.port);
        })
    );
}

export async function deactivate() {
    if (extensionContext) {
        await extensionContext.dispose();
        extensionContext = undefined;
    }
}

