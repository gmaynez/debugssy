// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPServer } from '../../MCPServer';
import { ConfigManager } from '../../Config';
import { createMockToolRegistry } from '../helpers/test-helpers';
import '../setup';

describe('MCPServer - Lifecycle', () => {
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

  describe('Timer Management', () => {
    it('should schedule and track timers', () => {
      vi.useFakeTimers();
      try {
        server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

        const scheduleTimer = (server as any).scheduleTimer.bind(server);
        const callback = vi.fn();

        const timer = scheduleTimer(callback, 100);

        expect((server as any).pendingTimers.has(timer)).toBe(true);

        vi.advanceTimersByTime(100);
        expect(callback).toHaveBeenCalled();
        expect((server as any).pendingTimers.has(timer)).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not execute callbacks after disposal', () => {
      vi.useFakeTimers();
      try {
        server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

        const scheduleTimer = (server as any).scheduleTimer.bind(server);
        const callback = vi.fn();

        scheduleTimer(callback, 100);

        server.dispose();

        vi.advanceTimersByTime(100);
        expect(callback).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should clear all timers on dispose', () => {
      vi.useFakeTimers();
      try {
        server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

        const scheduleTimer = (server as any).scheduleTimer.bind(server);

        scheduleTimer(() => {}, 100);
        scheduleTimer(() => {}, 200);
        scheduleTimer(() => {}, 300);

        expect((server as any).pendingTimers.size).toBe(3);

        server.dispose();

        expect((server as any).pendingTimers.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Inflight Request Tracking', () => {
    it('should track and cleanup inflight requests', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const trackRequest = (server as any).trackRequest.bind(server);

      const promise1 = Promise.resolve();
      const promise2 = Promise.resolve();

      trackRequest(promise1);
      trackRequest(promise2);

      expect((server as any).inflightRequests.size).toBe(2);

      await Promise.all([promise1, promise2]);

      expect((server as any).inflightRequests.size).toBe(0);
    });

    it('should clear inflight requests on stop with timeout', async () => {
      vi.useFakeTimers();
      try {
        server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

        const neverResolves = new Promise<void>(() => {});
        (server as any).inflightRequests.add(neverResolves);

        expect((server as any).inflightRequests.size).toBe(1);

        const stopPromise = server.stop();
        await vi.advanceTimersByTimeAsync(5000);
        await stopPromise;

        expect((server as any).inflightRequests.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Port Management', () => {
    it('should update port and restart server', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const stopSpy = vi.spyOn(server, 'stop');
      const startSpy = vi.spyOn(server, 'start');

      await server.updatePort(3999);

      expect(stopSpy).toHaveBeenCalled();
      expect(startSpy).toHaveBeenCalledWith({ silent: true });
      expect((server as any).port).toBe(3999);
    });

    it('should recreate MCP server on port update', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const initializeMCPServer = vi.fn();
      (server as any).initializeMCPServer = initializeMCPServer;

      await server.updatePort(3998);

      expect(initializeMCPServer).toHaveBeenCalled();
      expect((server as any).port).toBe(3998);
    });
  });

  describe('State Management', () => {
    it('should reset state on stop', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;
      (server as any).hasSuccessfulInit = true;

      await server.stop();

      expect((server as any).isTransportReady).toBe(false);
      expect((server as any).hasSuccessfulInit).toBe(false);
    });

    it('should initialize new server with zeroed metrics', async () => {
      // This test verifies that new MCPServer instances start with fresh metrics
      // This is a constructor behavior test, not a state reset test
      const configManager = new ConfigManager();
      const toolRegistry = createMockToolRegistry();

      const server1 = new MCPServer(3000, toolRegistry, configManager);

      // Simulate some activity on first server
      (server1 as any).metrics = {
        initAttempts: 5,
        initSuccesses: 3,
        initRejections503: 2,
        concurrentInitRejections: 1,
        alreadyInitializedErrors: 0,
        sessionReplacements: 1,
      };

      await server1.stop();
      server1.dispose();

      // Create new server instance - should have fresh metrics
      const server2 = new MCPServer(3001, toolRegistry, configManager);
      const metrics2 = server2.getMetrics();

      expect(metrics2.initAttempts).toBe(0);
      expect(metrics2.initRejections503).toBe(0);

      await server2.stop();
      server2.dispose();
    });
  });

  describe('Lock Management', () => {
    it('should acquire and release init lock', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const acquireInitLock = (server as any).acquireInitLock.bind(server);

      expect((server as any).isInitLockHeld).toBe(false);

      const release = await acquireInitLock();

      expect((server as any).isInitLockHeld).toBe(true);

      release();

      expect((server as any).isInitLockHeld).toBe(false);
    });

    it('should serialize lock acquisitions', async () => {
      vi.useFakeTimers();
      try {
        server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

        const acquireInitLock = (server as any).acquireInitLock.bind(server);
        const acquisitions: number[] = [];

        const promise1 = acquireInitLock().then((release: () => void) => {
          acquisitions.push(1);
          setTimeout(release, 50);
        });

        const promise2 = acquireInitLock().then((release: () => void) => {
          acquisitions.push(2);
          release();
        });

        await vi.advanceTimersByTimeAsync(100);
        await Promise.all([promise1, promise2]);

        expect(acquisitions).toEqual([1, 2]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
