// SPDX-License-Identifier: Apache-2.0

import { Request, Response, NextFunction } from 'express';
import { FALLBACK_MCP_PROTOCOL_VERSION, SUPPORTED_MCP_PROTOCOL_VERSIONS } from '../constants';
import { Logger } from '../utils/Logger';

/**
 * Handles security validation for MCP server requests.
 * Implements MCP Security Best Practices (2025-11-25) including:
 * - Host header validation to prevent DNS rebinding attacks
 * - Origin header validation to prevent DNS rebinding attacks
 * - Protocol version validation
 * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices
 */
export class McpRequestValidator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Validates Host header to mitigate DNS rebinding per MCP security guidance.
   * Only allows localhost hosts (with optional port).
   */
  validateHost(req: Request, res: Response): boolean {
    const hostHeader = req.headers.host;

    if (!hostHeader) {
      this.logger.warn('Rejected request with missing Host header');
      res.status(400).json({
        error: 'Bad Request: Missing Host header.',
      });
      return false;
    }

    // Handle IPv6 addresses in brackets (e.g., [::1]:3000) and regular hosts (e.g., localhost:3000)
    let host: string;
    if (hostHeader.startsWith('[')) {
      // IPv6 address - extract everything up to and including the closing bracket
      const bracketEnd = hostHeader.indexOf(']');
      host = bracketEnd !== -1 ? hostHeader.substring(0, bracketEnd + 1) : hostHeader;
    } else {
      // Regular host - split on first colon to remove port
      const parts = hostHeader.split(':');
      host = parts[0] ?? hostHeader;
    }

    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

    if (!isLocalhost) {
      this.logger.warn(`Rejected request with non-localhost Host: ${hostHeader}`);
      res.status(403).json({
        error: 'Forbidden: Invalid host. Only localhost hosts are allowed.',
      });
      return false;
    }

    return true;
  }

  /**
   * Validates Origin header to prevent DNS rebinding attacks.
   * Only allows localhost origins or requests with no origin header.
   */
  validateOrigin(req: Request, res: Response): boolean {
    const origin = req.headers.origin;

    // Allow requests with no origin (e.g., from non-browser clients like Claude Desktop)
    // or from localhost origins only
    if (origin) {
      try {
        const url = new URL(origin);
        const isLocalhost =
          url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

        if (!isLocalhost) {
          this.logger.warn(`Rejected request from non-localhost origin: ${origin}`);
          res.status(403).json({
            error: 'Forbidden: Invalid origin. Only localhost origins are allowed.',
          });
          return false;
        }
      } catch (_e) {
        this.logger.warn(`Rejected request with invalid origin: ${origin}`);
        res.status(403).json({
          error: 'Forbidden: Invalid origin format.',
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Validates MCP Protocol Version header.
   * Per MCP spec 2025-11-25: Clients MUST include MCP-Protocol-Version header.
   * For backwards compatibility, we accept a missing header but log and assume fallback.
   */
  validateProtocolVersion(req: Request, res: Response): boolean {
    const protocolVersion = req.headers['mcp-protocol-version'] as string;
    const effectiveVersion = protocolVersion || FALLBACK_MCP_PROTOCOL_VERSION;

    if (protocolVersion && !SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(protocolVersion as any)) {
      this.logger.warn(`Rejected request with unsupported protocol version: ${protocolVersion}`);
      res.status(400).json({
        error: `Bad Request: Unsupported MCP protocol version '${protocolVersion}'. Supported versions: ${SUPPORTED_MCP_PROTOCOL_VERSIONS.join(', ')}`,
      });
      return false;
    }

    if (!protocolVersion) {
      this.logger.debug(
        `Protocol version header missing; assuming fallback ${FALLBACK_MCP_PROTOCOL_VERSION}`
      );
    }

    // Echo back the version we will operate with to aid clients
    res.setHeader('MCP-Protocol-Version', effectiveVersion);

    return true;
  }

  /**
   * Express middleware that validates all security requirements.
   */
  createMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.validateHost(req, res)) {
        return;
      }

      if (!this.validateOrigin(req, res)) {
        return;
      }

      if (!this.validateProtocolVersion(req, res)) {
        return;
      }

      next();
    };
  }
}
