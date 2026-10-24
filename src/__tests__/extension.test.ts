// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activate, deactivate } from '../extension';
import { vscode } from './setup';

const lifecycle = vi.hoisted(() => ({
  servers: [] as Array<{
    port: number;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    updatePort: ReturnType<typeof vi.fn>;
    handleAutomationLevelChange: ReturnType<typeof vi.fn>;
    handleStepOperationsChange: ReturnType<typeof vi.fn>;
  }>,
  startImplementation: (_port: number): Promise<void> => Promise.resolve(),
  stopImplementation: (_port: number): Promise<void> => Promise.resolve(),
  dapDispose: vi.fn(),
  registryDispose: vi.fn(),
}));

vi.mock('../MCPServer', () => ({
  MCPServer: class {
    public start = vi.fn(() => lifecycle.startImplementation(this.port));
    public stop = vi.fn(() => lifecycle.stopImplementation(this.port));
    public dispose = vi.fn();
    public updatePort = vi.fn((port: number) => {
      this.port = port;
      return Promise.resolve();
    });
    public handleAutomationLevelChange = vi.fn(() => Promise.resolve());
    public handleStepOperationsChange = vi.fn(() => Promise.resolve());

    constructor(public port: number) {
      lifecycle.servers.push(this);
    }
  },
}));

vi.mock('../dap/Client', () => ({
  DAPClient: class {
    public reset = vi.fn();
    public dispose = lifecycle.dapDispose;
  },
}));

vi.mock('../tools', () => ({
  createToolRegistry: () => ({ dispose: lifecycle.registryDispose }),
}));

