// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CompletionProvider } from '../routing/CompletionProvider';
import { vscode } from './setup';

/**
 * Creates a mock workspace folder.
 */
function createMockWorkspaceFolder(name: string, basePath = '/project') {
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

/**
 * Creates a mock DocumentSymbol.
 */
function createDocumentSymbol(
  name: string,
  kind: number,
  children: any[] = []
): any {
  return { name, kind, children };
}

/**
 * Creates a mock SymbolInformation (workspace symbol).
 */
function createSymbolInfo(name: string, kind: number): any {
  return { name, kind, location: {} };
}

describe('CompletionProvider', () => {
  let completionProvider: CompletionProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    completionProvider = new CompletionProvider();
    vscode.workspace.workspaceFolders = [];
  });

  afterEach(() => {
    completionProvider.dispose();
  });

  describe('getCompletions - routing', () => {
    it('should return empty result for unsupported argument names', async () => {
      const result = await completionProvider.getCompletions('test-prompt', 'unsupported-arg', '');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should route filePath arguments to file path completions', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('project')] as any;
      vscode.workspace.findFiles = vi.fn().mockResolvedValue([
        { fsPath: '/project/project/src/index.ts', toString: () => 'src/index.ts' },
      ]);

      const result = await completionProvider.getCompletions('test', 'filePath', '');

      expect(result.values.length).toBeGreaterThan(0);
    });

    it('should route functionName arguments to function name completions', async () => {
      vscode.window.activeTextEditor = undefined;
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([]);

      const result = await completionProvider.getCompletions('test', 'functionName', '');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should route variableName arguments to variable name completions', async () => {
      vscode.debug.activeDebugSession = undefined;
      vscode.window.activeTextEditor = undefined;
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([]);

      const result = await completionProvider.getCompletions('test', 'variableName', '');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should handle errors gracefully and return empty result', async () => {
      vscode.workspace.workspaceFolders = undefined as any;

      const result = await completionProvider.getCompletions('test', 'filePath', 'test');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should support multiple argument name aliases for file paths', async () => {
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('project')] as any;
      vscode.workspace.findFiles = vi.fn().mockResolvedValue([]);

      const argNames = ['filePath', 'entryPoint', 'loopLocation'];

      for (const argName of argNames) {
        const result = await completionProvider.getCompletions('test', argName, '');
        expect(result).toBeDefined();
      }
    });
  });

  describe('File Path Completions', () => {
    it('should return empty result when no workspace folders', async () => {
      vscode.workspace.workspaceFolders = undefined as any;

      const result = await completionProvider.getCompletions('test', 'filePath', '');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should return empty result when workspace folders array is empty', async () => {
      vscode.workspace.workspaceFolders = [];

      const result = await completionProvider.getCompletions('test', 'filePath', '');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should filter file paths based on partial value', async () => {
      const folder = createMockWorkspaceFolder('project');
      vscode.workspace.workspaceFolders = [folder] as any;

      const mockFiles = [
        { fsPath: `${folder.uri.fsPath}/src/index.ts`, toString: () => 'src/index.ts' },
        { fsPath: `${folder.uri.fsPath}/src/utils.ts`, toString: () => 'src/utils.ts' },
        { fsPath: `${folder.uri.fsPath}/tests/test.ts`, toString: () => 'tests/test.ts' },
      ];

      vscode.workspace.findFiles = vi.fn().mockResolvedValue(mockFiles);

      const result = await completionProvider.getCompletions('test', 'filePath', 'src/');

      expect(result.values.every((v) => v.startsWith('src/'))).toBe(true);
    });

    it('should limit results to MAX_COMPLETIONS', async () => {
      const folder = createMockWorkspaceFolder('project');
      vscode.workspace.workspaceFolders = [folder] as any;

      const manyFiles = Array.from({ length: 150 }, (_, i) => ({
        fsPath: `${folder.uri.fsPath}/file${i}.ts`,
        toString: () => `file${i}.ts`,
      }));

      vscode.workspace.findFiles = vi.fn().mockResolvedValue(manyFiles);

      const result = await completionProvider.getCompletions('test', 'filePath', '');

      expect(result.values.length).toBeLessThanOrEqual(100);
      expect(result.total).toBeGreaterThan(100);
      expect(result.hasMore).toBe(true);
    });

    it('should prefix paths with workspace folder name in multi-root workspace', async () => {
      const frontend = createMockWorkspaceFolder('frontend', '/workspaces');
      const backend = createMockWorkspaceFolder('backend', '/workspaces');
      vscode.workspace.workspaceFolders = [frontend, backend] as any;

      vscode.workspace.findFiles = vi.fn().mockResolvedValue([
        { fsPath: `${frontend.uri.fsPath}/src/index.ts`, toString: () => 'src/index.ts' },
        { fsPath: `${backend.uri.fsPath}/src/server.ts`, toString: () => 'src/server.ts' },
      ]);

      const result = await completionProvider.getCompletions('test', 'filePath', '');

      expect(result.values.some((v) => v.startsWith('frontend/'))).toBe(true);
      expect(result.values.some((v) => v.startsWith('backend/'))).toBe(true);
    });

    it('should not prefix paths in single-root workspace', async () => {
      const folder = createMockWorkspaceFolder('project');
      vscode.workspace.workspaceFolders = [folder] as any;

      vscode.workspace.findFiles = vi.fn().mockResolvedValue([
        { fsPath: `${folder.uri.fsPath}/src/index.ts`, toString: () => 'src/index.ts' },
      ]);

      const result = await completionProvider.getCompletions('test', 'filePath', '');

      expect(result.values[0]).toBe('src/index.ts');
      expect(result.values[0]).not.toContain('project/');
    });
  });

  describe('Function Name Completions', () => {
    it('should extract function names from active editor document symbols', async () => {
      vscode.window.activeTextEditor = {
        document: { uri: { fsPath: '/test.ts' } },
      } as any;

      // Use correct SymbolKind values: Function = 11, Method = 5
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([
        createDocumentSymbol('processData', vscode.SymbolKind.Function),
        createDocumentSymbol('helperMethod', vscode.SymbolKind.Method),
        createDocumentSymbol('MyClass', vscode.SymbolKind.Class), // Should be ignored
      ]);

      const result = await completionProvider.getCompletions('test', 'functionName', '');

      expect(result.values).toContain('processData');
      expect(result.values).toContain('helperMethod');
      expect(result.values).not.toContain('MyClass');
    });

    it('should search workspace symbols when active editor has few functions', async () => {
      vscode.window.activeTextEditor = {
        document: { uri: { fsPath: '/test.ts' } },
      } as any;

      let callCount = 0;
      vscode.commands.executeCommand = vi.fn().mockImplementation((command) => {
        callCount++;
        if (command === 'vscode.executeDocumentSymbolProvider') {
          // Return few local functions to trigger workspace search
          return Promise.resolve([
            createDocumentSymbol('localFunc', vscode.SymbolKind.Function),
          ]);
        }
        if (command === 'vscode.executeWorkspaceSymbolProvider') {
          // Return workspace symbols
          return Promise.resolve([
            createSymbolInfo('workspaceFunc', vscode.SymbolKind.Function),
            createSymbolInfo('workspaceMethod', vscode.SymbolKind.Method),
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await completionProvider.getCompletions('test', 'functionName', '');

      expect(result.values).toContain('localFunc');
      expect(result.values).toContain('workspaceFunc');
      expect(result.values).toContain('workspaceMethod');
    });

    it('should handle no active editor', async () => {
      vscode.window.activeTextEditor = undefined;
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([]);

      const result = await completionProvider.getCompletions('test', 'functionName', '');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should filter functions based on partial value', async () => {
      vscode.window.activeTextEditor = {
        document: { uri: { fsPath: '/test.ts' } },
      } as any;

      vscode.commands.executeCommand = vi.fn().mockResolvedValue([
        createDocumentSymbol('processData', vscode.SymbolKind.Function),
        createDocumentSymbol('processError', vscode.SymbolKind.Function),
        createDocumentSymbol('fetchData', vscode.SymbolKind.Function),
      ]);

      const result = await completionProvider.getCompletions('test', 'functionName', 'process');

      expect(result.values).toContain('processData');
      expect(result.values).toContain('processError');
      expect(result.values.every((v) => v.toLowerCase().includes('process'))).toBe(true);
    });

    it('should extract nested functions from class methods', async () => {
      vscode.window.activeTextEditor = {
        document: { uri: { fsPath: '/test.ts' } },
      } as any;

      vscode.commands.executeCommand = vi.fn().mockResolvedValue([
        createDocumentSymbol('MyClass', vscode.SymbolKind.Class, [
          createDocumentSymbol('constructor', vscode.SymbolKind.Constructor),
          createDocumentSymbol('getData', vscode.SymbolKind.Method),
          createDocumentSymbol('setData', vscode.SymbolKind.Method),
        ]),
      ]);

      const result = await completionProvider.getCompletions('test', 'functionName', '');

      expect(result.values).toContain('getData');
      expect(result.values).toContain('setData');
      expect(result.values).not.toContain('MyClass');
    });
  });

  describe('Variable Name Completions', () => {
    it('should return empty result when no active debug session and no editor', async () => {
      vscode.debug.activeDebugSession = undefined;
      vscode.window.activeTextEditor = undefined;
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([]);

      const result = await completionProvider.getCompletions('test', 'variableName', '');

      expect(result).toEqual({ values: [], total: 0, hasMore: false });
    });

    it('should extract variables from active debug session', async () => {
      vscode.debug.activeDebugSession = {
        id: 'test-session',
        customRequest: vi.fn().mockImplementation((command) => {
          if (command === 'threads') {
            return Promise.resolve({ threads: [{ id: 1 }] });
          }
          if (command === 'stackTrace') {
            return Promise.resolve({ stackFrames: [{ id: 100, name: 'main' }] });
          }
          if (command === 'scopes') {
            return Promise.resolve({
              scopes: [
                { name: 'Local', variablesReference: 1, expensive: false },
              ],
            });
          }
          if (command === 'variables') {
            return Promise.resolve({
              variables: [
                { name: 'user', value: '{...}', type: 'object' },
                { name: 'count', value: '42', type: 'number' },
              ],
            });
          }
          return Promise.resolve({});
        }),
      } as any;

      vscode.debug.activeStackFrame = undefined;
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([]);

      const result = await completionProvider.getCompletions('test', 'variableName', '');

      expect(result.values).toContain('user');
      expect(result.values).toContain('count');
    });

    it('should fall back to static analysis when no debug session', async () => {
      vscode.debug.activeDebugSession = undefined;
      vscode.window.activeTextEditor = {
        document: { uri: { fsPath: '/test.ts' } },
      } as any;

      // Use correct SymbolKind values: Variable = 12, Property = 6
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([
        createDocumentSymbol('myVariable', vscode.SymbolKind.Variable),
        createDocumentSymbol('myProperty', vscode.SymbolKind.Property),
        createDocumentSymbol('myConstant', vscode.SymbolKind.Constant),
      ]);

      const result = await completionProvider.getCompletions('test', 'variableName', '');

      expect(result.values).toContain('myVariable');
      expect(result.values).toContain('myProperty');
      expect(result.values).toContain('myConstant');
    });

    it('should handle errors in debug session gracefully', async () => {
      vscode.debug.activeDebugSession = {
        id: 'test-session',
        customRequest: vi.fn().mockRejectedValue(new Error('Debug error')),
      } as any;

      vscode.window.activeTextEditor = undefined;
      vscode.commands.executeCommand = vi.fn().mockResolvedValue([]);

      const result = await completionProvider.getCompletions('test', 'variableName', '');

      expect(result).toBeDefined();
    });
  });

  describe('File Cache Management', () => {
    it('should initialize file cache on first completion request', async () => {
      const folder = createMockWorkspaceFolder('project');
      vscode.workspace.workspaceFolders = [folder] as any;
      vscode.workspace.findFiles = vi.fn().mockResolvedValue([]);

      await completionProvider.getCompletions('test', 'filePath', '');

      expect(vscode.workspace.findFiles).toHaveBeenCalled();
    });

    it('should use cached file paths for subsequent requests', async () => {
      const folder = createMockWorkspaceFolder('project');
      vscode.workspace.workspaceFolders = [folder] as any;
      vscode.workspace.findFiles = vi.fn().mockResolvedValue([
        { fsPath: `${folder.uri.fsPath}/src/index.ts`, toString: () => 'src/index.ts' },
      ]);

      await completionProvider.getCompletions('test', 'filePath', '');
      const initialCallCount = (vscode.workspace.findFiles as any).mock.calls.length;

      await completionProvider.getCompletions('test', 'filePath', '');

      // Should not call findFiles again (using cache)
      expect((vscode.workspace.findFiles as any).mock.calls.length).toBe(initialCallCount);
    });
  });

  describe('dispose', () => {
    it('should dispose without errors', () => {
      const provider = new CompletionProvider();
      expect(() => provider.dispose()).not.toThrow();
    });

    it('should clear file cache on dispose', async () => {
      const folder = createMockWorkspaceFolder('project');
      vscode.workspace.workspaceFolders = [folder] as any;
      vscode.workspace.findFiles = vi.fn().mockResolvedValue([]);

      await completionProvider.getCompletions('test', 'filePath', '');
      completionProvider.dispose();

      // After dispose, next request should rebuild cache
      const newProvider = new CompletionProvider();
      await newProvider.getCompletions('test', 'filePath', '');

      // findFiles should have been called again
      expect(vscode.workspace.findFiles).toHaveBeenCalledTimes(2);
      newProvider.dispose();
    });

    it('should dispose file watchers', () => {
      const provider = new CompletionProvider();
      vscode.workspace.workspaceFolders = [createMockWorkspaceFolder('project')] as any;

      const mockWatcher = {
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      };
      vscode.workspace.createFileSystemWatcher = vi.fn().mockReturnValue(mockWatcher);

      // Trigger watcher initialization
      provider.getCompletions('test', 'filePath', '');

      expect(() => provider.dispose()).not.toThrow();
    });
  });
});
