import * as vscode from 'vscode';
import { ConfigManager } from './config';
import { MCPServer } from './mcpServer';
import { DAPClient } from './dap/client';
import { createToolRegistry } from './tools';

let mcpServer: MCPServer | undefined;
let configManager: ConfigManager;
let dapClient: DAPClient;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Debugsy extension is now active');

    // Initialize configuration manager
    configManager = new ConfigManager();

    // Initialize DAP client
    dapClient = new DAPClient();

    // Create tool registry
    const toolRegistry = createToolRegistry(dapClient, configManager);

    // Start MCP server if enabled
    const config = configManager.getConfig();
    if (config.enabled) {
        await startMCPServer(config.port, toolRegistry);
    }

    // Watch for configuration changes
    context.subscriptions.push(
        configManager.onConfigChange(async (newConfig) => {
            if (newConfig.enabled && !mcpServer) {
                await startMCPServer(newConfig.port, toolRegistry);
            } else if (!newConfig.enabled && mcpServer) {
                await stopMCPServer();
            } else if (mcpServer && newConfig.port !== config.port) {
                await mcpServer.updatePort(newConfig.port);
            }
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
        vscode.commands.registerCommand('debugsy.startServer', async () => {
            const config = configManager.getConfig();
            if (mcpServer) {
                vscode.window.showInformationMessage('MCP Server is already running');
            } else {
                await startMCPServer(config.port, toolRegistry);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugsy.stopServer', async () => {
            if (mcpServer) {
                await stopMCPServer();
            } else {
                vscode.window.showInformationMessage('MCP Server is not running');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('debugsy.restartServer', async () => {
            if (mcpServer) {
                await stopMCPServer();
            }
            const config = configManager.getConfig();
            await startMCPServer(config.port, toolRegistry);
        })
    );
}

async function startMCPServer(port: number, toolRegistry: any): Promise<void> {
    try {
        mcpServer = new MCPServer(port, toolRegistry, configManager);
        await mcpServer.start();
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to start MCP Server: ${error.message}`);
        mcpServer = undefined;
    }
}

async function stopMCPServer(): Promise<void> {
    if (mcpServer) {
        await mcpServer.stop();
        mcpServer = undefined;
        vscode.window.showInformationMessage('Debugsy MCP Server stopped');
    }
}

export async function deactivate() {
    if (mcpServer) {
        await mcpServer.stop();
    }
    if (dapClient) {
        dapClient.dispose();
    }
    if (configManager) {
        configManager.dispose();
    }
}

