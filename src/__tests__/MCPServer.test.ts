// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { MCPServer } from '../MCPServer';
import { ConfigManager } from '../Config';
import { EXTENSION_VERSION, CURRENT_MCP_PROTOCOL_VERSION } from '../constants';
import { createMockToolRegistry } from './helpers/test-helpers';
import './setup';

const getRouteHandler = (app: Express, path: string) => {
  const stack = (app as any)._router?.stack ?? (app as any).router?.stack ?? [];
  const layer = stack.find((entry: any) => entry.route?.path === path);
  return layer?.route?.stack?.[0]?.handle as ((req: any, res: any) => Promise<void>) | undefined;
};

describe('MCPServer', () => {
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

  it('returns 503 when transport is not ready', async () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    const app = (server as any).app as Express;
    const handler = getRouteHandler(app, '/mcp');

    expect(handler).toBeDefined();

    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await handler?.({ method: 'POST', headers: {}, url: '/mcp' }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('transport initializing'),
      })
    );
  });

  it('returns health status based on readiness', async () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    const app = (server as any).app as Express;
    const handler = getRouteHandler(app, '/health');

    expect(handler).toBeDefined();

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

  it('initializes metrics to zero', () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    const metrics = server.getMetrics();
    expect(metrics).toEqual({
      initAttempts: 0,
      initSuccesses: 0,
      initRejections503: 0,
      concurrentInitRejections: 0,
      alreadyInitializedErrors: 0,
      sessionReplacements: 0,
    });
  });

  it('returns current automation level', () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    const level = server.getCurrentAutomationLevel();
    expect(level).toBe('assisted'); // default
  });

  it('disposes without errors', () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    expect(() => server.dispose()).not.toThrow();
  });

  it('disposes timers properly', async () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    // Access private methods for testing
    const scheduleTimer = (server as any).scheduleTimer.bind(server);
    const timer = scheduleTimer(() => {}, 1000);

    expect((server as any).pendingTimers.has(timer)).toBe(true);

    server.dispose();

    expect((server as any).pendingTimers.size).toBe(0);
  });

  it('tracks metrics for 503 rejections', async () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    const app = (server as any).app as Express;
    const handler = getRouteHandler(app, '/mcp');

    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    // Trigger multiple 503 responses
    await handler?.({ method: 'POST', headers: {}, url: '/mcp' }, res);
    await handler?.({ method: 'POST', headers: {}, url: '/mcp' }, res);
    await handler?.({ method: 'POST', headers: {}, url: '/mcp' }, res);

    const metrics = server.getMetrics();
    expect(metrics.initRejections503).toBeGreaterThan(0);
  });

  it('health endpoint includes version and protocol info', async () => {
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

  it('handles stop gracefully', async () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    await expect(server.stop()).resolves.not.toThrow();
  });

  it('clears metrics on fresh start', async () => {
    const configManager = new ConfigManager();
    const toolRegistry = createMockToolRegistry();

    const server1 = new MCPServer(3000, toolRegistry, configManager);

    // Simulate some activity
    const app = (server1 as any).app as Express;
    const handler = getRouteHandler(app, '/mcp');
    const res = {
      headersSent: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    await handler?.({ method: 'POST', headers: {}, url: '/mcp' }, res);

    await server1.stop();
    server1.dispose();

    const server2 = new MCPServer(3001, toolRegistry, configManager);
    const metrics2 = server2.getMetrics();

    expect(metrics2.initAttempts).toBe(0);
    expect(metrics2.initRejections503).toBe(0);

    await server2.stop();
    server2.dispose();
  });

  it('handles updatePort correctly', async () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    await expect(server.updatePort(3002)).resolves.not.toThrow();
  });

  it('recreates transport and increments session replacement metrics', async () => {
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    // Simulate a previous successful init
    (server as any).hasSuccessfulInit = true;
    (server as any).isTransportReady = true;

    // Create a mock transport
    const mockTransport = {
      close: vi.fn().mockResolvedValue(undefined),
      handleRequest: vi.fn().mockResolvedValue(undefined),
    };
    (server as any).transport = mockTransport;

    // Avoid real timers for lock release
    (server as any).scheduleTimer = (callback: () => void) => {
      callback();
      return 0;
    };

    // Spy on transport recreation
    const recreateTransport = vi.fn().mockResolvedValue(undefined);
    (server as any).recreateTransport = recreateTransport;

    const req = { method: 'POST', headers: {}, url: '/mcp' } as any;
    const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    await (server as any).handleSerializedInitRequest(req, res, mockTransport, 'test');

    const metrics = server.getMetrics();
    expect(metrics.sessionReplacements).toBe(1);
    expect(recreateTransport).toHaveBeenCalled();
    expect(mockTransport.handleRequest).toHaveBeenCalled();
    expect((server as any).hasSuccessfulInit).toBe(true);
  });

  it('clears inflightRequests after stop timeout', async () => {
    vi.useFakeTimers();
    server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

    try {
      // Add a stale promise to inflightRequests
      const neverResolves = new Promise<void>(() => {});
      (server as any).inflightRequests.add(neverResolves);

      expect((server as any).inflightRequests.size).toBe(1);

      // Stop should clear the set after timeout
      const stopPromise = server.stop();
      await vi.advanceTimersByTimeAsync(5000);
      await stopPromise;

      expect((server as any).inflightRequests.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
