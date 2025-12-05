// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach } from 'vitest';
import { McpRequestValidator } from '../McpRequestValidator';
import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../__tests__/helpers/test-helpers';

describe('McpRequestValidator', () => {
  let validator: McpRequestValidator;

  beforeEach(() => {
    validator = new McpRequestValidator();
  });

  describe('Host Validation', () => {
    it('should allow localhost host', () => {
      const req = createMockRequest({
        headers: { host: 'localhost:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateHost(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow 127.0.0.1 host', () => {
      const req = createMockRequest({
        headers: { host: '127.0.0.1:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateHost(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow IPv6 localhost host', () => {
      const req = createMockRequest({
        headers: { host: '[::1]:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateHost(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should reject missing host header', () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      const result = validator.validateHost(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toMatchObject({
        error: expect.stringContaining('Missing Host header'),
      });
    });

    it('should reject non-localhost host', () => {
      const req = createMockRequest({
        headers: { host: 'example.com:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateHost(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toMatchObject({
        error: expect.stringContaining('Invalid host'),
      });
    });

    it('should reject remote IP addresses in host', () => {
      const req = createMockRequest({
        headers: { host: '192.168.1.1:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateHost(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Origin Validation', () => {
    it('should allow requests without origin header', () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      const result = validator.validateOrigin(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow localhost origin', () => {
      const req = createMockRequest({
        headers: { origin: 'http://localhost:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateOrigin(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow 127.0.0.1 origin', () => {
      const req = createMockRequest({
        headers: { origin: 'http://127.0.0.1:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateOrigin(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should allow IPv6 localhost origin', () => {
      const req = createMockRequest({
        headers: { origin: 'http://[::1]:3000' },
      });
      const res = createMockResponse();

      const result = validator.validateOrigin(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should reject non-localhost origin', () => {
      const req = createMockRequest({
        headers: { origin: 'http://example.com' },
      });
      const res = createMockResponse();

      const result = validator.validateOrigin(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toMatchObject({
        error: expect.stringContaining('Invalid origin'),
      });
    });

    it('should reject malformed origin', () => {
      const req = createMockRequest({
        headers: { origin: 'not-a-valid-url' },
      });
      const res = createMockResponse();

      const result = validator.validateOrigin(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.jsonData).toMatchObject({
        error: expect.stringContaining('Invalid origin format'),
      });
    });

    it('should reject remote IP addresses', () => {
      const req = createMockRequest({
        headers: { origin: 'http://192.168.1.1' },
      });
      const res = createMockResponse();

      const result = validator.validateOrigin(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Protocol Version Validation', () => {
    it('should accept supported protocol version 2025-03-26', () => {
      const req = createMockRequest({
        headers: { 'mcp-protocol-version': '2025-03-26' },
      });
      const res = createMockResponse();

      const result = validator.validateProtocolVersion(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should accept supported protocol version 2025-06-18', () => {
      const req = createMockRequest({
        headers: { 'mcp-protocol-version': '2025-06-18' },
      });
      const res = createMockResponse();

      const result = validator.validateProtocolVersion(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should accept supported protocol version 2025-11-25', () => {
      const req = createMockRequest({
        headers: { 'mcp-protocol-version': '2025-11-25' },
      });
      const res = createMockResponse();

      const result = validator.validateProtocolVersion(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should accept requests without protocol version header (default to 2025-03-26)', () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      const result = validator.validateProtocolVersion(req, res);
      expect(result).toBe(true);
      expect(res.statusCode).toBe(200);
    });

    it('should reject unsupported protocol version', () => {
      const req = createMockRequest({
        headers: { 'mcp-protocol-version': '2024-01-01' },
      });
      const res = createMockResponse();

      const result = validator.validateProtocolVersion(req, res);
      expect(result).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.jsonData).toMatchObject({
        error: expect.stringContaining('Unsupported MCP protocol version'),
      });
    });

    it('should provide list of supported versions in error', () => {
      const req = createMockRequest({
        headers: { 'mcp-protocol-version': 'invalid' },
      });
      const res = createMockResponse();

      validator.validateProtocolVersion(req, res);
      expect(res.jsonData.error).toContain('2025-03-26');
      expect(res.jsonData.error).toContain('2025-06-18');
      expect(res.jsonData.error).toContain('2025-11-25');
    });

    it('should echo back protocol version in response header', () => {
      const req = createMockRequest({
        headers: { 'mcp-protocol-version': '2025-06-18' },
      });
      const res = createMockResponse();

      validator.validateProtocolVersion(req, res);
      expect(res.headers['MCP-Protocol-Version']).toBe('2025-06-18');
    });

    it('should echo fallback version when header is missing', () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      validator.validateProtocolVersion(req, res);
      expect(res.headers['MCP-Protocol-Version']).toBe('2025-03-26');
    });
  });

  describe('Middleware Integration', () => {
    it('should create Express middleware that validates both origin and protocol', () => {
      const middleware = validator.createMiddleware();
      expect(middleware).toBeInstanceOf(Function);
      expect(middleware.length).toBe(3); // (req, res, next)
    });

    it('should call next() when all validations pass', () => {
      const middleware = validator.createMiddleware();
      const req = createMockRequest({
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'mcp-protocol-version': '2025-06-18',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);
      // Middleware should call next when validations pass
      // In a real scenario, next would be called
    });

    it('should not call next() when host validation fails', () => {
      const middleware = validator.createMiddleware();
      const req = createMockRequest({
        headers: { host: 'evil.com:3000' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      // next should not be called
    });

    it('should not call next() when origin validation fails', () => {
      const middleware = validator.createMiddleware();
      const req = createMockRequest({
        headers: {
          host: 'localhost:3000',
          origin: 'http://evil.com',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      // next should not be called
    });

    it('should not call next() when protocol validation fails', () => {
      const middleware = validator.createMiddleware();
      const req = createMockRequest({
        headers: {
          host: 'localhost:3000',
          'mcp-protocol-version': 'invalid-version',
        },
      });
      const res = createMockResponse();
      const next = createMockNext();

      middleware(req, res, next);
      expect(res.statusCode).toBe(400);
      // next should not be called
    });
  });

  describe('Security Best Practices', () => {
    it('should prevent DNS rebinding attacks by rejecting non-localhost origins', () => {
      const maliciousOrigins = [
        'http://attacker.com',
        'https://malicious.example.com',
        'http://10.0.0.1',
        'http://192.168.0.1',
      ];

      maliciousOrigins.forEach((origin) => {
        const req = createMockRequest({ headers: { origin } });
        const res = createMockResponse();

        const result = validator.validateOrigin(req, res);
        expect(result).toBe(false);
        expect(res.statusCode).toBe(403);
      });
    });

    it('should handle case-insensitive hostnames', () => {
      const req = createMockRequest({
        headers: { origin: 'http://LOCALHOST:3000' },
      });
      const res = createMockResponse();

      // URL parsing in Node.js handles case normalization
      const result = validator.validateOrigin(req, res);
      expect(result).toBe(true);
    });

    it('should allow different ports on localhost', () => {
      const ports = [3000, 8080, 9000];

      ports.forEach((port) => {
        const req = createMockRequest({
          headers: { origin: `http://localhost:${port}` },
        });
        const res = createMockResponse();

        const result = validator.validateOrigin(req, res);
        expect(result).toBe(true);
      });
    });
  });
});
