// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCPServer } from '../../MCPServer';
import { ConfigManager } from '../../Config';
import { CURRENT_MCP_PROTOCOL_VERSION, MAX_MCP_REQUEST_BODY_BYTES } from '../../constants';
import { createMockInitializeRequest, createMockToolRegistry } from '../helpers/test-helpers';
import '../setup';

describe('MCPServer - real HTTP and SDK session lifecycle', () => {
  let server: MCPServer;
  let config: ConfigManager;
  let url: string;
  let sessionId: string;
  const headers = createMockInitializeRequest().headers;
  const initialize = createMockInitializeRequest().body;

  const post = (body: unknown, additionalHeaders: Record<string, string> = {}) =>
    globalThis.fetch(url, {
      method: 'POST',
      headers: { ...headers, ...additionalHeaders },
      body: JSON.stringify(body),
    });

  beforeEach(async () => {
    config = new ConfigManager();
    server = new MCPServer(0, createMockToolRegistry(), config);
    await server.start({ silent: true });
    const address = (server as any).httpServer.address();
    url = `http://localhost:${address.port}/mcp`;
    const response = await post(initialize);
    expect(response.status).toBe(200);
    sessionId = response.headers.get('mcp-session-id')!;
    expect(sessionId).toBeTruthy();
    await response.text();
    const initialized = await post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': CURRENT_MCP_PROTOCOL_VERSION,
      }
    );
    expect(initialized.status).toBe(202);
    await initialized.text();
  });

  afterEach(async () => {
    await server.stop();
    server.dispose();
    config.dispose();
  });

  it.each([
    ['sessionless DELETE', 'DELETE', undefined, 400],
    ['sessionless GET', 'GET', undefined, 400],
    ['unsupported PUT', 'PUT', undefined, 405],
    ['malformed JSON', 'POST', '{broken', 400],
    [
      'ordinary tool request',
      'POST',
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
      400,
    ],
    [
      'notification',
      'POST',
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      400,
    ],
    [
      'missing initialize params',
      'POST',
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize' }),
      400,
    ],
    [
      'invalid client metadata',
      'POST',
      JSON.stringify({ ...initialize, params: { ...initialize.params, clientInfo: { name: 5 } } }),
      400,
    ],
    ['invalid request ID', 'POST', JSON.stringify({ ...initialize, id: null }), 400],
    [
      'mixed batch',
      'POST',
      JSON.stringify([initialize, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]),
      400,
    ],
    ['empty batch', 'POST', '[]', 400],
  ] as const)('should preserve the live session after %s', async (_name, method, body, status) => {
    const transport = (server as any).transport;
    const close = vi.spyOn(transport, 'close');
    const response = await globalThis.fetch(url, { method, headers, ...(body ? { body } : {}) });
    expect(response.status).toBe(status);
    await response.text();
    expect((server as any).transport).toBe(transport);
    expect(close).not.toHaveBeenCalled();
    expect(server.getMetrics().sessionReplacements).toBe(0);
    expect(server.getMetrics().initSuccesses).toBe(1);
    const tools = await post(
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      {
        'mcp-session-id': sessionId,
        'mcp-protocol-version': CURRENT_MCP_PROTOCOL_VERSION,
      }
    );
    expect(tools.status).toBe(200);
    expect(await tools.text()).toContain('set_breakpoint');
  });

  it.each([
    [{ accept: 'application/json' }, 406],
    [{ 'content-type': 'text/plain' }, 415],
    [{ origin: 'https://example.com' }, 403],
  ] as const)(
    'should preserve the live transport when headers are rejected: %j',
    async (additionalHeaders, status) => {
      const transport = (server as any).transport;
      const close = vi.spyOn(transport, 'close');
      const response = await post(initialize, additionalHeaders);
      expect(response.status).toBe(status);
      await response.text();
      expect(close).not.toHaveBeenCalled();
      expect((server as any).transport).toBe(transport);
    }
  );

  it('should bound parsed bodies without replacing the live transport', async () => {
    const transport = (server as any).transport;
    const response = await post({ ...initialize, extra: 'x'.repeat(MAX_MCP_REQUEST_BODY_BYTES) });
    expect(response.status).toBe(413);
    await response.text();
    expect((server as any).transport).toBe(transport);
    expect(server.getMetrics().sessionReplacements).toBe(0);
  });

  it.each([false, true])(
    'should preserve valid reconnects (singleton batch: %s)',
    async (batch) => {
      const oldTransport = (server as any).transport;
      const close = vi.spyOn(oldTransport, 'close');
      const response = await post(batch ? [initialize] : initialize);
      expect(response.status).toBe(200);
      expect(response.headers.get('mcp-session-id')).not.toBe(sessionId);
      await response.text();
      expect(close).toHaveBeenCalledOnce();
      expect((server as any).transport).not.toBe(oldTransport);
      expect(server.getMetrics().sessionReplacements).toBe(1);
    }
  );

  it('should accept a fresh initialization after an explicit session DELETE', async () => {
    const response = await globalThis.fetch(url, {
      method: 'DELETE',
      headers: {
        ...headers,
        'mcp-session-id': sessionId,
        'mcp-protocol-version': CURRENT_MCP_PROTOCOL_VERSION,
      },
    });
    expect(response.status).toBe(200);
    await response.text();
    const next = await post(initialize);
    expect(next.status).toBe(200);
    expect(next.headers.get('mcp-session-id')).not.toBe(sessionId);
    await next.text();
  });
});
