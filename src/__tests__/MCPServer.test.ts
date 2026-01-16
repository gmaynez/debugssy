// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Express } from 'express';
import { MCPServer } from '../MCPServer';
import type { ToolRegistry } from '../tools';
import { ConfigManager } from '../Config';
import './setup';

const createMockToolRegistry = (): ToolRegistry => ({
  debugControl: {
    startDebugging: vi.fn(),
    stopDebugging: vi.fn(),
    continueExecution: vi.fn(),
    pause: vi.fn(),
    restart: vi.fn(),
    stepOver: vi.fn(),
    stepInto: vi.fn(),
    stepOut: vi.fn(),
  } as any,
  breakpoints: {
    setBreakpoint: vi.fn(),
    removeBreakpoint: vi.fn(),
    listBreakpoints: vi.fn(),
    toggleBreakpoint: vi.fn(),
    removeAllBreakpoints: vi.fn(),
  } as any,
  inspection: {
    getVariables: vi.fn(),
    getCallStack: vi.fn(),
    evaluateExpression: vi.fn(),
    getThreads: vi.fn(),
    getDebugState: vi.fn(),
    getConsoleOutput: vi.fn(),
    clearConsoleOutput: vi.fn(),
    waitForBreakpoint: vi.fn(),
  } as any,
  dispose: vi.fn(),
});

const getRouteHandler = (app: Express, path: string) => {
  const stack = (app as any)._router?.stack ?? (app as any).router?.stack ?? [];
  const layer = stack.find((entry: any) => entry.route?.path === path);
  return layer?.route?.stack?.[0]?.handle as ((req: any, res: any) => Promise<void>) | undefined;
};

describe('MCPServer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 503 when transport is not ready', async () => {
    const server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

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
    const server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

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
});
