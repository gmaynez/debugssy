// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebugControlTools } from '../DebugControl';
import { ConfigManager } from '../../Config';
import { vscode } from '../../__tests__/setup';
import { createMockDebugSession } from '../../__tests__/helpers/vscode-mock';

describe('DebugControlTools', () => {
  let tools: DebugControlTools;
  let configManager: ConfigManager;

  beforeEach(() => {
    vi.clearAllMocks();
    configManager = new ConfigManager();
    tools = new DebugControlTools(configManager);
  });

  describe('Session Management', () => {
    it('should track active debug session on start', () => {
      const session = createMockDebugSession('test', 'node');
      vscode.debug.activeDebugSession = session;

      // Create new instance to trigger initialization
      const newTools = new DebugControlTools(configManager);
      expect(newTools.getActiveSession()).toBeDefined();
    });

    it('should update active session when debug starts', () => {
      const session = createMockDebugSession('test', 'node');

      // Simulate debug session start
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);

      expect(tools.getActiveSession()).toBe(session);
    });

    it('should clear active session when debug terminates', () => {
      const session = createMockDebugSession('test', 'node');
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);

      // Simulate debug session termination
      const terminateHandler = (vscode.debug.onDidTerminateDebugSession as any).mock.calls[0][0];
      terminateHandler(session);

      expect(tools.getActiveSession()).toBeUndefined();
    });
  });

  describe('startDebugging', () => {
    it('should fail in assisted mode', async () => {
      // Mock configuration to return assisted mode
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'assisted',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      const result = await tools.startDebugging({
        configuration: { type: 'node', request: 'launch', name: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('assisted mode');
      expect(vscode.debug.startDebugging).not.toHaveBeenCalled();
    });

    it('should start debugging in full automation mode', async () => {
      // Mock configuration to return full automation mode
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      // Mock workspace folders
      const mockFolder = {
        uri: { fsPath: '/workspace', toString: () => '/workspace' },
        name: 'workspace',
        index: 0,
      };
      vscode.workspace.workspaceFolders = [mockFolder as any];

      // Mock successful debug start
      vi.spyOn(vscode.debug, 'startDebugging').mockResolvedValue(true as any);

      const result = await tools.startDebugging({
        configuration: { type: 'node', request: 'launch', name: 'test' },
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Debug session started');
      expect(vscode.debug.startDebugging).toHaveBeenCalledTimes(1);
    });

    it('should fail when no workspace folder open', async () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      vscode.workspace.workspaceFolders = [];

      const result = await tools.startDebugging({
        configuration: { type: 'node', request: 'launch', name: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No workspace folder');
    });

    it('should fail when no configuration provided', async () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      const mockFolder = {
        uri: { fsPath: '/workspace', toString: () => '/workspace' },
        name: 'workspace',
        index: 0,
      };
      vscode.workspace.workspaceFolders = [mockFolder as any];

      const result = await tools.startDebugging({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No debug configuration');
    });

    it('should find configuration by name', async () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      const mockFolder = {
        uri: { fsPath: '/workspace', toString: () => '/workspace' },
        name: 'workspace',
        index: 0,
      };
      vscode.workspace.workspaceFolders = [mockFolder as any];

      // Mock workspace configuration
      vscode.workspace.getConfiguration = vi.fn(() => ({
        get: vi.fn((key: string) => {
          if (key === 'configurations') {
            return [
              { type: 'node', request: 'launch', name: 'Launch Program' },
              { type: 'node', request: 'attach', name: 'Attach' },
            ];
          }
          return undefined;
        }),
      })) as any;

      vi.spyOn(vscode.debug, 'startDebugging').mockResolvedValue(true as any);

      const result = await tools.startDebugging({ name: 'Attach' });

      expect(result.success).toBe(true);
      expect(vscode.debug.startDebugging).toHaveBeenCalledWith(
        mockFolder,
        expect.objectContaining({ name: 'Attach' })
      );
    });

    it('should handle start debugging errors', async () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      const mockFolder = {
        uri: { fsPath: '/workspace', toString: () => '/workspace' },
        name: 'workspace',
        index: 0,
      };
      vscode.workspace.workspaceFolders = [mockFolder as any];

      vi.spyOn(vscode.debug, 'startDebugging').mockRejectedValue(new Error('Failed to start'));

      const result = await tools.startDebugging({
        configuration: { type: 'node', request: 'launch', name: 'test' },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to start');
    });
  });

  describe('stopDebugging', () => {
    it('should stop active debug session', async () => {
      const session = createMockDebugSession('test', 'node');
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);

      vi.spyOn(vscode.debug, 'stopDebugging').mockResolvedValue(undefined);

      const result = await tools.stopDebugging();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Debug session stopped');
      expect(vscode.debug.stopDebugging).toHaveBeenCalledWith(session);
    });

    it('should fail when no active debug session', async () => {
      const result = await tools.stopDebugging();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active debug session');
    });

    it('should handle stop debugging errors', async () => {
      const session = createMockDebugSession('test', 'node');
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);

      vi.spyOn(vscode.debug, 'stopDebugging').mockRejectedValue(new Error('Failed to stop'));

      const result = await tools.stopDebugging();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to stop');
    });
  });

  describe('Automation Level Checks', () => {
    beforeEach(() => {
      // Set up active session for command tests
      const session = createMockDebugSession('test', 'node');
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);
    });

    describe('continueExecution', () => {
      it('should return assisted message in assisted mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'assisted',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.continueExecution();

        expect(result.success).toBe(true);
        expect(result.message).toContain('Assisted mode');
        expect(result.message).toContain('Continue');
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
      });

      it('should execute command in full automation mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.continueExecution();

        expect(result.success).toBe(true);
        expect(result.message).toContain('Execution continued');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'workbench.action.debug.continue'
        );
      });
    });

    describe('stepOver', () => {
      it('should return assisted message in assisted mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'assisted',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.stepOver();

        expect(result.success).toBe(true);
        expect(result.message).toContain('Step Over');
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
      });

      it('should execute command in full automation mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.stepOver();

        expect(result.success).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'workbench.action.debug.stepOver'
        );
      });
    });

    describe('stepInto', () => {
      it('should execute command in full automation mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.stepInto();

        expect(result.success).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'workbench.action.debug.stepInto'
        );
      });
    });

    describe('stepOut', () => {
      it('should execute command in full automation mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.stepOut();

        expect(result.success).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'workbench.action.debug.stepOut'
        );
      });
    });

    describe('pause', () => {
      it('should execute command in full automation mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.pause();

        expect(result.success).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.debug.pause');
      });
    });

    describe('restart', () => {
      it('should execute command in full automation mode', async () => {
        vi.spyOn(configManager, 'getConfig').mockReturnValue({
          enabled: true,
          port: 3000,
          automationLevel: 'full',
          waitForBreakpointTimeout: 5000,
          allowStepOperations: false,
          maxExpressionLength: 100,
          expressionValidationLevel: 'moderate',
        });

        const result = await tools.restart();

        expect(result.success).toBe(true);
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
          'workbench.action.debug.restart'
        );
      });
    });
  });

  describe('Command Execution Error Handling', () => {
    it('should fail when no active session for commands', async () => {
      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      const result = await tools.continueExecution();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active debug session');
    });

    it('should handle command execution errors', async () => {
      const session = createMockDebugSession('test', 'node');
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);

      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      vi.spyOn(vscode.commands, 'executeCommand').mockRejectedValue(new Error('Command failed'));

      const result = await tools.continueExecution();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command failed');
    });

    it('should handle unknown errors', async () => {
      const session = createMockDebugSession('test', 'node');
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);

      vi.spyOn(configManager, 'getConfig').mockReturnValue({
        enabled: true,
        port: 3000,
        automationLevel: 'full',
        waitForBreakpointTimeout: 5000,
        allowStepOperations: false,
        maxExpressionLength: 100,
        expressionValidationLevel: 'moderate',
      });

      vi.spyOn(vscode.commands, 'executeCommand').mockRejectedValue('String error');

      const result = await tools.continueExecution();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });
  });

  describe('getActiveSession', () => {
    it('should return active session', () => {
      const session = createMockDebugSession('test', 'node');
      const startHandler = (vscode.debug.onDidStartDebugSession as any).mock.calls[0][0];
      startHandler(session);

      expect(tools.getActiveSession()).toBe(session);
    });

    it('should return undefined when no active session', () => {
      expect(tools.getActiveSession()).toBeUndefined();
    });
  });
});
