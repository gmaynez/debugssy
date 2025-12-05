// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BreakpointTools } from '../Breakpoints';
import { vscode } from '../../__tests__/setup';
import {
  MockUri,
  MockPosition,
  MockLocation,
  MockRange,
  MockSourceBreakpoint,
} from '../../__tests__/helpers/vscode-mock';

describe('BreakpointTools', () => {
  let tools: BreakpointTools;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = new BreakpointTools();
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
      // The new breakpoint should be created with the same condition, hitCondition, logMessage
      expect(vscode.debug.addBreakpoints).toHaveBeenCalledTimes(1);
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
