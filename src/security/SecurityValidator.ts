// SPDX-License-Identifier: Apache-2.0

import { Request, Response, NextFunction } from "express";
import { SUPPORTED_MCP_PROTOCOL_VERSIONS } from "../constants";
import { Logger } from "../utils/Logger";

/**
 * Handles security validation for MCP server requests.
 * Implements MCP specification security requirements including:
 * - Origin header validation to prevent DNS rebinding attacks
 * - Protocol version validation
 */
export class SecurityValidator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
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
          url.hostname === "localhost" ||
          url.hostname === "127.0.0.1" ||
          url.hostname === "[::1]";

        if (!isLocalhost) {
          this.logger.warn(
            `Rejected request from non-localhost origin: ${origin}`,
          );
          res.status(403).json({
            error:
              "Forbidden: Invalid origin. Only localhost origins are allowed.",
          });
          return false;
        }
      } catch (_e) {
        this.logger.warn(`Rejected request with invalid origin: ${origin}`);
        res.status(403).json({
          error: "Forbidden: Invalid origin format.",
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Validates MCP Protocol Version header.
   * Per MCP spec 2025-06-18: Clients MUST include MCP-Protocol-Version header.
   * For backwards compatibility, assumes 2025-03-26 if not present.
   */
  validateProtocolVersion(req: Request, res: Response): boolean {
    const protocolVersion = req.headers["mcp-protocol-version"] as string;

    if (
      protocolVersion &&
      !SUPPORTED_MCP_PROTOCOL_VERSIONS.includes(protocolVersion as any)
    ) {
      this.logger.warn(
        `Rejected request with unsupported protocol version: ${protocolVersion}`,
      );
      res.status(400).json({
        error: `Bad Request: Unsupported MCP protocol version '${protocolVersion}'. Supported versions: ${SUPPORTED_MCP_PROTOCOL_VERSIONS.join(", ")}`,
      });
      return false;
    }

    // If no version header present, assume 2025-03-26 for backwards compatibility
    // Per spec: "the server SHOULD assume protocol version 2025-03-26"

    return true;
  }

  /**
   * Express middleware that validates all security requirements.
   */
  createMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
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
