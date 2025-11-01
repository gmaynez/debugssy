// SPDX-License-Identifier: Apache-2.0

import * as vscode from "vscode";

export interface BreakpointResult {
  success: boolean;
  message?: string;
  error?: string;
  breakpoint?: any;
}

export interface BreakpointInfo {
  id: string;
  location: {
    uri: string;
    line: number;
  };
  enabled: boolean;
  condition?: string;
}

export class BreakpointTools {
  async setBreakpoint(args: {
    filePath: string;
    line: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
  }): Promise<BreakpointResult> {
    try {
      const uri = vscode.Uri.file(args.filePath);
      const location = new vscode.Location(
        uri,
        new vscode.Position(args.line - 1, 0),
      );

      const breakpoint = new vscode.SourceBreakpoint(
        location,
        true, // enabled
        args.condition,
        args.hitCondition,
        args.logMessage,
      );

      vscode.debug.addBreakpoints([breakpoint]);

      return {
        success: true,
        message: `Breakpoint set at ${args.filePath}:${args.line}`,
        breakpoint: {
          filePath: args.filePath,
          line: args.line,
          enabled: true,
          condition: args.condition,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async removeBreakpoint(args: {
    filePath: string;
    line: number;
  }): Promise<BreakpointResult> {
    try {
      const uri = vscode.Uri.file(args.filePath);
      const breakpoints = vscode.debug.breakpoints;

      const toRemove = breakpoints.filter((bp) => {
        if (bp instanceof vscode.SourceBreakpoint) {
          return (
            bp.location.uri.fsPath === uri.fsPath &&
            bp.location.range.start.line === args.line - 1
          );
        }
        return false;
      });

      if (toRemove.length === 0) {
        return {
          success: false,
          error: `No breakpoint found at ${args.filePath}:${args.line}`,
        };
      }

      vscode.debug.removeBreakpoints(toRemove);

      return {
        success: true,
        message: `Removed ${toRemove.length} breakpoint(s) at ${args.filePath}:${args.line}`,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async listBreakpoints(): Promise<{
    success: boolean;
    breakpoints: BreakpointInfo[];
    error?: string;
  }> {
    try {
      const breakpoints = vscode.debug.breakpoints;
      const result: BreakpointInfo[] = [];

      for (const bp of breakpoints) {
        if (bp instanceof vscode.SourceBreakpoint) {
          result.push({
            id: bp.id,
            location: {
              uri: bp.location.uri.fsPath,
              line: bp.location.range.start.line + 1,
            },
            enabled: bp.enabled,
            condition: bp.condition,
          });
        }
      }

      return {
        success: true,
        breakpoints: result,
      };
    } catch (error: unknown) {
      return {
        success: false,
        breakpoints: [],
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async toggleBreakpoint(args: {
    filePath: string;
    line: number;
  }): Promise<BreakpointResult> {
    try {
      const uri = vscode.Uri.file(args.filePath);
      const breakpoints = vscode.debug.breakpoints;

      const existing = breakpoints.find((bp) => {
        if (bp instanceof vscode.SourceBreakpoint) {
          return (
            bp.location.uri.fsPath === uri.fsPath &&
            bp.location.range.start.line === args.line - 1
          );
        }
        return false;
      }) as vscode.SourceBreakpoint | undefined;

      if (existing) {
        // Toggle the enabled state
        const location = new vscode.Location(
          uri,
          new vscode.Position(args.line - 1, 0),
        );
        const newBreakpoint = new vscode.SourceBreakpoint(
          location,
          !existing.enabled,
          existing.condition,
          existing.hitCondition,
          existing.logMessage,
        );

        vscode.debug.removeBreakpoints([existing]);
        vscode.debug.addBreakpoints([newBreakpoint]);

        return {
          success: true,
          message: `Breakpoint ${!existing.enabled ? "enabled" : "disabled"} at ${args.filePath}:${args.line}`,
        };
      } else {
        return {
          success: false,
          error: `No breakpoint found at ${args.filePath}:${args.line}`,
        };
      }
    } catch (error: unknown) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  async removeAllBreakpoints(): Promise<BreakpointResult> {
    try {
      const breakpoints = vscode.debug.breakpoints;
      vscode.debug.removeBreakpoints(breakpoints);

      return {
        success: true,
        message: `Removed all ${breakpoints.length} breakpoints`,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}
