// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Express } from 'express';
import { MCPServer } from '../../MCPServer';
import { ConfigManager } from '../../Config';
import { EXTENSION_VERSION, CURRENT_MCP_PROTOCOL_VERSION } from '../../constants';
import { createMockToolRegistry, createMockInitializeRequest } from '../helpers/test-helpers';
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
    ((request: any) => Promise<any>) | undefined;
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

    it.each([
      { isTransportReady: true, transport: undefined },
      { isTransportReady: false, transport: {} },
    ])('should return 503 for partial readiness: %j', async ({ isTransportReady, transport }) => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());
      (server as any).isTransportReady = isTransportReady;
      (server as any).transport = transport;
      const app = (server as any).app as Express;
      const handler = getRouteHandler(app, '/health');
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await handler?.({ method: 'GET', headers: {}, url: '/health' }, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'initializing',
          transportReady: isTransportReady,
          transportInitialized: Boolean(transport),
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
          error: {
            code: -32603,
            message: 'Transport error',
          },
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

    it.each([
      { minifyResponses: true, pretty: false },
      { minifyResponses: false, pretty: true },
    ])('should honor minifyResponses=$minifyResponses', async ({ minifyResponses, pretty }) => {
      const configManager = new ConfigManager();
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'assisted',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        minifyResponses,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });
      const toolRegistry = createMockToolRegistry();
      toolRegistry.inspection.getDebugState = vi.fn().mockResolvedValue({ success: true });
      server = new MCPServer(3000, toolRegistry, configManager);
      const handler = getMcpHandler(server, 'tools/call');

      const result = await handler?.({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: TOOL_NAMES.getDebugState, arguments: {} },
      });

      expect(result.content[0].text.includes('\n')).toBe(pretty);
    });

    it('should mark returned tool failures as errors and preserve their codes', async () => {
      const toolRegistry = createMockToolRegistry();
      toolRegistry.breakpoints.removeBreakpoint = vi.fn().mockResolvedValue({
        success: false,
        error: 'No breakpoint found',
        code: 'BREAKPOINT_NOT_FOUND',
      });
      server = new MCPServer(3000, toolRegistry, new ConfigManager());

      const handler = getMcpHandler(server, 'tools/call');
      const result = await handler?.({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: TOOL_NAMES.removeBreakpoint,
          arguments: { filePath: '/test.js', line: 1 },
        },
      });

      expect(result.isError).toBe(true);
      expect(parseToolContent(result)).toEqual({
        success: false,
        error: 'No breakpoint found',
        code: 'BREAKPOINT_NOT_FOUND',
      });
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

    it('should expose resources and completions through registered handlers', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());
      const resourceProvider = (server as any).resourceProvider;
      resourceProvider.listResources = vi
        .fn()
        .mockResolvedValue([
          { uri: 'debugssy://debug-state', name: 'Debug state', mimeType: 'application/json' },
        ]);
      resourceProvider.readResource = vi.fn().mockResolvedValue({
        contents: [{ uri: 'debugssy://debug-state', mimeType: 'application/json', text: '{}' }],
      });
      const completionProvider = (server as any).completionProvider;
      completionProvider.getCompletions = vi.fn().mockResolvedValue({
        values: ['/workspace/src/index.ts'],
        total: 1,
        hasMore: false,
      });

      const listResources = getMcpHandler(server, 'resources/list');
      const readResource = getMcpHandler(server, 'resources/read');
      const complete = getMcpHandler(server, 'completion/complete');
      const resources = await listResources?.({ method: 'resources/list', params: {} });
      const contents = await readResource?.({
        method: 'resources/read',
        params: { uri: 'debugssy://debug-state' },
      });
      const completion = await complete?.({
        method: 'completion/complete',
        params: {
          ref: { type: 'ref/prompt', name: 'debug-crash' },
          argument: { name: 'filePath', value: 'src' },
        },
      });
      const unsupported = await complete?.({
        method: 'completion/complete',
        params: {
          ref: { type: 'ref/resource', uri: 'debugssy://debug-state' },
          argument: { name: 'filePath', value: 'src' },
        },
      });

      expect(resources.resources).toHaveLength(1);
      expect(contents.contents[0].text).toBe('{}');
      expect(completion.completion.values).toEqual(['/workspace/src/index.ts']);
      expect(completionProvider.getCompletions).toHaveBeenCalledWith(
        'debug-crash',
        'filePath',
        'src'
      );
      expect(unsupported.completion).toEqual({ values: [], total: 0, hasMore: false });
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

      const req = createMockInitializeRequest() as any;
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

      const req = createMockInitializeRequest() as any;
      const res = { headersSent: false, status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

      await (server as any).handleInitRequest(req, res, mockTransport);

      expect(server.getMetrics().initAttempts).toBe(1);
    });

    it('should track successful inits', async () => {
      server = new MCPServer(3000, createMockToolRegistry(), new ConfigManager());

      (server as any).isTransportReady = true;
      (server as any).hasSuccessfulInit = false;
      (server as any).isInitLockHeld = false;

      const mockTransport = {
        sessionId: undefined as string | undefined,
        close: vi.fn().mockResolvedValue(undefined),
        handleRequest: vi.fn(async () => {
          mockTransport.sessionId = 'initialized-session';
        }),
      };
      (server as any).transport = mockTransport;

      const req = createMockInitializeRequest() as any;
      const res = {
        statusCode: 200,
        headersSent: false,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;

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
        error: {
          code: -32000,
          message: 'Service unavailable',
          data: { retryAfter: 1 },
        },
        jsonrpc: '2.0',
        id: null,
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
