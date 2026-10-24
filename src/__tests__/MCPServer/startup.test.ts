// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, expect, it } from 'vitest';
import net from 'node:net';
import { MCPServer } from '../../MCPServer';
import { ConfigManager } from '../../Config';
import { createMockToolRegistry } from '../helpers/test-helpers';
import { vscode } from '../setup';

describe('MCPServer startup failures', () => {
  it('rejects when the listen address is already in use and cleans up', async () => {
    const listener = net.createServer();
    await new Promise<void>((resolve) => listener.listen(0, 'localhost', resolve));
    const address = listener.address();
    if (!address || typeof address !== 'object') {
      throw new Error('Expected a TCP listen address');
    }
    const server = new MCPServer(address.port, createMockToolRegistry(), new ConfigManager());

    try {
      await expect(server.start({ silent: true })).rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Port ${address.port} is already in use. Please change the port in settings.`
      );
      expect((server as any).transport).toBeUndefined();
      await expect(server.stop()).resolves.toBeUndefined();
      server.dispose();
    } finally {
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
