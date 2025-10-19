import * as vscode from 'vscode';

export interface StackFrame {
    id: number;
    name: string;
    source?: {
        path?: string;
        name?: string;
    };
    line: number;
    column: number;
}

export interface Variable {
    name: string;
    value: string;
    type?: string;
    variablesReference: number;
}

export interface Scope {
    name: string;
    variablesReference: number;
    expensive: boolean;
}

export class DAPClient {
    private currentFrameId: number | undefined;
    private stackFrames: StackFrame[] = [];
    private variableCache: Map<number, Variable[]> = new Map();
    private scopeCache: Map<number, Scope[]> = new Map();

    constructor() {
        // Register debug adapter tracker to intercept DAP messages
        vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker: (session: vscode.DebugSession) => {
                return {
                    onWillReceiveMessage: (message: any) => {
                        // Can inspect outgoing messages if needed
                    },
                    onDidSendMessage: (message: any) => {
                        this.handleDAPMessage(message);
                    },
                    onError: (error: Error) => {
                        console.error('DAP Error:', error);
                    },
                    onExit: (code: number | undefined, signal: string | undefined) => {
                        this.reset();
                    }
                };
            }
        });
    }

    private handleDAPMessage(message: any): void {
        if (message.type === 'response') {
            switch (message.command) {
                case 'stackTrace':
                    if (message.success && message.body?.stackFrames) {
                        this.stackFrames = message.body.stackFrames;
                        if (this.stackFrames.length > 0) {
                            this.currentFrameId = this.stackFrames[0].id;
                        }
                    }
                    break;
                case 'scopes':
                    if (message.success && message.body?.scopes) {
                        const frameId = message.request_seq; // Approximation, might need better tracking
                        this.scopeCache.set(frameId, message.body.scopes);
                    }
                    break;
                case 'variables':
                    if (message.success && message.body?.variables) {
                        const variablesReference = message.request_seq; // Approximation
                        this.variableCache.set(variablesReference, message.body.variables);
                    }
                    break;
            }
        }
    }

    async getStackTrace(session: vscode.DebugSession): Promise<StackFrame[]> {
        try {
            const response = await session.customRequest('stackTrace', {
                threadId: 1 // Simplified: assume thread 1
            });
            if (response?.stackFrames) {
                this.stackFrames = response.stackFrames;
                return this.stackFrames;
            }
        } catch (error) {
            console.error('Error getting stack trace:', error);
        }
        return this.stackFrames;
    }

    async getScopes(session: vscode.DebugSession, frameId: number): Promise<Scope[]> {
        try {
            const response = await session.customRequest('scopes', { frameId });
            if (response?.scopes) {
                return response.scopes;
            }
        } catch (error) {
            console.error('Error getting scopes:', error);
        }
        return [];
    }

    async getVariables(session: vscode.DebugSession, variablesReference: number): Promise<Variable[]> {
        try {
            const response = await session.customRequest('variables', {
                variablesReference
            });
            if (response?.variables) {
                return response.variables;
            }
        } catch (error) {
            console.error('Error getting variables:', error);
        }
        return [];
    }

    async evaluateExpression(
        session: vscode.DebugSession,
        expression: string,
        frameId?: number
    ): Promise<{ result: string; type?: string; variablesReference?: number }> {
        try {
            const response = await session.customRequest('evaluate', {
                expression,
                frameId: frameId || this.currentFrameId,
                context: 'watch'
            });
            return {
                result: response.result,
                type: response.type,
                variablesReference: response.variablesReference
            };
        } catch (error) {
            throw new Error(`Failed to evaluate expression: ${error}`);
        }
    }

    getCurrentFrameId(): number | undefined {
        return this.currentFrameId;
    }

    reset(): void {
        this.currentFrameId = undefined;
        this.stackFrames = [];
        this.variableCache.clear();
        this.scopeCache.clear();
    }
}

