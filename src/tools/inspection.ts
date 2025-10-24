// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';
import { DAPClient } from '../dap/client';
import { ConfigManager } from '../config';
import { DEFAULT_BREAKPOINT_TIMEOUT_MS } from '../constants';

export interface InspectionResult {
    success: boolean;
    data?: any;
    error?: string;
}

export class InspectionTools {
    constructor(
        private dapClient: DAPClient,
        private configManager?: ConfigManager
    ) {}

    async getDebugState(): Promise<InspectionResult> {
        try {
            const session = vscode.debug.activeDebugSession;
            const executionState = this.dapClient.getExecutionState();
            const stoppedInfo = this.dapClient.getStoppedInfo();

            if (!session) {
                return {
                    success: true,
                    data: {
                        hasActiveSession: false,
                        executionState: 'not_started'
                    }
                };
            }

            const result: any = {
                hasActiveSession: true,
                sessionName: session.name,
                sessionType: session.type,
                executionState
            };

            // If paused, include location and reason information
            if (executionState === 'paused' && stoppedInfo) {
                // Try to get current stack frame for location
                const stackFrames = await this.dapClient.getStackTrace(session);
                const currentFrame = stackFrames[0];

                result.stoppedInfo = {
                    reason: stoppedInfo.reason,
                    description: stoppedInfo.description,
                    threadId: stoppedInfo.threadId,
                    allThreadsStopped: stoppedInfo.allThreadsStopped
                };

                if (currentFrame) {
                    result.currentLocation = {
                        file: currentFrame.source?.path || currentFrame.source?.name,
                        line: currentFrame.line,
                        column: currentFrame.column,
                        functionName: currentFrame.name
                    };
                }

                if (stoppedInfo.hitBreakpointIds && stoppedInfo.hitBreakpointIds.length > 0) {
                    result.stoppedInfo.hitBreakpointIds = stoppedInfo.hitBreakpointIds;
                }
            }

            return {
                success: true,
                data: result
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async waitForBreakpoint(args: { timeout?: number; automationLevel: 'assisted' | 'full' }): Promise<InspectionResult> {
        try {
            // Check automation level
            if (args.automationLevel !== 'full') {
                return {
                    success: false,
                    error: 'wait_for_breakpoint is only available in full automation mode'
                };
            }

            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            // CRITICAL: Check if already paused to avoid race condition
            // If we're already paused, return immediately with current state
            const currentState = this.dapClient.getExecutionState();
            if (currentState === 'paused') {
                return await this.getDebugState();
            }

            // Use provided timeout, fallback to config, then default
            const defaultTimeout = this.configManager?.getConfig().waitForBreakpointTimeout || DEFAULT_BREAKPOINT_TIMEOUT_MS;
            const timeout = args.timeout || defaultTimeout;

            // Wait for the next paused state
            let disposable: vscode.Disposable | undefined;
            try {
                const result = await Promise.race([
                    new Promise<InspectionResult>((resolve) => {
                        disposable = this.dapClient.onStateChange((state) => {
                            if (state === 'paused') {
                                // Get the current state info
                                this.getDebugState().then(resolve);
                            }
                        });
                    }),
                    new Promise<InspectionResult>((_, reject) => {
                        setTimeout(() => reject(new Error(`Timeout waiting for breakpoint after ${timeout}ms`)), timeout);
                    })
                ]);

                return result;
            } finally {
                // Always clean up the disposable, whether we succeeded or timed out
                if (disposable) {
                    disposable.dispose();
                }
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getVariables(args: { scope?: string; frameId?: number }): Promise<InspectionResult> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            // Get stack trace first
            const stackFrames = await this.dapClient.getStackTrace(session);
            if (stackFrames.length === 0 || !stackFrames[0]) {
                return {
                    success: false,
                    error: 'No stack frames available'
                };
            }

            const frameId = args.frameId !== undefined ? args.frameId : stackFrames[0].id;

            // Get scopes for the frame
            const scopes = await this.dapClient.getScopes(session, frameId);
            
            const result: any = {
                frameId,
                scopes: []
            };

            // Get variables for each scope
            for (const scope of scopes) {
                // Filter by scope if specified - use startsWith to match "Local: functionName" with "Local"
                if (args.scope && !scope.name.toLowerCase().startsWith(args.scope.toLowerCase())) {
                    continue;
                }

                const variables = await this.dapClient.getVariables(session, scope.variablesReference);
                result.scopes.push({
                    name: scope.name,
                    variables: variables.map((v) => ({
                        name: v.name,
                        value: v.value,
                        type: v.type
                    }))
                });
            }

            return {
                success: true,
                data: result
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getCallStack(args?: { maxDepth?: number }): Promise<InspectionResult> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            const stackFrames = await this.dapClient.getStackTrace(session);
            
            // Default to 20 frames to reduce verbosity
            const maxDepth = args?.maxDepth ?? 20;
            const limitedFrames = stackFrames.slice(0, maxDepth);

            return {
                success: true,
                data: {
                    frames: limitedFrames.map((frame) => ({
                        id: frame.id,
                        name: frame.name,
                        source: frame.source?.path || frame.source?.name || 'unknown',
                        line: frame.line,
                        column: frame.column
                    })),
                    totalFrames: stackFrames.length,
                    truncated: stackFrames.length > maxDepth
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async evaluateExpression(args: { expression: string; frameId?: number }): Promise<InspectionResult> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            const result = await this.dapClient.evaluateExpression(
                session,
                args.expression,
                args.frameId
            );

            return {
                success: true,
                data: {
                    expression: args.expression,
                    result: result.result,
                    type: result.type
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getWatches(): Promise<InspectionResult> {
        // VS Code doesn't expose watch expressions via API directly
        // We would need to track them separately or access internal state
        // For now, return a message indicating this limitation
        return {
            success: false,
            error: 'Watch expressions are not directly accessible via VS Code API. Use evaluate_expression instead.'
        };
    }

    async getThreads(): Promise<InspectionResult> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            const response = await session.customRequest('threads');
            
            return {
                success: true,
                data: {
                    threads: response.threads || []
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getConsoleOutput(args?: { 
        category?: string; 
        limit?: number; 
        since?: number;
        clear?: boolean;
    }): Promise<InspectionResult> {
        try {
            // Default to 50 entries to reduce verbosity
            const limit = args?.limit ?? 50;
            
            const output = this.dapClient.getConsoleOutput({
                category: args?.category,
                limit: limit,
                since: args?.since,
                clear: args?.clear
            });

            return {
                success: true,
                data: {
                    entries: output.map(entry => ({
                        category: entry.category,
                        output: entry.output,
                        timestamp: entry.timestamp,
                        source: entry.source?.path || entry.source?.name,
                        line: entry.line
                    })),
                    count: output.length,
                    truncated: limit < 1000 // Indicate if there might be more
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async clearConsoleOutput(): Promise<InspectionResult> {
        try {
            this.dapClient.clearConsoleOutput();
            return {
                success: true,
                data: {
                    message: 'Console output buffer cleared'
                }
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

