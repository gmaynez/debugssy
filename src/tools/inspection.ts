import * as vscode from 'vscode';
import { DAPClient } from '../dap/client';

export interface InspectionResult {
    success: boolean;
    data?: any;
    error?: string;
}

export class InspectionTools {
    constructor(private dapClient: DAPClient) {}

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
            if (stackFrames.length === 0) {
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
                if (args.scope && scope.name !== args.scope) {
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

    async getCallStack(): Promise<InspectionResult> {
        try {
            const session = vscode.debug.activeDebugSession;
            if (!session) {
                return {
                    success: false,
                    error: 'No active debug session'
                };
            }

            const stackFrames = await this.dapClient.getStackTrace(session);

            return {
                success: true,
                data: {
                    frames: stackFrames.map((frame) => ({
                        id: frame.id,
                        name: frame.name,
                        source: frame.source?.path || frame.source?.name || 'unknown',
                        line: frame.line,
                        column: frame.column
                    }))
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
        try {
            // VS Code doesn't expose watch expressions via API directly
            // We would need to track them separately or access internal state
            // For now, return a message indicating this limitation
            return {
                success: false,
                error: 'Watch expressions are not directly accessible via VS Code API. Use evaluate_expression instead.'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message
            };
        }
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
}

