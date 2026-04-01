// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

/**
 * Type augmentation for Cursor's MCP Extension API.
 * Only available at runtime when the extension runs inside Cursor.
 * All call sites must use runtime guards before accessing these APIs.
 * @see https://cursor.com/docs/context/mcp-extension-api
 */
declare module 'vscode' {
  export namespace cursor {
    export namespace mcp {
      export interface StdioServerConfig {
        name: string;
        server: {
          command: string;
          args: string[];
          env: Record<string, string>;
        };
      }

      export interface RemoteServerConfig {
        name: string;
        server: {
          url: string;
          headers?: Record<string, string>;
        };
      }

      export type ExtMCPServerConfig = StdioServerConfig | RemoteServerConfig;

      export const registerServer: (config: ExtMCPServerConfig) => void;
      export const unregisterServer: (serverName: string) => void;
    }
  }
}
