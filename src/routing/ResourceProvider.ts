// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
    const resources = [];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      return [];
    }

    // Add launch.json from each workspace folder
    for (const folder of workspaceFolders) {
      const launchPath = path.join(folder.uri.fsPath, '.vscode', 'launch.json');

      // Check if launch.json exists
      if (fs.existsSync(launchPath)) {
        const uri = `debugssy:///${folder.name}/launch.json`;
        resources.push({
          uri,
          name: `${folder.name} Debug Configurations`,
          description: `Debug configurations from ${folder.name}/.vscode/launch.json. Use the "name" field from configurations when calling start_debugging.`,
          mimeType: 'application/json',
        });
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
      throw new Error(
        `Invalid resource URI: ${uri}. Expected format: debugssy:///workspaceName/launch.json`
      );
    }

    const workspaceName = match[1];
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
      throw new Error('No workspace folders open');
    }

    // Find the workspace folder
    const folder = workspaceFolders.find((f) => f.name === workspaceName);
    if (!folder) {
      throw new Error(`Workspace folder "${workspaceName}" not found`);
    }

    const launchPath = path.join(folder.uri.fsPath, '.vscode', 'launch.json');

    // Read the file
    if (!fs.existsSync(launchPath)) {
      throw new Error(`launch.json not found in ${folder.name}`);
    }

    const content = fs.readFileSync(launchPath, 'utf-8');

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: content,
        },
      ],
    };
  }
}