describe('extension lifecycle', () => {
  let configValues: Record<string, unknown>;
  let extensionContext: { subscriptions: Array<{ dispose(): void }> };

  const configurationHandler = () =>
    (vscode.workspace.onDidChangeConfiguration as any).mock.calls[0][0] as (event: {
      affectsConfiguration(section: string): boolean;
    }) => void;

  const fireConfigChange = () => {
    configurationHandler()({ affectsConfiguration: (section) => section === 'debugssy' });
  };

  const command = (name: string) => {
    const registration = (vscode.commands.registerCommand as any).mock.calls.find(
      ([commandName]: [string]) => commandName === name
    );
    return registration[1] as () => Promise<void>;
  };

  const serverAt = (index: number) => {
    const server = lifecycle.servers[index];
    if (!server) {
      throw new Error(`Expected server at index ${index}`);
    }
    return server;
  };

  const flushAsyncOperations = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  beforeEach(() => {
    lifecycle.servers.length = 0;
    lifecycle.startImplementation = () => Promise.resolve();
    lifecycle.stopImplementation = () => Promise.resolve();
    lifecycle.dapDispose = vi.fn();
    lifecycle.registryDispose = vi.fn();
    configValues = {};
    extensionContext = { subscriptions: [] };

    vscode.workspace.getConfiguration = vi.fn(
      () =>
        ({
          get: vi.fn((key: string, defaultValue: unknown) => configValues[key] ?? defaultValue),
        }) as any
    );
  });

  afterEach(async () => {
    try {
      await deactivate();
    } catch {
      // Individual cleanup-failure tests assert the rejection explicitly.
    }
  });

  it('cleans up a partially started server and propagates activation failure', async () => {
    configValues['mcp.enabled'] = true;
    const startupError = new Error('listen failed');
    lifecycle.startImplementation = () => Promise.reject(startupError);

    await expect(activate(extensionContext as any)).rejects.toBe(startupError);

    expect(lifecycle.servers).toHaveLength(1);
    expect(serverAt(0).stop).toHaveBeenCalledOnce();
    expect(serverAt(0).dispose).toHaveBeenCalledOnce();
    expect(lifecycle.registryDispose).toHaveBeenCalledOnce();
    expect(lifecycle.dapDispose).toHaveBeenCalledOnce();
  });

  it('disposes and forgets a server even when stopping it fails', async () => {
    configValues['mcp.enabled'] = true;
    await activate(extensionContext as any);
    const server = serverAt(0);
    const stopError = new Error('stop failed');
    server.stop.mockRejectedValueOnce(stopError);

    await expect(command('debugssy.stopServer')()).rejects.toBe(stopError);

    expect(server.dispose).toHaveBeenCalledOnce();
    await command('debugssy.stopServer')();
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('MCP Server is not running');
  });

  it('continues extension disposal after server cleanup fails', async () => {
    configValues['mcp.enabled'] = true;
    await activate(extensionContext as any);
    const server = serverAt(0);
    const stopError = new Error('stop failed');
    server.stop.mockRejectedValueOnce(stopError);

    await expect(deactivate()).rejects.toBe(stopError);

    expect(server.dispose).toHaveBeenCalledOnce();
    expect(lifecycle.registryDispose).toHaveBeenCalledOnce();
    expect(lifecycle.dapDispose).toHaveBeenCalledOnce();
  });

  it('does not report a successful restart when startup fails', async () => {
    configValues['mcp.enabled'] = true;
    await activate(extensionContext as any);
    const startupError = new Error('new port unavailable');
    lifecycle.startImplementation = () => Promise.reject(startupError);

    await command('debugssy.restartServer')();

    expect(lifecycle.servers).toHaveLength(2);
    expect(serverAt(1).stop).toHaveBeenCalledOnce();
    expect(serverAt(1).dispose).toHaveBeenCalledOnce();
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'Failed to restart MCP Server: new port unavailable'
    );
    expect(vscode.window.showInformationMessage).not.toHaveBeenCalledWith(
      expect.stringContaining('restarted successfully')
    );
  });

  it('serializes rapid disable/enable and port changes to the latest configuration', async () => {
    configValues['mcp.enabled'] = true;
    await activate(extensionContext as any);

    let releaseFirstStop: () => void = () => {};
    const firstStop = new Promise<void>((resolve) => {
      releaseFirstStop = resolve;
    });
    lifecycle.stopImplementation = (port) => (port === 3000 ? firstStop : Promise.resolve());

    configValues = { 'mcp.enabled': false };
    fireConfigChange();
    configValues = { 'mcp.enabled': true, 'mcp.port': 4000 };
    fireConfigChange();
    configValues = { 'mcp.enabled': false };
    fireConfigChange();
    configValues = { 'mcp.enabled': true, 'mcp.port': 4500 };
    fireConfigChange();

    await flushAsyncOperations();
    expect(lifecycle.servers).toHaveLength(1);

    releaseFirstStop();
    await flushAsyncOperations();
    await flushAsyncOperations();

    expect(lifecycle.servers.map((server) => server.port)).toEqual([3000, 4000, 4500]);
    expect(serverAt(0).stop).toHaveBeenCalledOnce();
    expect(serverAt(1).stop).toHaveBeenCalledOnce();
    expect(serverAt(2).stop).not.toHaveBeenCalled();
  });

  it('registers and serves VS Code MCP discovery definitions', async () => {
    configValues['mcp.enabled'] = true;
    const register = vi.fn((_id: string, _provider: unknown) => ({ dispose: vi.fn() }));
    vscode.lm = { registerMcpServerDefinitionProvider: register } as any;
    vscode.cursor = undefined as any;

    await activate(extensionContext as any);

    expect(register).toHaveBeenCalledWith('debugssy', expect.any(Object));
    const provider = register.mock.calls[0]?.[1] as any;
    const definitions = await provider.provideMcpServerDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0].uri.toString()).toBe('http://localhost:3000/mcp');
  });

  it('registers the running server with Cursor MCP discovery', async () => {
    configValues['mcp.enabled'] = true;
    const registerServer = vi.fn();
    const unregisterServer = vi.fn();
    vscode.lm = undefined as any;
    vscode.cursor = { mcp: { registerServer, unregisterServer } } as any;

    await activate(extensionContext as any);

    expect(unregisterServer).toHaveBeenCalledWith('debugssy');
    expect(registerServer).toHaveBeenCalledWith({
      name: 'debugssy',
      server: { url: 'http://localhost:3000/mcp' },
    });
  });

  it('activates without either host discovery API', async () => {
    configValues['mcp.enabled'] = true;
    vscode.lm = undefined as any;
    vscode.cursor = undefined as any;

    await activate(extensionContext as any);

    expect(lifecycle.servers).toHaveLength(1);
    expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
      'debugssy.startServer',
      expect.any(Function)
    );
  });
});
