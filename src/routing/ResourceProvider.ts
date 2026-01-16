// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import { ResourceReadError } from '../errors';
import { TOOL_NAMES } from './toolNames';

/**
 * Provides MCP resources for debugging context.
 * Exposes VS Code workspace files like launch.json as readable resources.
 */
export class ResourceProvider {
  /**
   * Lists all available resources in the workspace.
   */
  async listResources(): Promise<
    Array<{
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
    }>
  > {
    const resources: Array<{
      uri: string;
      name: string;
      description?: string;
      mimeType?: string;
    }> = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return [];
    }

    // Add launch.json from each workspace folder
    for (const folder of workspaceFolders) {
      const launchUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'launch.json');

      // Try to stat the file - only add to resources if it exists
      try {
        await vscode.workspace.fs.stat(launchUri);
        const uri = `debugssy:///${folder.name}/launch.json`;
        resources.push({
          uri,
          name: `${folder.name} Debug Configurations`,
          description: `Debug configurations from ${folder.name}/.vscode/launch.json. Use the "name" field from configurations when calling ${TOOL_NAMES.startDebugging}.`,
          mimeType: 'application/json',
        });
      } catch {
        // File doesn't exist or isn't readable - skip it
        continue;
      }
    }

    return resources;
  }

  /**
   * Reads a specific resource by URI.
   */
  async readResource(uri: string): Promise<{
    contents: Array<{
      uri: string;
      mimeType?: string;
      text?: string;
    }>;
  }> {
    // Parse URI: debugssy:///workspaceName/launch.json
    const match = uri.match(/^debugssy:\/\/\/([^/]+)\/launch\.json$/);

    if (!match) {
      throw new ResourceReadError(
        uri,
        'Invalid resource URI. Expected format: debugssy:///workspaceName/launch.json'
      );
    }

    const workspaceName = match[1];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      throw new ResourceReadError(uri, 'No workspace folders open');
    }

    // Find the workspace folder
    const folder = workspaceFolders.find((f) => f.name === workspaceName);
    if (!folder) {
      throw new ResourceReadError(uri, `Workspace folder "${workspaceName}" not found`);
    }

    const launchUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'launch.json');

    // Read the file - single operation, no TOCTOU race
    try {
      const fileData = await vscode.workspace.fs.readFile(launchUri);
      const content = Buffer.from(fileData).toString('utf-8');
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: content,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new ResourceReadError(
        uri,
        `Failed to read launch.json from ${folder.name}: ${message}`
      );
    }
  }
}
