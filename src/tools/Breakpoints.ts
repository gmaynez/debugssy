// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import * as vscode from 'vscode';
import { DAPClient } from '../dap/Client';
import { formatErrorMessage } from '../errors';
import type {
  BreakpointData,
  BreakpointInfo,
  InspectBreakpointResult,
} from '../routing/types/toolResults';

export type { BreakpointData, BreakpointInfo };

export interface BreakpointResult {
  success: boolean;
  message?: string;
  error?: string;
  breakpoint?: BreakpointData;
}

export class BreakpointTools {
  constructor(private dapClient: DAPClient) {}

  async setBreakpoint(args: {
    filePath: string;
    line: number;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;
  }): Promise<BreakpointResult> {
    try {
      const uri = vscode.Uri.file(args.filePath);
      const location = new vscode.Location(uri, new vscode.Position(args.line - 1, 0));

      const breakpoint = new vscode.SourceBreakpoint(
        location,
        true, // enabled
        args.condition,
        args.hitCondition,
        args.logMessage
      );

      vscode.debug.addBreakpoints([breakpoint]);

      // Find the added breakpoint to get its VS Code-assigned ID
      const addedBreakpoint = vscode.debug.breakpoints.find(
        (bp) =>
          bp instanceof vscode.SourceBreakpoint &&
          bp.location.uri.fsPath === uri.fsPath &&
          bp.location.range.start.line === args.line - 1
      ) as vscode.SourceBreakpoint | undefined;

      return {
        success: true,
        message: `Breakpoint set at ${args.filePath}:${args.line}`,
        breakpoint: {
          id: addedBreakpoint?.id,
          filePath: args.filePath,
          line: args.line,
          enabled: true,
          condition: args.condition,
          hitCondition: args.hitCondition,
          logMessage: args.logMessage,
        },
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: formatErrorMessage(error),
      };
    }
  }

