// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

/**
 * Centralized logging utility using VS Code Output Channel.
 * Provides better logging than console.log for production extensions.
 */
export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Debugssy');
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Log informational message
     */
    info(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('INFO', message, args);
        this.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Log warning message
     */
    warn(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('WARN', message, args);
        this.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Log error message
     */
    error(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('ERROR', message, args);
        this.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Log debug message (only in development)
     */
    debug(message: string, ...args: unknown[]): void {
        const formattedMessage = this.formatMessage('DEBUG', message, args);
        this.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Show the output channel to the user
     */
    show(): void {
        this.outputChannel.show();
    }

    /**
     * Dispose of the output channel
     */
    dispose(): void {
        this.outputChannel.dispose();
    }

    /**
     * Format log message with timestamp and level
     */
    private formatMessage(level: string, message: string, args: unknown[]): string {
        const timestamp = new Date().toISOString();
        const argsStr = args.length > 0 ? ' ' + args.map(arg => this.stringify(arg)).join(' ') : '';
        return `[${timestamp}] [${level}] ${message}${argsStr}`;
    }

    /**
     * Safely stringify any value for logging
     */
    private stringify(value: unknown): string {
        if (value === null) {
            return 'null';
        }
        if (value === undefined) {
            return 'undefined';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        if (value instanceof Error) {
            return `${value.name}: ${value.message}${value.stack ? '\n' + value.stack : ''}`;
        }

        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }
}

