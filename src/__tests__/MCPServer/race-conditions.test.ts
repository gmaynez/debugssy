// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPServer } from '../../MCPServer';
import { ConfigManager } from '../../Config';
import { createMockToolRegistry, createMockInitializeRequest } from '../helpers/test-helpers';
import '../setup';

describe('MCPServer - Race Conditions', () => {
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

  describe('Concurrent Initialization Requests', () => {
    it('should serialize concurrent init requests with mutex', async () => {
      vi.useFakeTimers();
      try {
        server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

        // Simulate transport ready
        (server as any).isTransportReady = true;
        (server as any).hasSuccessfulInit = false;

        // Create a delayed transport to ensure lock is held
        let resolveFirstRequest: () => void;
        const firstRequestPromise = new Promise<void>((resolve) => {
          resolveFirstRequest = resolve;
        });

        const mockTransport = {
          close: vi.fn().mockResolvedValue(undefined),
          handleRequest: vi.fn().mockImplementation(() => firstRequestPromise),
        };
        (server as any).transport = mockTransport;

        const req1 = createMockInitializeRequest() as any;
        const req2 = createMockInitializeRequest() as any;
        const res1 = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
        const res2 = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

        // Fire first request - it will hold the lock
        const promise1 = (server as any).handleSerializedInitRequest(
          req1,
          res1,
          mockTransport,
          'req1'
        );

        // Advance timers to allow lock acquisition
        await vi.advanceTimersByTimeAsync(0);

        // Fire second request while lock is held
        const promise2 = (server as any).handleSerializedInitRequest(
          req2,
          res2,
          mockTransport,
          'req2'
        );

        // Now resolve the first request
        resolveFirstRequest!();

        await Promise.all([promise1, promise2]);

        // Second request should be rejected due to lock
        expect(res2.status).toHaveBeenCalledWith(503);
        const metrics = server.getMetrics();
        expect(metrics.concurrentInitRejections).toBeGreaterThanOrEqual(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reject init when lock is already held', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;
      (server as any).hasSuccessfulInit = false;
      (server as any).isInitLockHeld = true;

      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };

      const req = createMockInitializeRequest() as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleSerializedInitRequest(req, res, mockTransport, 'test');

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: -32000,
            message: expect.stringContaining('Server busy'),
          }),
        })
      );
      const metrics = server.getMetrics();
      expect(metrics.concurrentInitRejections).toBe(1);
    });
  });

  describe('Session Replacement', () => {
    it('should reserve the lock before replacing a live transport', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());
      const internal = server as any;
      internal.hasSuccessfulInit = true;
      internal.isTransportReady = true;
      const oldTransport = { close: vi.fn(async () => {}), handleRequest: vi.fn() };
      const nextTransport = {
        sessionId: undefined as string | undefined,
        close: vi.fn(async () => {}),
        handleRequest: vi.fn(async () => {
          nextTransport.sessionId = 'next-session';
        }),
      };
      internal.transport = oldTransport;
      let finishReplacement: () => void = () => {};
      const replacing = new Promise<void>((resolve) => {
        finishReplacement = resolve;
      });
      const recreate = vi.spyOn(internal, 'recreateTransport').mockImplementation(async () => {
        await oldTransport.close();
        await replacing;
        internal.transport = nextTransport;
      });
      const req1 = createMockInitializeRequest();
      const req2 = createMockInitializeRequest();
      const res1 = {
        statusCode: 200,
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const res2 = {
        statusCode: 200,
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      const first = internal.handleMcpRequest(req1, res1);
      await vi.waitFor(() => expect(recreate).toHaveBeenCalledOnce());
      await internal.handleMcpRequest(req2, res2);
      expect(res2.status).toHaveBeenCalledWith(503);
      expect(recreate).toHaveBeenCalledOnce();
      finishReplacement();
      await first;
      expect(server.getMetrics().sessionReplacements).toBe(1);
      expect(server.getMetrics().initSuccesses).toBe(1);
      expect(nextTransport.handleRequest).toHaveBeenCalledExactlyOnceWith(req1, res1, req1.body);
    });

    it('should not count a resolved SDK error as successful initialization', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());
      const transport = {
        sessionId: undefined as string | undefined,
        close: vi.fn(async () => {}),
        handleRequest: vi.fn(async (_req, res) => {
          transport.sessionId = 'rejected-session';
          res.statusCode = 400;
        }),
      };
      (server as any).transport = transport;
      (server as any).isTransportReady = true;
      const res = {
        statusCode: 200,
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      await (server as any).handleMcpRequest(createMockInitializeRequest(), res);
      expect(server.getMetrics().initSuccesses).toBe(0);
      expect((server as any).hasSuccessfulInit).toBe(false);
    });

    it('should not count initialization if its session closes before handling completes', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());
      const transport = {
        sessionId: undefined as string | undefined,
        close: vi.fn(async () => {}),
        handleRequest: vi.fn(async () => {
          transport.sessionId = 'closed-session';
          (server as any).resetSessionState();
        }),
      };
      (server as any).transport = transport;
      (server as any).isTransportReady = true;
      const res = {
        statusCode: 200,
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };
      await (server as any).handleMcpRequest(createMockInitializeRequest(), res);
      expect(server.getMetrics().initSuccesses).toBe(0);
      expect((server as any).hasSuccessfulInit).toBe(false);
      expect((server as any).isInitLockHeld).toBe(false);
    });

    it('should replace existing session when new init arrives', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).hasSuccessfulInit = true;
      (server as any).isTransportReady = true;

      const oldTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockResolvedValue(undefined),
      };
      (server as any).transport = oldTransport;

      const recreateTransport = vi.fn().mockResolvedValue(undefined);
      (server as any).recreateTransport = recreateTransport;

      const req = createMockInitializeRequest() as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleSerializedInitRequest(req, res, oldTransport, 'test');

      expect(recreateTransport).toHaveBeenCalled();
      expect(server.getMetrics().sessionReplacements).toBe(1);
    });

    it('should reset session state without unlocking a pending initialization', () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).hasSuccessfulInit = true;
      (server as any).isInitLockHeld = true;
      const mockRelease = vi.fn();
      (server as any).initLockRelease = mockRelease;

      (server as any).resetSessionState();

      expect((server as any).hasSuccessfulInit).toBe(false);
      expect((server as any).isInitLockHeld).toBe(true);
      expect(mockRelease).not.toHaveBeenCalled();
      expect((server as any).initLockRelease).toBe(mockRelease);
    });
  });

  describe('Sessionless non-POST requests', () => {
    it.each(['GET', 'DELETE', 'PUT'])(
      'should let the SDK reject %s without replacing a session',
      async (method) => {
        server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

        (server as any).isTransportReady = true;

        const mockTransport = {
          close: vi.fn().mockResolvedValue(undefined),
          handleRequest: vi.fn().mockResolvedValue(undefined),
        };
        (server as any).transport = mockTransport;

        const req = {
          method,
          headers: { accept: 'text/event-stream' },
        } as any;
        const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

        (server as any).hasSuccessfulInit = true;
        const replace = vi.spyOn(server as any, 'recreateTransport');
        await (server as any).handleMcpRequest(req, res);

        expect(mockTransport.handleRequest).toHaveBeenCalled();
        expect((server as any).isInitLockHeld).toBe(false);
        expect(replace).not.toHaveBeenCalled();
        expect(mockTransport.close).not.toHaveBeenCalled();
      }
    );
  });

  describe('Error Handling', () => {
    it('should handle "Server already initialized" error with 503', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;
      (server as any).hasSuccessfulInit = false;
      (server as any).isInitLockHeld = false;

      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockRejectedValue(new Error('Server already initialized')),
      };
      (server as any).transport = mockTransport;

      const req = createMockInitializeRequest() as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleSerializedInitRequest(req, res, mockTransport, 'test');

      expect(res.status).toHaveBeenCalledWith(503);
      expect(server.getMetrics().alreadyInitializedErrors).toBe(1);
    });

    it('should propagate other errors', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;

      const mockTransport = {
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn().mockRejectedValue(new Error('Some other error')),
      };
      (server as any).transport = mockTransport;

      const req = createMockInitializeRequest() as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await expect(
        (server as any).handleSerializedInitRequest(req, res, mockTransport, 'test')
      ).rejects.toThrow('Some other error');
    });
  });
});
