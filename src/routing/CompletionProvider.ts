// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { filterAndSortByRelevance } from '../utils/sortByRelevance';
import { MAX_COMPLETIONS, MAX_FILE_CACHE_SIZE, MAX_VARIABLE_COMPLETION_SCOPES } from '../constants';

/**
 * Provides completion suggestions for MCP prompt arguments.
 * Helps users autocomplete file paths, function names, variable names, etc.
 *
 * Uses lazy initialization to avoid setting up file watchers and caches
 * until a client actually requests completions. This ensures we don't
 * allocate resources for MCP clients that don't support or use completions.
 */
export class CompletionProvider {
  private logger: Logger;
  // Map workspace folder URI to array of relative file paths
  private fileCache: Map<string, string[]> = new Map();
  private cacheInitialized = false;
  private cacheInitializing: Promise<void> | null = null;
  private disposables: vscode.Disposable[] = [];
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private watchersInitialized = false;
  private static readonly FILE_SEARCH_EXCLUDE =
    '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/build/**}';

  constructor() {
    this.logger = Logger.getInstance();
    // Note: File system watchers are set up lazily on first completion request
    // to avoid resource allocation for clients that don't use completions
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
    this.cacheInitialized = false;
    this.watchersInitialized = false;
  }

  /**
   * Provides completions for a specific prompt argument.
   * Lazily initializes file system watchers on first call.
   */
  async getCompletions(
    _promptName: string,
    argumentName: string,
    partialValue: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    // Lazy initialization: set up file watchers only when completions are first requested
    // This avoids resource allocation for MCP clients that don't support/use completions
    this.ensureWatchersInitialized();

    try {
      switch (argumentName) {
        case 'filePath':
        case 'entryPoint':
        case 'loopLocation':
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

    // Filter and sort by relevance
    filePaths = filterAndSortByRelevance(filePaths, partial);

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
   * Ensures file system watchers are initialized.
   * Called lazily on first completion request to avoid resource allocation
   * for MCP clients that don't support or use completions.
   */
  private ensureWatchersInitialized(): void {
    if (this.watchersInitialized) {
      return;
    }
    this.watchersInitialized = true;
    this.logger.debug('Initializing completion file watchers (lazy initialization)');
    this.setupFileSystemWatchers();
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

    // Rebuild cache and watchers to include new folders
    if (event.added.length > 0) {
      this.cacheInitialized = false;
      this.cacheInitializing = null;

      // Dispose old watchers and setup new ones
      this.fileWatchers.forEach((w) => w.dispose());
      this.fileWatchers = [];

      // Only recreate watchers if they were previously initialized
      // (i.e., a client has actually requested completions)
      if (this.watchersInitialized) {
        this.watchersInitialized = false; // Reset to trigger re-initialization
        this.ensureWatchersInitialized();
      }
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

    // Filter and sort by relevance
    const functions = filterAndSortByRelevance(Array.from(functionNames), partial);

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
   * Gets variable name completions from the debug session or static code analysis.
   * Prioritizes runtime values from an active debug session, then falls back to
   * VS Code's symbol providers to find variable declarations in source code.
   */
  private async getVariableNameCompletions(
    partial: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    // Try to get variables from active debug session first (runtime values)
    const debugVars = await this.getVariablesFromDebugSession(partial);
    if (debugVars.total > 0) {
      return debugVars;
    }

    // Fall back to static analysis from source code
    return await this.getVariablesFromSymbols(partial);
  }

  /**
   * Gets variable names from the active debug session (runtime values).
   */
  private async getVariablesFromDebugSession(
    partial: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    const session = vscode.debug.activeDebugSession;
    if (!session) {
      return { values: [], total: 0, hasMore: false };
    }

    try {
      const debugApi = vscode.debug as typeof vscode.debug & {
        activeStackFrame?: vscode.DebugStackFrame;
      };
      const activeStackFrame = debugApi.activeStackFrame;
      const activeStackFrameInfo =
        (activeStackFrame as unknown as {
          thread?: { id?: number };
          threadId?: number;
          id?: number;
          frameId?: number;
        }) ?? undefined;
      const activeThreadId =
        activeStackFrameInfo?.thread?.id ?? activeStackFrameInfo?.threadId ?? undefined;
      const preferredFrameId =
        activeStackFrameInfo?.id ?? activeStackFrameInfo?.frameId ?? undefined;
      const candidateThreadIds: number[] = [];
      const seenThreadIds = new Set<number>();

      if (
        activeStackFrame &&
        activeStackFrame.session.id === session.id &&
        typeof activeThreadId === 'number'
      ) {
        candidateThreadIds.push(activeThreadId);
        seenThreadIds.add(activeThreadId);
      }

      let threadsResponse: { threads?: Array<{ id: number }> } | undefined;
      try {
        threadsResponse = await session.customRequest('threads');
      } catch (threadsError) {
        this.logger.debug('Could not retrieve threads for variable completions:', threadsError);
      }

      if (threadsResponse?.threads) {
        for (const thread of threadsResponse.threads) {
          if (thread && typeof thread.id === 'number' && !seenThreadIds.has(thread.id)) {
            candidateThreadIds.push(thread.id);
            seenThreadIds.add(thread.id);
          }
        }
      }

      if (candidateThreadIds.length === 0) {
        return { values: [], total: 0, hasMore: false };
      }

      let frameId: number | undefined;

      for (const candidateThreadId of candidateThreadIds) {
        let stackTrace;
        try {
          // Only fetch top 10 frames for completion - we just need the current frame ID
          stackTrace = await session.customRequest('stackTrace', {
            threadId: candidateThreadId,
            levels: 10,
          });
        } catch (stackTraceError) {
          this.logger.debug(
            `Failed to retrieve stack trace for thread ${candidateThreadId}:`,
            stackTraceError
          );
          continue;
        }

        const frames = stackTrace?.stackFrames;
        if (!Array.isArray(frames) || frames.length === 0) {
          continue;
        }

        if (
          activeStackFrame &&
          activeStackFrame.session.id === session.id &&
          typeof activeThreadId === 'number' &&
          activeThreadId === candidateThreadId
        ) {
          const matchingFrame =
            typeof preferredFrameId === 'number'
              ? frames.find((frame: { id: number }) => frame.id === preferredFrameId)
              : undefined;
          if (matchingFrame) {
            frameId = matchingFrame.id;
            break;
          }
        }

        frameId = frames[0].id;
        break;
      }

      if (frameId === undefined) {
        return { values: [], total: 0, hasMore: false };
      }

      // Get scopes for the frame
      const scopesResponse = await session.customRequest('scopes', { frameId });
      if (!scopesResponse || !Array.isArray(scopesResponse.scopes)) {
        return { values: [], total: 0, hasMore: false };
      }

      // Prefer inexpensive scopes (locals/closures) and keep query count bounded
      const normalizedScopes = scopesResponse.scopes
        .filter((scope: any) => scope && typeof scope.variablesReference === 'number')
        .sort((a: any, b: any) => {
          const aExpensive = Boolean(a?.expensive);
          const bExpensive = Boolean(b?.expensive);
          if (aExpensive === bExpensive) {
            return 0;
          }
          return aExpensive ? 1 : -1;
        });

      const scopesToQuery = normalizedScopes.slice(0, MAX_VARIABLE_COMPLETION_SCOPES);
      if (scopesToQuery.length === 0) {
        return { values: [], total: 0, hasMore: false };
      }

      const scopeVariables = await Promise.all(
        scopesToQuery.map(async (scope: any) => {
          try {
            const response = await session.customRequest('variables', {
              variablesReference: scope.variablesReference,
            });
            return Array.isArray(response?.variables) ? response.variables : [];
          } catch (error) {
            this.logger.debug(
              `Failed to retrieve variables for scope ${scope?.name ?? scope?.variablesReference}:`,
              error
            );
            return [];
          }
        })
      );

      const variableNames = new Set<string>();
      for (const variables of scopeVariables) {
        for (const variable of variables) {
          if (variable?.name) {
            variableNames.add(variable.name);
          }
        }
      }

      // Filter and sort by relevance
      const vars = filterAndSortByRelevance(Array.from(variableNames), partial);

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

  /**
   * Gets variable names from VS Code's symbol providers (static analysis).
   * Searches for variables, properties, fields, and constants in the active editor and workspace.
   * Prioritizes variables from the currently open document over workspace symbols.
   */
  private async getVariablesFromSymbols(
    partial: string
  ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
    const activeDocVariables = new Set<string>();
    const workspaceVariables = new Set<string>();

    // Try to get symbols from the active editor first
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        activeEditor.document.uri
      );

      if (symbols) {
        this.extractVariableNames(symbols, activeDocVariables);
      }
    }

    // If we don't have many results, search workspace symbols (with reasonable limit for performance)
    if (activeDocVariables.size < 10) {
      const workspaceSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        partial || ''
      );

      if (workspaceSymbols) {
        // Limit workspace symbols to avoid performance issues in large projects
        const maxWorkspaceSymbols = 100;
        let count = 0;

        for (const symbol of workspaceSymbols) {
          if (count >= maxWorkspaceSymbols) {
            break;
          }

          if (
            symbol.kind === vscode.SymbolKind.Variable ||
            symbol.kind === vscode.SymbolKind.Property ||
            symbol.kind === vscode.SymbolKind.Field ||
            symbol.kind === vscode.SymbolKind.Constant ||
            symbol.kind === vscode.SymbolKind.EnumMember
          ) {
            // Only add if not already in active doc variables
            if (!activeDocVariables.has(symbol.name)) {
              workspaceVariables.add(symbol.name);
              count++;
            }
          }
        }
      }
    }

    // Filter and sort both sets by relevance
    const activeDocVars = filterAndSortByRelevance(Array.from(activeDocVariables), partial);
    const workspaceVars = filterAndSortByRelevance(Array.from(workspaceVariables), partial);

    // Combine: active doc variables first, then workspace variables
    const allVars = [...activeDocVars, ...workspaceVars];
    const total = allVars.length;
    const values = allVars.slice(0, MAX_COMPLETIONS);

    return {
      values,
      total,
      hasMore: total > MAX_COMPLETIONS,
    };
  }

  /**
   * Recursively extracts variable, property, field, and constant names from document symbols.
   */
  private extractVariableNames(symbols: vscode.DocumentSymbol[], variableNames: Set<string>): void {
    for (const symbol of symbols) {
      if (
        symbol.kind === vscode.SymbolKind.Variable ||
        symbol.kind === vscode.SymbolKind.Property ||
        symbol.kind === vscode.SymbolKind.Field ||
        symbol.kind === vscode.SymbolKind.Constant ||
        symbol.kind === vscode.SymbolKind.EnumMember
      ) {
        variableNames.add(symbol.name);
      }

      // Recursively check children (properties inside classes, local variables inside functions, etc.)
      if (symbol.children && symbol.children.length > 0) {
        this.extractVariableNames(symbol.children, variableNames);
      }
    }
  }
}
