// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import * as path from 'path';
import {Logger} from '../utils/Logger';
import {MAX_COMPLETIONS, MAX_FILE_SEARCH_RESULTS} from '../constants';

/**
 * Provides completion suggestions for MCP prompt arguments.
 * Helps users autocomplete file paths, function names, variable names, etc.
 */
export class CompletionProvider {
    private logger: Logger;

    constructor() {
        this.logger = Logger.getInstance();
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
                    return {values: [], total: 0, hasMore: false};
            }
        } catch (error: unknown) {
            this.logger.error(`Error getting completions for ${argumentName}:`, error);
            return {values: [], total: 0, hasMore: false};
        }
    }

    /**
     * Gets file path completions from the workspace.
     */
    private async getFilePathCompletions(
        partial: string
    ): Promise<{ values: string[]; total: number; hasMore: boolean }> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return {values: [], total: 0, hasMore: false};
        }

        const workspaceFolder = workspaceFolders[0];
        if (!workspaceFolder) {
            return {values: [], total: 0, hasMore: false};
        }

        // Search for files matching the partial string
        const searchPattern = partial ? `**/*${partial}*` : '**/*';

        // Exclude common directories to improve performance
        const excludePattern = '{**/node_modules/**,**/out/**,**/dist/**,**/.git/**,**/build/**}';

        const files = await vscode.workspace.findFiles(
            searchPattern,
            excludePattern,
            MAX_FILE_SEARCH_RESULTS
        );

        // Convert URIs to relative paths
        const workspaceRoot = workspaceFolder.uri.fsPath;
        let filePaths = files.map(uri => {
            const relativePath = path.relative(workspaceRoot, uri.fsPath);
            // Normalize path separators to forward slashes for consistency
            return relativePath.replace(/\\/g, '/');
        });

        // Filter by partial match (case-insensitive)
        if (partial) {
            const lowerPartial = partial.toLowerCase();
            filePaths = filePaths.filter(p =>
                p.toLowerCase().includes(lowerPartial)
            );
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
            hasMore: total > MAX_COMPLETIONS
        };
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
                    if (symbol.kind === vscode.SymbolKind.Function ||
                        symbol.kind === vscode.SymbolKind.Method) {
                        functionNames.add(symbol.name);
                    }
                }
            }
        }

        let functions = Array.from(functionNames);

        // Filter by partial match
        if (partial) {
            const lowerPartial = partial.toLowerCase();
            functions = functions.filter(name =>
                name.toLowerCase().includes(lowerPartial)
            );
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
            hasMore: total > MAX_COMPLETIONS
        };
    }

    /**
     * Recursively extracts function and method names from document symbols.
     */
    private extractFunctionNames(
        symbols: vscode.DocumentSymbol[],
        functionNames: Set<string>
    ): void {
        for (const symbol of symbols) {
            if (symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Method) {
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
            return {values: [], total: 0, hasMore: false};
        }

        try {
            // Get the current stack frame
            const stackTrace = await session.customRequest('stackTrace', {
                threadId: 1
            });

            if (!stackTrace || !stackTrace.stackFrames || stackTrace.stackFrames.length === 0) {
                return {values: [], total: 0, hasMore: false};
            }

            const frameId = stackTrace.stackFrames[0].id;

            // Get scopes for the frame
            const scopes = await session.customRequest('scopes', {frameId});
            if (!scopes || !scopes.scopes) {
                return {values: [], total: 0, hasMore: false};
            }

            // Collect all variable names from all scopes
            const variableNames = new Set<string>();
            for (const scope of scopes.scopes) {
                const variables = await session.customRequest('variables', {
                    variablesReference: scope.variablesReference
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
                vars = vars.filter(name =>
                    name.toLowerCase().includes(lowerPartial)
                );
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
                hasMore: total > MAX_COMPLETIONS
            };
        } catch (error: unknown) {
            // Debug session might not support these requests or not be paused
            this.logger.debug('Could not get variable completions:', error);
            return {values: [], total: 0, hasMore: false};
        }
    }
}

