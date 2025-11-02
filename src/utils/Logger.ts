// SPDX-License-Identifier: Apache-2.0

import * as vscode from 'vscode';

/**
 * Centralized logging utility using VS Code Log Output Channel.
 * Provides automatic log formatting with syntax highlighting and filtering.
 */
export class Logger {
  private static instance: Logger;
  private outputChannel: vscode.LogOutputChannel;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel('Debugssy', {
      log: true,
    });
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
    this.outputChannel.info(this.formatArgs(message, args));
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: unknown[]): void {
    this.outputChannel.warn(this.formatArgs(message, args));
  }

  /**
   * Log error message
   */
  error(message: string, ...args: unknown[]): void {
    this.outputChannel.error(this.formatArgs(message, args));
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: unknown[]): void {
    this.outputChannel.debug(this.formatArgs(message, args));
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
   * Format message with arguments
   * LogOutputChannel handles timestamp and level formatting automatically
   */
  private formatArgs(message: string, args: unknown[]): string {
    const argsStr = args.length > 0 ? ' ' + args.map((arg) => this.stringify(arg)).join(' ') : '';
    return `${message}${argsStr}`;
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
