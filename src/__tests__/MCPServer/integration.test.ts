// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { MCPServer } from '../../MCPServer';
import { ConfigManager } from '../../Config';
import { EXTENSION_VERSION, CURRENT_MCP_PROTOCOL_VERSION } from '../../constants';
import { createMockToolRegistry } from '../helpers/test-helpers';
import '../setup';

const getRouteHandler = (app: Express, path: string) => {
  const stack = (app as any)._router?.stack ?? (app as any).router?.stack ?? [];
  const layer = stack.find((entry: any) => entry.route?.path === path);
  return layer?.route?.stack?.[0]?.handle as ((req: any, res: any) => Promise<void>) | undefined;
};

describe('MCPServer - Integration', () => {
  let server: MCPServer;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (server && !(server as any).isDisposed) {
      try {
        await server.stop();
        server.dispose();
      } catch (_e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Health Endpoint', () => {
    it('should return 503 when not ready', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const app = (server as any).app as Express;
      const handler = getRouteHandler(app, '/health');

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      await handler?.({ method: 'GET', headers: {}, url: '/health' }, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'initializing',
          transportReady: false,
        })
      );
    });

    it('should return 200 when ready', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());
      (server as any).isTransportReady = true;
      (server as any).transport = {};

      const app = (server as any).app as Express;
      const handler = getRouteHandler(app, '/health');

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      await handler?.({ method: 'GET', headers: {}, url: '/health' }, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          transportReady: true,
        })
      );
    });

    it('should include version and protocol info', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const app = (server as any).app as Express;
      const handler = getRouteHandler(app, '/health');

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      await handler?.({ method: 'GET', headers: {}, url: '/health' }, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          server: 'debugssy-mcp',
          version: EXTENSION_VERSION,
          protocolVersion: CURRENT_MCP_PROTOCOL_VERSION,
        })
      );
    });
  });

  describe('MCP Request Routing', () => {
    it('should route requests to handleMcpRequest', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const handleMcpRequest = vi.fn().mockResolvedValue(undefined);
      (server as any).handleMcpRequest = handleMcpRequest;

      const app = (server as any).app as Express;
      const handler = getRouteHandler(app, '/mcp');

      const req = { method: 'POST', headers: {}, url: '/mcp' };
      const res = {};

      await handler?.(req, res);

      expect(handleMcpRequest).toHaveBeenCalledWith(req, res);
    });

    it('should handle errors in MCP requests', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;
      (server as any).transport = {
        handleRequest: vi.fn().mockRejectedValue(new Error('Transport error')),
      };

      const app = (server as any).app as Express;
      const handler = getRouteHandler(app, '/mcp');

      const res = {
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      const req = {
        method: 'POST',
        headers: { 'mcp-session-id': 'test-session' },
        url: '/mcp',
      };

      await handler?.(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Transport error',
        })
      );
    });
  });

  describe('Request Flow', () => {
    it('should handle init request flow', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;

      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      (server as any).transport = mockTransport;

      const handleInitRequest = vi.fn().mockResolvedValue(undefined);
      (server as any).handleInitRequest = handleInitRequest;

      const req = { method: 'POST', headers: {}, url: '/mcp' } as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleMcpRequest(req, res);

      expect(handleInitRequest).toHaveBeenCalled();
    });

    it('should handle existing session request', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;

      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      (server as any).transport = mockTransport;

      const req = {
        method: 'POST',
        headers: { 'mcp-session-id': 'existing-session' },
        url: '/mcp',
      } as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleMcpRequest(req, res);

      expect(mockTransport.handleRequest).toHaveBeenCalledWith(req, res);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track init attempts', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;

      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      (server as any).transport = mockTransport;

      const req = { method: 'POST', headers: {}, url: '/mcp' } as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleInitRequest(req, res, mockTransport, 'test');

      expect(server.getMetrics().initAttempts).toBe(1);
    });

    it('should track successful inits', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;
      (server as any).hasSuccessfulInit = false;
      (server as any).isInitLockHeld = false;

      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      (server as any).transport = mockTransport;

      const req = { method: 'POST', headers: {}, url: '/mcp' } as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleSerializedInitRequest(req, res, mockTransport, 'test');

      expect(server.getMetrics().initSuccesses).toBe(1);
      expect((server as any).hasSuccessfulInit).toBe(true);
    });
  });

  describe('Configuration Changes', () => {
    it('should handle automation level changes', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const notifyToolListChanged = vi.fn().mockResolvedValue(undefined);
      (server as any).notifyToolListChanged = notifyToolListChanged;

      await server.handleAutomationLevelChange('full');

      expect(server.getCurrentAutomationLevel()).toBe('full');
      expect(notifyToolListChanged).toHaveBeenCalledWith('automation level assisted → full');
    });

    it('should handle step operations changes', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const notifyToolListChanged = vi.fn().mockResolvedValue(undefined);
      (server as any).notifyToolListChanged = notifyToolListChanged;

      await server.handleStepOperationsChange(true);

      expect(notifyToolListChanged).toHaveBeenCalledWith('step operations enabled');
    });
  });

  describe('JSON-RPC Error Handling', () => {
    it('should send JSON-RPC errors correctly', () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const sendJsonRpcError = (server as any).sendJsonRpcError.bind(server);

      const res = {
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      sendJsonRpcError(res, 503, 'Service unavailable', { retryAfter: 1 });

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Service unavailable',
        jsonrpc: '2.0',
        id: null,
        retryAfter: 1,
      });
    });

    it('should not send error if headers already sent', () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const sendJsonRpcError = (server as any).sendJsonRpcError.bind(server);

      const res = {
        headersSent: true,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

      sendJsonRpcError(res, 503, 'Service unavailable');

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
