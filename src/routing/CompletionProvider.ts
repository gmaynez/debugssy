// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { MAX_COMPLETIONS, MAX_FILE_CACHE_SIZE } from '../constants';

/**
 * Provides completion suggestions for MCP prompt arguments.
 * Helps users autocomplete file paths, function names, variable names, etc.
 */
export class CompletionProvider {
  private logger: Logger;
  // Map workspace folder URI to array of relative file paths
  private fileCache: Map<string, string[]> = new Map();
  private cacheInitialized = false;
  private cacheInitializing: Promise<void> | null = null;
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private static readonly FILE_SEARCH_EXCLUDE =
    '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/build/**}';

  constructor() {
    this.logger = Logger.getInstance();
    this.setupFileSystemWatchers();
  }

  /**
   * Dispose of event listeners to prevent memory leaks.
   */
  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];

    this.fileWatchers.forEach((w) => w.dispose());
    this.fileWatchers = [];

    this.fileCache.clear();
  }

  /**
   * Provides completions for a specific prompt argument.
   */
  async getCompletions(
    _promptName: string,
    argumentName: string,
    partialValue: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    try {
      switch (argumentName) {
        case 'filePath':
        case 'entryPoint':
          return await this.getFilePathCompletions(partialValue);

        case 'functionName':
          return await this.getFunctionNameCompletions(partialValue);

        case 'variableName':
          return await this.getVariableNameCompletions(partialValue);

        default:
          return { values: [], total: 0, hasMore: false };
      }
    } catch (error: unknown) {
      this.logger.error(`Error getting completions for ${argumentName}:`, error);
      return { values: [], total: 0, hasMore: false };
    }
  }

  /**
   * Gets file path completions from the workspace.
   *
   * The initial call builds an in-memory cache of workspace files and subsequent
   * calls simply filter that cache based on the user's partial input. The cache
   * is kept in sync via FileSystemWatcher events (including external changes),
   * allowing us to avoid expensive full-workspace globbing on every keystroke.
   *
   * Supports multi-root workspaces by indexing all folders and prefixing paths
   * with the workspace folder name when multiple roots exist.
   */
  private async getFilePathCompletions(
    partial: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return { values: [], total: 0, hasMore: false };
    }

    await this.ensureFileCache(workspaceFolders);

    // Aggregate all cached files from all workspace folders
    let filePaths: string[] = [];
    const isMultiRoot = workspaceFolders.length > 1;

    for (const folder of workspaceFolders) {
      const cached = this.fileCache.get(folder.uri.toString()) || [];
      if (isMultiRoot) {
        // Prefix with folder name for multi-root workspaces
        const folderName = folder.name;
        filePaths.push(...cached.map((p) => `${folderName}/${p}`));
      } else {
        filePaths.push(...cached);
      }
    }

    // Filter by partial match (case-insensitive)
    if (partial) {
      const lowerPartial = partial.toLowerCase();
      filePaths = filePaths.filter((p) => p.toLowerCase().includes(lowerPartial));
    }

    // Sort by relevance: exact prefix matches first, then contains matches
    filePaths.sort((a, b) => {
      if (partial) {
        const lowerPartial = partial.toLowerCase();
        const aStarts = a.toLowerCase().startsWith(lowerPartial);
        const bStarts = b.toLowerCase().startsWith(lowerPartial);
        if (aStarts && !bStarts) {
          return -1;
        }
        if (!aStarts && bStarts) {
          return 1;
        }
      }
      // Then alphabetically
      return a.localeCompare(b);
    });

    const total = filePaths.length;
    const values = filePaths.slice(0, MAX_COMPLETIONS);

    return {
      values,
      total,
      hasMore: total > MAX_COMPLETIONS,
    };
  }

  /**
   * Populates the file cache on first use and keeps it up to date with file events.
   */
  private async ensureFileCache(
    workspaceFolders: readonly vscode.WorkspaceFolder[]
  ): Promise<void> {
    if (this.cacheInitialized) {
      return;
    }

    if (!this.cacheInitializing) {
      this.cacheInitializing = this.buildFileCache(workspaceFolders)
        .then(() => {
          this.cacheInitialized = true;
        })
        .catch((error) => {
          this.logger.error('Failed to build file path cache', error);
          this.fileCache.clear();
          this.cacheInitialized = false;
        })
        .finally(() => {
          this.cacheInitializing = null;
        });
    }

    await this.cacheInitializing;
  }

  private async buildFileCache(workspaceFolders: readonly vscode.WorkspaceFolder[]): Promise<void> {
    // Build cache for all workspace folders
    for (const folder of workspaceFolders) {
      const pattern = new vscode.RelativePattern(folder, '**/*');
      const files = await vscode.workspace.findFiles(
        pattern,
        CompletionProvider.FILE_SEARCH_EXCLUDE,
        MAX_FILE_CACHE_SIZE
      );

      const relativePaths = files
        .map((uri) => this.toRelativePath(uri, folder))
        .filter((relativePath): relativePath is string => relativePath !== null);

      this.fileCache.set(folder.uri.toString(), relativePaths);
    }
  }

  /**
   * Sets up FileSystemWatchers for all workspace folders to track external file changes.
   * These watchers catch changes from git, build tools, and external editors that
   * onDidCreateFiles/onDidDeleteFiles events would miss.
   */
  private setupFileSystemWatchers(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      const pattern = new vscode.RelativePattern(folder, '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      // Watch for file creation (including from external sources)
      watcher.onDidCreate((uri) => {
        this.onFileCreated(uri, folder);
      });

      // Watch for file deletion (including from external sources)
      watcher.onDidDelete((uri) => {
        this.onFileDeleted(uri, folder);
      });

      this.fileWatchers.push(watcher);
    }

    // Listen for workspace folder changes to rebuild cache
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        this.onWorkspaceFoldersChanged(event);
      })
    );
  }

  private onFileCreated(uri: vscode.Uri, folder: vscode.WorkspaceFolder): void {
    if (!this.cacheInitialized) {
      return; // Cache not built yet, will be included when built
    }

    const relativePath = this.toRelativePath(uri, folder);
    if (!relativePath || this.shouldExclude(relativePath)) {
      return; // Skip excluded paths (node_modules, etc.)
    }

    const folderKey = folder.uri.toString();
    const cached = this.fileCache.get(folderKey) || [];

    // Use Set for O(1) lookup instead of O(N) includes
    const cacheSet = new Set(cached);
    if (!cacheSet.has(relativePath)) {
      cached.push(relativePath);
      this.fileCache.set(folderKey, cached);
    }
  }

  private onFileDeleted(uri: vscode.Uri, folder: vscode.WorkspaceFolder): void {
    if (!this.cacheInitialized) {
      return; // Cache not built yet, nothing to remove
    }

    const relativePath = this.toRelativePath(uri, folder);
    if (!relativePath) {
      return;
    }

    const folderKey = folder.uri.toString();
    const cached = this.fileCache.get(folderKey);
    if (!cached) {
      return;
    }

    const filtered = cached.filter((p) => p !== relativePath);
    this.fileCache.set(folderKey, filtered);
  }

  private async onWorkspaceFoldersChanged(
    event: vscode.WorkspaceFoldersChangeEvent
  ): Promise<void> {
    // Remove cache entries for removed folders
    for (const removed of event.removed) {
      this.fileCache.delete(removed.uri.toString());
    }

    // Rebuild cache to include new folders
    if (event.added.length > 0) {
      this.cacheInitialized = false;
      this.cacheInitializing = null;

      // Dispose old watchers and setup new ones
      this.fileWatchers.forEach((w) => w.dispose());
      this.fileWatchers = [];
      this.setupFileSystemWatchers();
    }
  }

  private toRelativePath(uri: vscode.Uri, folder: vscode.WorkspaceFolder): string | null {
    const relativePath = path.relative(folder.uri.fsPath, uri.fsPath);
    if (relativePath.startsWith('..')) {
      return null; // File is outside workspace folder
    }

    // Normalize path separators to forward slashes
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * Checks if a file path should be excluded based on common exclude patterns.
   */
  private shouldExclude(relativePath: string): boolean {
    const excludePatterns = ['node_modules/', 'out/', 'dist/', '.git/', 'build/'];

    const normalizedPath = relativePath.replace(/\\/g, '/');
    return excludePatterns.some(
      (pattern) =>
        normalizedPath.includes(pattern) || normalizedPath.startsWith(pattern.replace('/', ''))
    );
  }

  /**
   * Gets function name completions from the active editor or workspace.
   * Uses VS Code's document symbols to find function declarations.
   */
  private async getFunctionNameCompletions(
    partial: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    const functionNames = new Set<string>();

    // Try to get symbols from the active editor first
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        activeEditor.document.uri
      );

      if (symbols) {
        this.extractFunctionNames(symbols, functionNames);
      }
    }

    // If we don't have many results, search workspace symbols
    if (functionNames.size < 10) {
      const workspaceSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        partial || ''
      );

      if (workspaceSymbols) {
        for (const symbol of workspaceSymbols) {
          if (
            symbol.kind === vscode.SymbolKind.Function ||
            symbol.kind === vscode.SymbolKind.Method
          ) {
            functionNames.add(symbol.name);
          }
        }
      }
    }

    let functions = Array.from(functionNames);

    // Filter by partial match
    if (partial) {
      const lowerPartial = partial.toLowerCase();
      functions = functions.filter((name) => name.toLowerCase().includes(lowerPartial));
    }

    // Sort by relevance
    functions.sort((a, b) => {
      if (partial) {
        const lowerPartial = partial.toLowerCase();
        const aStarts = a.toLowerCase().startsWith(lowerPartial);
        const bStarts = b.toLowerCase().startsWith(lowerPartial);
        if (aStarts && !bStarts) {
          return -1;
        }
        if (!aStarts && bStarts) {
          return 1;
        }
      }
      return a.localeCompare(b);
    });

    const total = functions.length;
    const values = functions.slice(0, MAX_COMPLETIONS);

    return {
      values,
      total,
      hasMore: total > MAX_COMPLETIONS,
    };
  }

  /**
   * Recursively extracts function and method names from document symbols.
   */
  private extractFunctionNames(symbols: vscode.DocumentSymbol[], functionNames: Set<string>): void {
    for (const symbol of symbols) {
      if (symbol.kind === vscode.SymbolKind.Function || symbol.kind === vscode.SymbolKind.Method) {
        functionNames.add(symbol.name);
      }

      // Recursively check children (methods inside classes, etc.)
      if (symbol.children && symbol.children.length > 0) {
        this.extractFunctionNames(symbol.children, functionNames);
      }
    }
  }

  /**
   * Gets variable name completions from the current debug session.
   * Only works if there's an active debug session and execution is paused.
   */
  private async getVariableNameCompletions(
    partial: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      return { values: [], total: 0, hasMore: false };
    }

    try {
      // Get the current stack frame
      const stackTrace = await session.customRequest('stackTrace', {
        threadId: 1,
      });

      if (!stackTrace || !stackTrace.stackFrames || stackTrace.stackFrames.length === 0) {
        return { values: [], total: 0, hasMore: false };
      }

      const frameId = stackTrace.stackFrames[0].id;

      // Get scopes for the frame
      const scopes = await session.customRequest('scopes', { frameId });
      if (!scopes || !scopes.scopes) {
        return { values: [], total: 0, hasMore: false };
      }

      // Collect all variable names from all scopes
      const variableNames = new Set<string>();
      for (const scope of scopes.scopes) {
        const variables = await session.customRequest('variables', {
          variablesReference: scope.variablesReference,
        });

        if (variables && variables.variables) {
          for (const variable of variables.variables) {
            variableNames.add(variable.name);
          }
        }
      }

      let vars = Array.from(variableNames);

      // Filter by partial match
      if (partial) {
        const lowerPartial = partial.toLowerCase();
        vars = vars.filter((name) => name.toLowerCase().includes(lowerPartial));
      }

      // Sort by relevance
      vars.sort((a, b) => {
        if (partial) {
          const lowerPartial = partial.toLowerCase();
          const aStarts = a.toLowerCase().startsWith(lowerPartial);
          const bStarts = b.toLowerCase().startsWith(lowerPartial);
          if (aStarts && !bStarts) {
            return -1;
          }
          if (!aStarts && bStarts) {
            return 1;
          }
        }
        return a.localeCompare(b);
      });

      const total = vars.length;
      const values = vars.slice(0, MAX_COMPLETIONS);

      return {
        values,
        total,
        hasMore: total > MAX_COMPLETIONS,
      };
    } catch (error: unknown) {
      // Debug session might not support these requests or not be paused
      this.logger.debug('Could not get variable completions:', error);
      return { values: [], total: 0, hasMore: false };
    }
  }
}
