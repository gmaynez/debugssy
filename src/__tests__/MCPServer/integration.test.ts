// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { MCPServer } from '../../MCPServer';
import { ConfigManager } from '../../Config';
import { EXTENSION_VERSION, CURRENT_MCP_PROTOCOL_VERSION } from '../../constants';
import { createMockToolRegistry } from '../helpers/test-helpers';
import { TOOL_NAMES } from '../../routing/toolNames';
import {
  RESOURCE_RESPONSE_EXAMPLES,
  TOOL_RESPONSE_EXAMPLES,
  formatJsonExample,
} from '../../routing/toolResponseExamples';
import '../setup';

const getRouteHandler = (app: Express, path: string) => {
  const stack = (app as any)._router?.stack ?? (app as any).router?.stack ?? [];
  const layer = stack.find((entry: any) => entry.route?.path === path);
  return layer?.route?.stack?.[0]?.handle as ((req: any, res: any) => Promise<void>) | undefined;
};

const getMcpHandler = (server: MCPServer, method: string) => {
  return ((server as any).mcpServer as any)._requestHandlers.get(method) as
    | ((request: any) => Promise<any>)
    | undefined;
};

const parseToolContent = (response: any) => JSON.parse(response.content[0].text);

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

  describe('Registered MCP Handlers', () => {
    it('should expose assisted-mode tool discovery through tools/list', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      const handler = getMcpHandler(server, 'tools/list');
      const result = await handler?.({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const toolNames = result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain(TOOL_NAMES.getDebugState);
      expect(toolNames).not.toContain(TOOL_NAMES.startDebugging);
      expect(toolNames).not.toContain(TOOL_NAMES.stopDebugging);
    });

    it('should expose full-mode tools through tools/list', async () => {
      const configManager = new ConfigManager();
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: true,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      server = new MCPServer(3000, createMockToolRegistry(), configManager);

      const handler = getMcpHandler(server, 'tools/list');
      const result = await handler?.({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      const toolNames = result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain(TOOL_NAMES.startDebugging);
      expect(toolNames).toContain(TOOL_NAMES.stopDebugging);
      expect(toolNames).toContain(TOOL_NAMES.stepOver);
    });

    it('should serialize successful tool results through tools/call', async () => {
      const toolRegistry = createMockToolRegistry();
      toolRegistry.inspection.getDebugState = vi
        .fn()
        .mockResolvedValue(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);

      server = new MCPServer(3000, toolRegistry, new ConfigManager());

      const handler = getMcpHandler(server, 'tools/call');
      const result = await handler?.({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: TOOL_NAMES.getDebugState,
          arguments: {},
        },
      });

      expect(result.isError).toBeUndefined();
      expect(parseToolContent(result)).toEqual(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);
      expect(toolRegistry.inspection.getDebugState).toHaveBeenCalledTimes(1);
    });

    it('should serialize automation-level errors through tools/call without executing the tool', async () => {
      const toolRegistry = createMockToolRegistry();
      toolRegistry.debugControl.stopDebugging = vi.fn();

      server = new MCPServer(3000, toolRegistry, new ConfigManager());

      const handler = getMcpHandler(server, 'tools/call');
      const result = await handler?.({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: TOOL_NAMES.stopDebugging,
          arguments: {},
        },
      });

      const payload = parseToolContent(result);
      expect(result.isError).toBe(true);
      expect(payload.success).toBe(false);
      expect(payload.code).toBe('AUTOMATION_LEVEL_RESTRICTED');
      expect(payload.error).toContain("requires 'full' automation level");
      expect(toolRegistry.debugControl.stopDebugging).not.toHaveBeenCalled();
    });

    it('should expose prompt discovery and prompt content through registered handlers', async () => {
      const configManager = new ConfigManager();
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: true,
        minifyResponses: true,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate' as const,
      });

      server = new MCPServer(3000, createMockToolRegistry(), configManager);

      const listHandler = getMcpHandler(server, 'prompts/list');
      const getHandler = getMcpHandler(server, 'prompts/get');

      const listed = await listHandler?.({
        jsonrpc: '2.0',
        id: 1,
        method: 'prompts/list',
        params: {},
      });
      const generated = await getHandler?.({
        jsonrpc: '2.0',
        id: 2,
        method: 'prompts/get',
        params: {
          name: 'auto-debug-session',
          arguments: {
            issue: 'Application crashes on startup',
          },
        },
      });

      const promptNames = listed.prompts.map((prompt: any) => prompt.name);
      const promptText = generated.messages[0].content.text;

      expect(promptNames).toContain('auto-debug-session');
      expect(promptText).toContain(formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused));
      expect(promptText).toContain(formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.listResources));
      expect(promptText).toContain(formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.readLaunchJson));
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
