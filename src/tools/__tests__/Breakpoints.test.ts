// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BreakpointTools } from '../Breakpoints';
import { vscode } from '../../__tests__/setup';
import { DAPClient } from '../../dap/Client';
import {
  MockUri,
  MockPosition,
  MockLocation,
  MockRange,
  MockSourceBreakpoint,
} from '../../__tests__/helpers/vscode-mock';

describe('BreakpointTools', () => {
  let tools: BreakpointTools;
  let dapClient: DAPClient;

  beforeEach(() => {
    vi.clearAllMocks();
    dapClient = {
      getExecutionState: vi.fn().mockReturnValue('not_started'),
      getStoppedInfo: vi.fn().mockReturnValue(undefined),
      getStackTrace: vi.fn().mockResolvedValue({ stackFrames: [] }),
      getBreakpointHitStats: vi.fn().mockReturnValue(undefined),
    } as any;
    tools = new BreakpointTools(dapClient);
    // Reset breakpoints array
    vscode.debug.breakpoints = [];
  });

  describe('setBreakpoint', () => {
    it('should set a breakpoint at specified location', async () => {
      const args = {
        filePath: '/test/file.js',
        line: 10,
      };

      const result = await tools.setBreakpoint(args);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Breakpoint set at /test/file.js:10');
      expect(result.breakpoint).toEqual({
        filePath: args.filePath,
        line: args.line,
        enabled: true,
        condition: undefined,
      });
      expect(vscode.debug.addBreakpoints).toHaveBeenCalledTimes(1);
    });

    it('should set a conditional breakpoint', async () => {
      const args = {
        filePath: '/test/file.js',
        line: 15,
        condition: 'x > 10',
      };

      const result = await tools.setBreakpoint(args);

      expect(result.success).toBe(true);
      expect(result.breakpoint?.condition).toBe('x > 10');
      expect(vscode.debug.addBreakpoints).toHaveBeenCalledTimes(1);
    });

    it('should set a breakpoint with hit condition', async () => {
      const args = {
        filePath: '/test/file.js',
        line: 20,
        hitCondition: '3',
      };

      const result = await tools.setBreakpoint(args);

      expect(result.success).toBe(true);
      expect(vscode.debug.addBreakpoints).toHaveBeenCalledTimes(1);

      const addedBreakpoint = (vscode.debug.addBreakpoints as any).mock.calls[0][0][0];
      expect(addedBreakpoint.hitCondition).toBe('3');
    });

    it('should set a logpoint', async () => {
      const args = {
        filePath: '/test/file.js',
        line: 25,
        logMessage: 'Value is {x}',
      };

      const result = await tools.setBreakpoint(args);

      expect(result.success).toBe(true);
      expect(vscode.debug.addBreakpoints).toHaveBeenCalledTimes(1);

      const addedBreakpoint = (vscode.debug.addBreakpoints as any).mock.calls[0][0][0];
      expect(addedBreakpoint.logMessage).toBe('Value is {x}');
    });

    it('should handle errors when setting breakpoint', async () => {
      // Mock addBreakpoints to throw an error
      vi.spyOn(vscode.debug, 'addBreakpoints').mockImplementation(() => {
        throw new Error('Failed to add breakpoint');
      });

      const result = await tools.setBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to add breakpoint');
    });
  });

  describe('removeBreakpoint', () => {
    it('should remove a breakpoint at specified location', async () => {
      // Set up existing breakpoint
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0); // line 10 in 0-based
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const breakpoint = new MockSourceBreakpoint(location);

      vscode.debug.breakpoints = [breakpoint as any];

      const result = await tools.removeBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Removed 1 breakpoint(s)');
      expect(vscode.debug.removeBreakpoints).toHaveBeenCalledTimes(1);
    });

    it('should return error when no breakpoint found', async () => {
      vscode.debug.breakpoints = [];

      const result = await tools.removeBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No breakpoint found');
    });

    it('should only remove breakpoint at exact location', async () => {
      // Set up multiple breakpoints
      const uri1 = MockUri.file('/test/file.js');
      const position1 = new MockPosition(9, 0);
      const range1 = new MockRange(position1, position1);
      const location1 = new MockLocation(uri1, range1);
      const bp1 = new MockSourceBreakpoint(location1);

      const uri2 = MockUri.file('/test/file.js');
      const position2 = new MockPosition(19, 0); // Different line
      const range2 = new MockRange(position2, position2);
      const location2 = new MockLocation(uri2, range2);
      const bp2 = new MockSourceBreakpoint(location2);

      vscode.debug.breakpoints = [bp1 as any, bp2 as any];

      const result = await tools.removeBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(true);
      expect(vscode.debug.removeBreakpoints).toHaveBeenCalledWith([bp1]);
    });

    it('should handle errors when removing breakpoint', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const breakpoint = new MockSourceBreakpoint(location);

      vscode.debug.breakpoints = [breakpoint as any];

      vi.spyOn(vscode.debug, 'removeBreakpoints').mockImplementation(() => {
        throw new Error('Failed to remove breakpoint');
      });

      const result = await tools.removeBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to remove breakpoint');
    });
  });

  describe('listBreakpoints', () => {
    it('should list all breakpoints', async () => {
      // Set up multiple breakpoints
      const uri1 = MockUri.file('/test/file1.js');
      const position1 = new MockPosition(9, 0);
      const range1 = new MockRange(position1, position1);
      const location1 = new MockLocation(uri1, range1);
      const bp1 = new MockSourceBreakpoint(location1, true);

      const uri2 = MockUri.file('/test/file2.js');
      const position2 = new MockPosition(19, 0);
      const range2 = new MockRange(position2, position2);
      const location2 = new MockLocation(uri2, range2);
      const bp2 = new MockSourceBreakpoint(location2, false);

      vscode.debug.breakpoints = [bp1 as any, bp2 as any];

      const result = await tools.listBreakpoints();

      expect(result.success).toBe(true);
      expect(result.breakpoints).toHaveLength(2);
      expect(result.breakpoints[0]).toEqual({
        id: bp1.id,
        location: {
          uri: '/test/file1.js',
          line: 10, // 0-based to 1-based conversion
        },
        enabled: true,
        condition: undefined,
      });
      expect(result.breakpoints[1]).toEqual({
        id: bp2.id,
        location: {
          uri: '/test/file2.js',
          line: 20,
        },
        enabled: false,
        condition: undefined,
      });
    });

    it('should return empty list when no breakpoints', async () => {
      vscode.debug.breakpoints = [];

      const result = await tools.listBreakpoints();

      expect(result.success).toBe(true);
      expect(result.breakpoints).toHaveLength(0);
    });

    it('should include condition in breakpoint info', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true, 'x > 10');

      vscode.debug.breakpoints = [bp as any];

      const result = await tools.listBreakpoints();

      expect(result.success).toBe(true);
      expect(result.breakpoints[0]?.condition).toBe('x > 10');
    });

    it('should filter out non-source breakpoints', async () => {
      // Add a source breakpoint and a non-source breakpoint
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const sourceBp = new MockSourceBreakpoint(location);

      // Mock a function breakpoint (not a SourceBreakpoint)
      const functionBp = { type: 'function', functionName: 'test' };

      vscode.debug.breakpoints = [sourceBp as any, functionBp as any];

      const result = await tools.listBreakpoints();

      expect(result.success).toBe(true);
      expect(result.breakpoints).toHaveLength(1); // Only source breakpoint
    });

    it('should handle errors when listing breakpoints', async () => {
      // Mock the breakpoints getter to throw
      Object.defineProperty(vscode.debug, 'breakpoints', {
        get: () => {
          throw new Error('Failed to get breakpoints');
        },
        configurable: true,
      });

      const result = await tools.listBreakpoints();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to get breakpoints');

      // Restore the property
      Object.defineProperty(vscode.debug, 'breakpoints', {
        value: [],
        writable: true,
        configurable: true,
      });
    });
  });

  describe('toggleBreakpoint', () => {
    it('should toggle breakpoint from enabled to disabled', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true, 'x > 10');

      vscode.debug.breakpoints = [bp as any];

      const result = await tools.toggleBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('disabled');
      expect(vscode.debug.removeBreakpoints).toHaveBeenCalledWith([bp]);
      expect(vscode.debug.addBreakpoints).toHaveBeenCalledTimes(1);
    });

    it('should toggle breakpoint from disabled to enabled', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, false);

      vscode.debug.breakpoints = [bp as any];

      const result = await tools.toggleBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('enabled');
    });

    it('should preserve condition when toggling', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true, 'x > 10', '5', 'Value is {x}');

      vscode.debug.breakpoints = [bp as any];

      const result = await tools.toggleBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(true);
      expect(vscode.debug.addBreakpoints).toHaveBeenCalledTimes(1);

      const addedBreakpoint = (vscode.debug.addBreakpoints as any).mock.calls[0][0][0];
      expect(addedBreakpoint.condition).toBe('x > 10');
      expect(addedBreakpoint.hitCondition).toBe('5');
      expect(addedBreakpoint.logMessage).toBe('Value is {x}');
    });

    it('should return error when no breakpoint found to toggle', async () => {
      vscode.debug.breakpoints = [];

      const result = await tools.toggleBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No breakpoint found');
    });

    it('should handle errors when toggling breakpoint', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location);

      vscode.debug.breakpoints = [bp as any];

      vi.spyOn(vscode.debug, 'removeBreakpoints').mockImplementation(() => {
        throw new Error('Failed to toggle breakpoint');
      });

      const result = await tools.toggleBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to toggle breakpoint');
    });
  });

  describe('inspectBreakpoint', () => {
    it('should return structured facts for an editor breakpoint without a session', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, false, 'x > 10', '5', 'Value is {x}');

      vscode.debug.breakpoints = [bp as any];

      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        requestedLocation: { filePath: '/test/file.js', line: 10 },
        editorBreakpoint: {
          exists: true,
          id: bp.id,
          enabled: false,
          condition: 'x > 10',
          hitCondition: '5',
          logMessage: 'Value is {x}',
        },
        session: {
          hasActiveSession: false,
          executionState: 'not_started',
        },
        adapterBreakpoint: {
          available: false,
        },
        history: {
          available: false,
          hitCount: 0,
        },
      });
      expect(result.data?.signals).toEqual(
        expect.arrayContaining([
          { id: 'BREAKPOINT_EXISTS' },
          { id: 'BREAKPOINT_DISABLED' },
          { id: 'CONDITION_PRESENT' },
          { id: 'HIT_CONDITION_PRESENT' },
          { id: 'LOGPOINT_CONFIGURED' },
          { id: 'NO_ACTIVE_SESSION' },
        ])
      );
    });

    it('should include adapter and hit history details when a session is active', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true);
      const session = {
        name: 'node',
        type: 'pwa-node',
        configuration: { name: 'Launch Program' },
        getDebugProtocolBreakpoint: vi.fn().mockResolvedValue({
          id: 7,
          verified: false,
          line: 12,
          source: { path: '/test/out/file.js' },
          message: 'Unbound breakpoint',
        }),
      };

      vscode.debug.breakpoints = [bp as any];
      vscode.debug.activeDebugSession = session as any;
      vi.mocked(dapClient.getExecutionState).mockReturnValue('paused');
      vi.mocked(dapClient.getStoppedInfo).mockReturnValue({
        threadId: 1,
        reason: 'breakpoint',
        description: 'Paused on breakpoint',
        hitBreakpointIds: [7],
      });
      vi.mocked(dapClient.getBreakpointHitStats).mockReturnValue({
        hitCount: 2,
        lastHitTimestamp: 1234,
      });
      vi.mocked(dapClient.getStackTrace).mockResolvedValue({
        stackFrames: [
          {
            id: 1,
            name: 'main',
            source: { path: '/test/file.js' },
            line: 10,
            column: 0,
          },
        ],
      });

      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(session.getDebugProtocolBreakpoint).toHaveBeenCalledWith(bp);
      expect(result.success).toBe(true);
      expect(result.data).toMatchObject({
        session: {
          hasActiveSession: true,
          sessionName: 'node',
          sessionType: 'pwa-node',
          executionState: 'paused',
          configurationName: 'Launch Program',
        },
        adapterBreakpoint: {
          available: true,
          id: 7,
          verified: false,
          line: 12,
          sourcePath: '/test/out/file.js',
          message: 'Unbound breakpoint',
        },
        history: {
          available: true,
          hitCount: 2,
          lastHitTimestamp: 1234,
        },
        currentLocation: {
          file: '/test/file.js',
          line: 10,
          column: 0,
          functionName: 'main',
        },
      });
      expect(result.data?.signals).toEqual(
        expect.arrayContaining([
          { id: 'ACTIVE_SESSION_PRESENT' },
          { id: 'SESSION_PAUSED' },
          { id: 'ADAPTER_BREAKPOINT_AVAILABLE' },
          { id: 'ADAPTER_BREAKPOINT_UNVERIFIED' },
          { id: 'ADAPTER_BREAKPOINT_RELOCATED' },
          { id: 'BREAKPOINT_WAS_HIT_PREVIOUSLY' },
          { id: 'BREAKPOINT_HIT_IN_CURRENT_STOP' },
          { id: 'CURRENT_FRAME_AT_REQUESTED_LOCATION' },
        ])
      );
    });

    it('should report when no editor breakpoint exists at the requested location', async () => {
      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data?.editorBreakpoint.exists).toBe(false);
      expect(result.data?.signals).toEqual(
        expect.arrayContaining([{ id: 'BREAKPOINT_NOT_FOUND' }, { id: 'NO_ACTIVE_SESSION' }])
      );
    });

    it('should report enabled breakpoint without optional fields', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true); // enabled, no condition/hitCondition/logMessage

      vscode.debug.breakpoints = [bp as any];

      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.data?.signals).toEqual(
        expect.arrayContaining([
          { id: 'BREAKPOINT_EXISTS' },
          { id: 'BREAKPOINT_ENABLED' },
        ])
      );
      // Should NOT have these signals
      expect(result.data?.signals).not.toEqual(
        expect.arrayContaining([
          { id: 'CONDITION_PRESENT' },
          { id: 'HIT_CONDITION_PRESENT' },
          { id: 'LOGPOINT_CONFIGURED' },
        ])
      );
    });

    it('should handle running session state', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true);
      const session = {
        name: 'node',
        type: 'pwa-node',
        configuration: { name: 'Launch Program' },
        getDebugProtocolBreakpoint: vi.fn().mockResolvedValue(undefined),
      };

      vscode.debug.breakpoints = [bp as any];
      vscode.debug.activeDebugSession = session as any;
      vi.mocked(dapClient.getExecutionState).mockReturnValue('running');
      vi.mocked(dapClient.getStoppedInfo).mockReturnValue(undefined);

      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.data?.signals).toEqual(
        expect.arrayContaining([
          { id: 'ACTIVE_SESSION_PRESENT' },
          { id: 'SESSION_RUNNING' },
        ])
      );
    });

    it('should handle terminated session state', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true);
      const session = {
        name: 'node',
        type: 'pwa-node',
        configuration: { name: 'Launch Program' },
        getDebugProtocolBreakpoint: vi.fn().mockResolvedValue(undefined),
      };

      vscode.debug.breakpoints = [bp as any];
      vscode.debug.activeDebugSession = session as any;
      vi.mocked(dapClient.getExecutionState).mockReturnValue('terminated');
      vi.mocked(dapClient.getStoppedInfo).mockReturnValue(undefined);

      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.data?.signals).toEqual(
        expect.arrayContaining([
          { id: 'ACTIVE_SESSION_PRESENT' },
          { id: 'SESSION_TERMINATED' },
        ])
      );
    });

    it('should handle verified adapter breakpoint without relocation', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true);
      const session = {
        name: 'node',
        type: 'pwa-node',
        configuration: { name: 'Launch Program' },
        getDebugProtocolBreakpoint: vi.fn().mockResolvedValue({
          id: 7,
          verified: true,
          line: 10,
          source: { path: '/test/file.js' },
        }),
      };

      vscode.debug.breakpoints = [bp as any];
      vscode.debug.activeDebugSession = session as any;
      vi.mocked(dapClient.getExecutionState).mockReturnValue('paused');
      vi.mocked(dapClient.getStoppedInfo).mockReturnValue(undefined);
      vi.mocked(dapClient.getBreakpointHitStats).mockReturnValue({ hitCount: 0 });

      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.data?.adapterBreakpoint).toMatchObject({
        available: true,
        verified: true,
      });
      expect(result.data?.signals).toEqual(
        expect.arrayContaining([
          { id: 'ADAPTER_BREAKPOINT_VERIFIED' },
          { id: 'BREAKPOINT_NEVER_HIT_IN_SESSION' },
        ])
      );
      // Should NOT be relocated
      expect(result.data?.signals).not.toEqual(
        expect.arrayContaining([{ id: 'ADAPTER_BREAKPOINT_RELOCATED' }])
      );
    });

    it('should handle frame not at requested location', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location, true);
      const session = {
        name: 'node',
        type: 'pwa-node',
        configuration: { name: 'Launch Program' },
        getDebugProtocolBreakpoint: vi.fn().mockResolvedValue(undefined),
      };

      vscode.debug.breakpoints = [bp as any];
      vscode.debug.activeDebugSession = session as any;
      vi.mocked(dapClient.getExecutionState).mockReturnValue('paused');
      vi.mocked(dapClient.getStoppedInfo).mockReturnValue(undefined);
      vi.mocked(dapClient.getStackTrace).mockResolvedValue({
        stackFrames: [
          {
            id: 1,
            name: 'other',
            source: { path: '/other/file.js' },
            line: 99,
            column: 0,
          },
        ],
      });

      const result = await tools.inspectBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.data?.currentLocation).toMatchObject({
        file: '/other/file.js',
        line: 99,
      });
      // Should NOT have this signal
      expect(result.data?.signals).not.toEqual(
        expect.arrayContaining([{ id: 'CURRENT_FRAME_AT_REQUESTED_LOCATION' }])
      );
    });
  });

  describe('removeAllBreakpoints', () => {
    it('should remove all breakpoints', async () => {
      // Set up multiple breakpoints
      const uri1 = MockUri.file('/test/file1.js');
      const position1 = new MockPosition(9, 0);
      const range1 = new MockRange(position1, position1);
      const location1 = new MockLocation(uri1, range1);
      const bp1 = new MockSourceBreakpoint(location1);

      const uri2 = MockUri.file('/test/file2.js');
      const position2 = new MockPosition(19, 0);
      const range2 = new MockRange(position2, position2);
      const location2 = new MockLocation(uri2, range2);
      const bp2 = new MockSourceBreakpoint(location2);

      vscode.debug.breakpoints = [bp1 as any, bp2 as any];

      const result = await tools.removeAllBreakpoints();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Removed all 2 breakpoints');
      expect(vscode.debug.removeBreakpoints).toHaveBeenCalledWith([bp1, bp2]);
    });

    it('should handle removing all breakpoints when none exist', async () => {
      vscode.debug.breakpoints = [];

      const result = await tools.removeAllBreakpoints();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Removed all 0 breakpoints');
    });

    it('should handle errors when removing all breakpoints', async () => {
      const uri = MockUri.file('/test/file.js');
      const position = new MockPosition(9, 0);
      const range = new MockRange(position, position);
      const location = new MockLocation(uri, range);
      const bp = new MockSourceBreakpoint(location);

      vscode.debug.breakpoints = [bp as any];

      vi.spyOn(vscode.debug, 'removeBreakpoints').mockImplementation(() => {
        throw new Error('Failed to remove all breakpoints');
      });

      const result = await tools.removeAllBreakpoints();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to remove all breakpoints');
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown errors gracefully', async () => {
      vi.spyOn(vscode.debug, 'addBreakpoints').mockImplementation(() => {
        throw 'String error'; // Non-Error type
      });

      const result = await tools.setBreakpoint({
        filePath: '/test/file.js',
        line: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });
  });
});
