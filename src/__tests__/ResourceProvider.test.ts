// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceProvider } from '../routing/ResourceProvider';
import { vscode } from './setup';

/**
 * Creates a mock workspace folder with proper URI structure.
 */
function createMockWorkspaceFolder(name: string, basePath = '/home/user') {
  const fsPath = `${basePath}/${name}`;
  return {
    name,
    uri: {
      fsPath,
      scheme: 'file',
      toString: () => `file://${fsPath}`,
    },
    index: 0,
  };
}

describe('ResourceProvider', () => {
  let resourceProvider: ResourceProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    resourceProvider = new ResourceProvider();
    // Reset workspace folders
    vscode.workspace.workspaceFolders = [];
  });

  describe('listResources', () => {
    it('should return empty array when no workspace folders are open', async () => {
      vscode.workspace.workspaceFolders = undefined as any;

      const result = await resourceProvider.listResources();

      expect(result).toEqual([]);
    });

    it('should return empty array when workspaceFolders array is empty', async () => {
      vscode.workspace.workspaceFolders = [];

      const result = await resourceProvider.listResources();

      expect(result).toEqual([]);
    });

    it('should list launch.json resources for each workspace folder', async () => {
      vscode.workspace.workspaceFolders = [
        createMockWorkspaceFolder('project1'),
        createMockWorkspaceFolder('project2'),
      ] as any;

      vscode.workspace.fs.stat = vi.fn().mockResolvedValue({ type: vscode.FileType.File });

      const result = await resourceProvider.listResources();

      expect(result).toHaveLength(2);
      expect(result[0]?.uri).toBe('debugssy:///project1/launch.json');
      expect(result[1]?.uri).toBe('debugssy:///project2/launch.json');
    });

    it('should skip workspace folders where launch.json does not exist', async () => {
      const withLaunch = createMockWorkspaceFolder('with-launch');
      const withoutLaunch = createMockWorkspaceFolder('without-launch');

      vscode.workspace.workspaceFolders = [withLaunch, withoutLaunch] as any;

      vscode.workspace.fs.stat = vi.fn((uri: any) => {
        if (uri.fsPath.includes('with-launch')) {
          return Promise.resolve({ type: vscode.FileType.File });
        }
        return Promise.reject(new Error('File not found'));
      });

      const result = await resourceProvider.listResources();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('with-launch Debug Configurations');
    });

    it('should generate correct resource metadata', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('my-app')] as any;
      vscode.workspace.fs.stat = vi.fn().mockResolvedValue({ type: vscode.FileType.File });

      const result = await resourceProvider.listResources();

      expect(result).toHaveLength(1);
      const resource = result[0];
      expect(resource?.uri).toBe('debugssy:///my-app/launch.json');
      expect(resource?.name).toBe('my-app Debug Configurations');
      expect(resource?.description).toContain('launch.json');
      expect(resource?.description).toContain('start_debugging');
      expect(resource?.mimeType).toBe('application/json');
    });

    it('should handle stat errors gracefully without throwing', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('error-folder')] as any;
      vscode.workspace.fs.stat = vi.fn().mockRejectedValue(new Error('Permission denied'));

      const result = await resourceProvider.listResources();

      // Should return empty array, not throw
      expect(result).toEqual([]);
    });
  });

  describe('readResource', () => {
    const testWorkspace = createMockWorkspaceFolder('test-project');

    beforeEach(() => {
      vscode.workspace.workspaceFolders = [testWorkspace] as any;
    });

    it('should read launch.json content successfully', async () => {
      const mockContent = JSON.stringify({
        version: '0.2.0',
        configurations: [{ name: 'Launch Program', type: 'node', request: 'launch' }],
      });

      vscode.workspace.fs.readFile = vi.fn().mockResolvedValue(Buffer.from(mockContent));

      const result = await resourceProvider.readResource('debugssy:///test-project/launch.json');

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]?.uri).toBe('debugssy:///test-project/launch.json');
      expect(result.contents[0]?.mimeType).toBe('application/json');
      expect(result.contents[0]?.text).toBe(mockContent);
    });

    it('should preserve file content exactly as read', async () => {
      const originalContent = '{\n  "name": "test",\n  "value": 123\n}';
      vscode.workspace.fs.readFile = vi.fn().mockResolvedValue(Buffer.from(originalContent));

      const result = await resourceProvider.readResource('debugssy:///test-project/launch.json');

      expect(result.contents[0]?.text).toBe(originalContent);
    });

    it('should handle UTF-8 encoded content correctly', async () => {
      const utf8Content = '{\n  "name": "тест",\n  "emoji": "🔧"\n}';
      vscode.workspace.fs.readFile = vi.fn().mockResolvedValue(Buffer.from(utf8Content, 'utf-8'));

      const result = await resourceProvider.readResource('debugssy:///test-project/launch.json');

      expect(result.contents[0]?.text).toBe(utf8Content);
      expect(result.contents[0]?.text).toContain('тест');
      expect(result.contents[0]?.text).toContain('🔧');
    });

    it('should handle empty launch.json file', async () => {
      vscode.workspace.fs.readFile = vi.fn().mockResolvedValue(Buffer.from(''));

      const result = await resourceProvider.readResource('debugssy:///test-project/launch.json');

      expect(result.contents[0]?.text).toBe('');
    });
  });

  describe('readResource - error handling', () => {
    it('should throw for invalid URI format - missing protocol', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('test')] as any;

      await expect(resourceProvider.readResource('invalid-uri')).rejects.toThrow(
        'Invalid resource URI'
      );
    });

    it('should throw for invalid URI format - wrong protocol', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('test')] as any;

      await expect(resourceProvider.readResource('file:///test/launch.json')).rejects.toThrow(
        'Invalid resource URI'
      );
    });

    it('should throw for invalid URI format - wrong file name', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('test')] as any;

      await expect(resourceProvider.readResource('debugssy:///test/config.json')).rejects.toThrow(
        'Invalid resource URI'
      );
    });

    it('should throw for invalid URI format - extra path segments', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('test')] as any;

      await expect(
        resourceProvider.readResource('debugssy:///test/extra/launch.json')
      ).rejects.toThrow('Invalid resource URI');
    });

    it('should throw when no workspace folders are open', async () => {
      vscode.workspace.workspaceFolders = undefined as any;

      await expect(
        resourceProvider.readResource('debugssy:///test-project/launch.json')
      ).rejects.toThrow('No workspace folders open');
    });

    it('should throw when workspace folder is not found', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('different-project')] as any;

      await expect(
        resourceProvider.readResource('debugssy:///missing-project/launch.json')
      ).rejects.toThrow('Workspace folder "missing-project" not found');
    });

    it('should throw when file read fails', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('test-project')] as any;
      vscode.workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('File does not exist'));

      await expect(
        resourceProvider.readResource('debugssy:///test-project/launch.json')
      ).rejects.toThrow('Failed to read launch.json');
    });
  });

  describe('error message quality', () => {
    it('should include expected format in invalid URI error', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('test')] as any;

      try {
        await resourceProvider.readResource('bad-uri');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Invalid resource URI');
        expect(error.message).toContain('debugssy:///workspaceName/launch.json');
      }
    });

    it('should include workspace name in not found error', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('actual-project')] as any;

      try {
        await resourceProvider.readResource('debugssy:///missing-project/launch.json');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('missing-project');
      }
    });

    it('should include original error message in file read failure', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('test')] as any;
      vscode.workspace.fs.readFile = vi.fn().mockRejectedValue(new Error('Permission denied'));

      try {
        await resourceProvider.readResource('debugssy:///test/launch.json');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Failed to read launch.json');
        expect(error.message).toContain('test');
        expect(error.message).toContain('Permission denied');
      }
    });
  });

  describe('workspace name variations', () => {
    const workspaceNames = [
      'simple',
      'with-dashes',
      'with_underscores',
      'with.dots',
      'MixedCase',
      'project123',
    ];

    it.each(workspaceNames)('should handle workspace name: %s', async (name) => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder(name)] as any;
      vscode.workspace.fs.stat = vi.fn().mockResolvedValue({ type: vscode.FileType.File });
      vscode.workspace.fs.readFile = vi.fn().mockResolvedValue(Buffer.from('{}'));

      // Test listResources
      const listed = await resourceProvider.listResources();
      expect(listed).toHaveLength(1);
      expect(listed[0]?.uri).toBe(`debugssy:///${name}/launch.json`);

      // Test readResource
      const read = await resourceProvider.readResource(`debugssy:///${name}/launch.json`);
      expect(read.contents[0]?.text).toBe('{}');
    });
  });

  describe('multiple workspaces', () => {
    it('should handle multiple workspaces with mixed launch.json availability', async () => {
      const workspaces = [
        createMockWorkspaceFolder('has-launch-1'),
        createMockWorkspaceFolder('no-launch'),
        createMockWorkspaceFolder('has-launch-2'),
      ];

      vscode.workspace.workspaceFolders = workspaces as any;

      vscode.workspace.fs.stat = vi.fn((uri: any) => {
        if (uri.fsPath.includes('no-launch')) {
          return Promise.reject(new Error('Not found'));
        }
        return Promise.resolve({ type: vscode.FileType.File });
      });

      const result = await resourceProvider.listResources();

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.name)).toEqual([
        'has-launch-1 Debug Configurations',
        'has-launch-2 Debug Configurations',
      ]);
    });

    it('should read from correct workspace when multiple exist', async () => {
      vscode.workspace.workspaceFolders = [
        createMockWorkspaceFolder('project-a'),
        createMockWorkspaceFolder('project-b'),
      ] as any;

      vscode.workspace.fs.readFile = vi.fn((uri: any) => {
        if (uri.fsPath.includes('project-a')) {
          return Promise.resolve(Buffer.from('{"name": "A"}'));
        }
        return Promise.resolve(Buffer.from('{"name": "B"}'));
      });

      const resultA = await resourceProvider.readResource('debugssy:///project-a/launch.json');
      const resultB = await resourceProvider.readResource('debugssy:///project-b/launch.json');

      expect(resultA.contents[0]?.text).toBe('{"name": "A"}');
      expect(resultB.contents[0]?.text).toBe('{"name": "B"}');
    });
  });
});
