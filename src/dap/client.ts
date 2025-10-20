import * as vscode from 'vscode';
import { DEFAULT_THREAD_ID } from '../constants';

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

export type ExecutionState = 'not_started' | 'running' | 'paused' | 'terminated';

export interface StoppedInfo {
    threadId: number;
    reason: string;
    description?: string;
    text?: string;
    allThreadsStopped?: boolean;
    hitBreakpointIds?: number[];
}

export class DAPClient {
    private currentFrameId: number | undefined;
    private stackFrames: StackFrame[] = [];
    private variableCache: Map<number, Variable[]> = new Map();
    private scopeCache: Map<number, Scope[]> = new Map();
    private executionState: ExecutionState = 'not_started';
    private stoppedInfo: StoppedInfo | undefined;
    private stateChangeEmitter = new vscode.EventEmitter<ExecutionState>();
    public readonly onStateChange = this.stateChangeEmitter.event;

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
        } else if (message.type === 'event') {
            switch (message.event) {
                case 'stopped':
                    this.executionState = 'paused';
                    this.stoppedInfo = {
                        threadId: message.body?.threadId,
                        reason: message.body?.reason || 'unknown',
                        description: message.body?.description,
                        text: message.body?.text,
                        allThreadsStopped: message.body?.allThreadsStopped,
                        hitBreakpointIds: message.body?.hitBreakpointIds
                    };
                    this.stateChangeEmitter.fire('paused');
                    break;
                case 'continued':
                    this.executionState = 'running';
                    this.stoppedInfo = undefined;
                    this.stateChangeEmitter.fire('running');
                    break;
                case 'terminated':
                    this.executionState = 'terminated';
                    this.stoppedInfo = undefined;
                    this.stateChangeEmitter.fire('terminated');
                    break;
            }
        }
    }

    async getStackTrace(session: vscode.DebugSession): Promise<StackFrame[]> {
        try {
            const response = await session.customRequest('stackTrace', {
                threadId: DEFAULT_THREAD_ID
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

    getExecutionState(): ExecutionState {
        return this.executionState;
    }

    getStoppedInfo(): StoppedInfo | undefined {
        return this.stoppedInfo;
    }

    isReadyForEvaluation(): boolean {
        return this.executionState === 'paused' && this.stoppedInfo !== undefined;
    }

    reset(): void {
        this.currentFrameId = undefined;
        this.stackFrames = [];
        this.variableCache.clear();
        this.scopeCache.clear();
        this.executionState = 'not_started';
        this.stoppedInfo = undefined;
    }

    dispose(): void {
        this.stateChangeEmitter.dispose();
    }
}