  async removeBreakpoint(args: { filePath: string; line: number }): Promise<BreakpointResult> {
    try {
      const uri = vscode.Uri.file(args.filePath);
      const breakpoints = vscode.debug.breakpoints;

      const toRemove = breakpoints.filter((bp) => {
        if (bp instanceof vscode.SourceBreakpoint) {
          return (
            bp.location.uri.fsPath === uri.fsPath && bp.location.range.start.line === args.line - 1
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
        error: formatErrorMessage(error),
      };
    }
  }

  async listBreakpoints(_args?: Record<string, unknown>): Promise<{
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
        error: formatErrorMessage(error),
      };
    }
  }

  async inspectBreakpoint(args: {
    filePath: string;
    line: number;
  }): Promise<InspectBreakpointResult> {
    try {
      const requestedUri = vscode.Uri.file(args.filePath);
      const editorBreakpoint = this.findSourceBreakpoint(requestedUri.fsPath, args.line);
      const session = vscode.debug.activeDebugSession;
      const executionState = this.dapClient.getExecutionState();
      const stoppedInfo = this.dapClient.getStoppedInfo();
      const signals = new Set<string>();

      if (editorBreakpoint) {
        signals.add('BREAKPOINT_EXISTS');
        if (editorBreakpoint.enabled) {
          signals.add('BREAKPOINT_ENABLED');
        } else {
          signals.add('BREAKPOINT_DISABLED');
        }
        if (editorBreakpoint.condition) {
          signals.add('CONDITION_PRESENT');
        }
        if (editorBreakpoint.hitCondition) {
          signals.add('HIT_CONDITION_PRESENT');
        }
        if (editorBreakpoint.logMessage) {
          signals.add('LOGPOINT_CONFIGURED');
        }
      } else {
        signals.add('BREAKPOINT_NOT_FOUND');
      }

      const result: InspectBreakpointResult['data'] = {
        requestedLocation: {
          filePath: args.filePath,
          line: args.line,
        },
        editorBreakpoint: {
          exists: !!editorBreakpoint,
          id: editorBreakpoint?.id,
          enabled: editorBreakpoint?.enabled,
          condition: editorBreakpoint?.condition,
          hitCondition: editorBreakpoint?.hitCondition,
          logMessage: editorBreakpoint?.logMessage,
        },
        session: {
          hasActiveSession: !!session,
          sessionName: session?.name,
          sessionType: session?.type,
          executionState,
          configurationName:
            typeof session?.configuration?.name === 'string'
              ? session.configuration.name
              : undefined,
        },
        adapterBreakpoint: {
          available: false,
        },
        history: {
          available: false,
          hitCount: 0,
        },
        signals: [],
      };

      if (!session) {
        signals.add('NO_ACTIVE_SESSION');
      } else {
        signals.add('ACTIVE_SESSION_PRESENT');
        if (executionState === 'running') {
          signals.add('SESSION_RUNNING');
        } else if (executionState === 'paused') {
          signals.add('SESSION_PAUSED');
        } else if (executionState === 'terminated') {
          signals.add('SESSION_TERMINATED');
        }
      }

      if (stoppedInfo) {
        result.currentStop = {
          reason: stoppedInfo.reason,
          description: stoppedInfo.description,
          threadId: stoppedInfo.threadId,
          hitBreakpointIds: stoppedInfo.hitBreakpointIds,
        };
      }

      if (session && executionState === 'paused') {
        const { stackFrames } = await this.dapClient.getStackTrace(session, { levels: 1 });
        const currentFrame = stackFrames[0];
        if (currentFrame) {
          result.currentLocation = {
            file: currentFrame.source?.path || currentFrame.source?.name,
            line: currentFrame.line,
            column: currentFrame.column,
            functionName: currentFrame.name,
          };

          if (currentFrame.source?.path === args.filePath && currentFrame.line === args.line) {
            signals.add('CURRENT_FRAME_AT_REQUESTED_LOCATION');
          }
        }
      }

      if (session && editorBreakpoint) {
        const protocolBreakpoint = (await session.getDebugProtocolBreakpoint(editorBreakpoint)) as
          | {
              id?: number;
              verified?: boolean;
              message?: string;
              line?: number;
              column?: number;
              source?: { path?: string; name?: string };
            }
          | undefined;

        if (protocolBreakpoint) {
          result.adapterBreakpoint = {
            available: true,
            id: protocolBreakpoint.id,
            verified: protocolBreakpoint.verified,
            message: protocolBreakpoint.message,
            sourcePath: protocolBreakpoint.source?.path || protocolBreakpoint.source?.name,
            line: protocolBreakpoint.line,
            column: protocolBreakpoint.column,
          };
          signals.add('ADAPTER_BREAKPOINT_AVAILABLE');

          if (protocolBreakpoint.verified === true) {
            signals.add('ADAPTER_BREAKPOINT_VERIFIED');
          } else if (protocolBreakpoint.verified === false) {
            signals.add('ADAPTER_BREAKPOINT_UNVERIFIED');
          }

          const relocatedPath = protocolBreakpoint.source?.path;
          if (
            (typeof protocolBreakpoint.line === 'number' &&
              protocolBreakpoint.line !== args.line) ||
            (relocatedPath && relocatedPath !== args.filePath)
          ) {
            signals.add('ADAPTER_BREAKPOINT_RELOCATED');
          }

          if (typeof protocolBreakpoint.id === 'number') {
            const hitStats = this.dapClient.getBreakpointHitStats(protocolBreakpoint.id);
            result.history = {
              available: true,
              hitCount: hitStats?.hitCount ?? 0,
              lastHitTimestamp: hitStats?.lastHitTimestamp,
            };

            if (result.history.hitCount > 0) {
              signals.add('BREAKPOINT_WAS_HIT_PREVIOUSLY');
            } else {
              signals.add('BREAKPOINT_NEVER_HIT_IN_SESSION');
            }

            if (stoppedInfo?.hitBreakpointIds?.includes(protocolBreakpoint.id)) {
              signals.add('BREAKPOINT_HIT_IN_CURRENT_STOP');
            }
          }
        } else {
          signals.add('ADAPTER_BREAKPOINT_UNAVAILABLE');
        }
      }

      result.signals = Array.from(signals)
        .sort()
        .map((id) => ({ id }));

      return {
        success: true,
        data: result,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: formatErrorMessage(error),
      };
    }
  }

  async toggleBreakpoint(args: { filePath: string; line: number }): Promise<BreakpointResult> {
    try {
      const uri = vscode.Uri.file(args.filePath);
      const breakpoints = vscode.debug.breakpoints;

      const existing = breakpoints.find((bp) => {
        if (bp instanceof vscode.SourceBreakpoint) {
          return (
            bp.location.uri.fsPath === uri.fsPath && bp.location.range.start.line === args.line - 1
          );
        }
        return false;
      }) as vscode.SourceBreakpoint | undefined;

      if (existing) {
        // Toggle the enabled state
        const location = new vscode.Location(uri, new vscode.Position(args.line - 1, 0));
        const newBreakpoint = new vscode.SourceBreakpoint(
          location,
          !existing.enabled,
          existing.condition,
          existing.hitCondition,
          existing.logMessage
        );

        vscode.debug.removeBreakpoints([existing]);
        vscode.debug.addBreakpoints([newBreakpoint]);

        return {
          success: true,
          message: `Breakpoint ${!existing.enabled ? 'enabled' : 'disabled'} at ${args.filePath}:${args.line}`,
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
        error: formatErrorMessage(error),
      };
    }
  }

  async removeAllBreakpoints(_args?: Record<string, unknown>): Promise<BreakpointResult> {
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
        error: formatErrorMessage(error),
      };
    }
  }

  private findSourceBreakpoint(
    filePath: string,
    line: number
  ): vscode.SourceBreakpoint | undefined {
    return vscode.debug.breakpoints.find((bp) => {
      if (bp instanceof vscode.SourceBreakpoint) {
        return bp.location.uri.fsPath === filePath && bp.location.range.start.line === line - 1;
      }
      return false;
    }) as vscode.SourceBreakpoint | undefined;
  }
}
