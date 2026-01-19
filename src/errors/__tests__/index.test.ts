// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { describe, it, expect } from 'vitest';
import {
  DebugNotActiveError,
  DebugSessionTerminatedError,
  DebugStartFailedError,
  BreakpointNotFoundError,
  BreakpointSetFailedError,
  ExpressionValidationError,
  ExpressionTooLongError,
  ExpressionUserDeclinedError,
  UnknownToolError,
  InvalidArgumentsError,
  ToolExecutionError,
  ResourceReadError,
  AutomationLevelRestrictedError,
  StepOperationsDisabledError,
  DAPRequestFailedError,
  DAPTimeoutError,
  NoStackFramesError,
  isDebugssyError,
  formatErrorMessage,
  getErrorCode,
  ErrorCode,
} from '../index';
import type { RiskLevel } from '../../security/expression/types';

describe('DebugssyError', () => {
  describe('Debug Session Errors', () => {
    it('creates DebugNotActiveError correctly', () => {
      const error = new DebugNotActiveError();
      expect(error.code).toBe(ErrorCode.DEBUG_NOT_ACTIVE);
      expect(error.message).toBe('No active debug session');
      expect(error.name).toBe('DebugNotActiveError');
      expect(typeof error.timestamp).toBe('number');
    });

    it('creates DebugNotActiveError with operation', () => {
      const error = new DebugNotActiveError('getVariables');
      expect(error.code).toBe(ErrorCode.DEBUG_NOT_ACTIVE);
      expect(error.message).toBe('No active debug session for operation: getVariables');
      expect(error.details).toEqual({ operation: 'getVariables' });
    });

    it('creates DebugSessionTerminatedError correctly', () => {
      const error = new DebugSessionTerminatedError('MyApp');
      expect(error.code).toBe(ErrorCode.DEBUG_SESSION_TERMINATED);
      expect(error.message).toBe('Debug session "MyApp" has terminated');
      expect(error.details).toEqual({ sessionName: 'MyApp' });
    });

    it('creates DebugSessionTerminatedError without session name', () => {
      const error = new DebugSessionTerminatedError();
      expect(error.code).toBe(ErrorCode.DEBUG_SESSION_TERMINATED);
      expect(error.message).toBe('Debug session has terminated');
    });

    it('creates DebugStartFailedError correctly', () => {
      const error = new DebugStartFailedError('Configuration not found', 'launch.json');
      expect(error.code).toBe(ErrorCode.DEBUG_START_FAILED);
      expect(error.message).toBe('Configuration not found');
      expect(error.details).toEqual({
        reason: 'Configuration not found',
        configuration: 'launch.json',
      });
    });
  });

  describe('Breakpoint Errors', () => {
    it('creates BreakpointNotFoundError correctly', () => {
      const error = new BreakpointNotFoundError('/path/to/file.ts', 42);
      expect(error.code).toBe(ErrorCode.BREAKPOINT_NOT_FOUND);
      expect(error.message).toBe('No breakpoint found at /path/to/file.ts:42');
      expect(error.details).toEqual({ filePath: '/path/to/file.ts', line: 42 });
    });

    it('creates BreakpointSetFailedError correctly', () => {
      const error = new BreakpointSetFailedError('/path/to/file.ts', 42, 'Invalid line number');
      expect(error.code).toBe(ErrorCode.BREAKPOINT_SET_FAILED);
      expect(error.message).toBe(
        'Failed to set breakpoint at /path/to/file.ts:42: Invalid line number'
      );
      expect(error.details).toEqual({
        filePath: '/path/to/file.ts',
        line: 42,
        reason: 'Invalid line number',
      });
    });

    it('creates BreakpointSetFailedError without reason', () => {
      const error = new BreakpointSetFailedError('/path/to/file.ts', 42);
      expect(error.code).toBe(ErrorCode.BREAKPOINT_SET_FAILED);
      expect(error.message).toBe('Failed to set breakpoint at /path/to/file.ts:42');
    });
  });

  describe('Expression Validation Errors', () => {
    it('creates ExpressionValidationError correctly', () => {
      const error = new ExpressionValidationError(
        'eval()',
        'Code execution detected',
        'critical' as RiskLevel
      );
      expect(error.code).toBe(ErrorCode.EXPRESSION_VALIDATION_FAILED);
      expect(error.message).toBe('Expression validation failed: Code execution detected');
      expect(error.riskLevel).toBe('critical' as RiskLevel);
      expect(error.expression).toBe('eval()');
      expect(error.details).toEqual({
        expression: 'eval()',
        riskLevel: 'critical',
        reason: 'Code execution detected',
      });
    });

    it('creates ExpressionTooLongError correctly', () => {
      const error = new ExpressionTooLongError(200, 100);
      expect(error.code).toBe(ErrorCode.EXPRESSION_TOO_LONG);
      expect(error.message).toBe(
        'Expression exceeds maximum allowed length of 100 characters (current: 200)'
      );
      expect(error.details).toEqual({ expressionLength: 200, maxLength: 100 });
    });

    it('creates ExpressionUserDeclinedError correctly', () => {
      const error = new ExpressionUserDeclinedError('eval()');
      expect(error.code).toBe(ErrorCode.EXPRESSION_USER_DECLINED);
      expect(error.message).toBe('User declined to execute expression');
      expect(error.details).toEqual({ expression: 'eval()' });
    });

    it('creates ExpressionUserDeclinedError with reason', () => {
      const error = new ExpressionUserDeclinedError('eval()', 'Too risky');
      expect(error.code).toBe(ErrorCode.EXPRESSION_USER_DECLINED);
      expect(error.message).toBe('User declined to execute expression: Too risky');
    });
  });

  describe('Tool Errors', () => {
    it('creates UnknownToolError correctly', () => {
      const error = new UnknownToolError('unknown_tool', ['get_variables', 'set_breakpoint']);
      expect(error.code).toBe(ErrorCode.UNKNOWN_TOOL);
      expect(error.message).toBe('Unknown tool: unknown_tool');
      expect(error.details).toEqual({
        toolName: 'unknown_tool',
        availableTools: ['get_variables', 'set_breakpoint'],
      });
    });

    it('creates InvalidArgumentsError correctly', () => {
      const error = new InvalidArgumentsError('set_breakpoint', 'Invalid line number');
      expect(error.code).toBe(ErrorCode.INVALID_ARGUMENTS);
      expect(error.message).toBe(
        "Invalid arguments for tool 'set_breakpoint': Invalid line number"
      );
      expect(error.details).toEqual({
        toolName: 'set_breakpoint',
        issues: 'Invalid line number',
      });
    });

    it('creates ToolExecutionError correctly', () => {
      const error = new ToolExecutionError('get_variables', 'Session not active');
      expect(error.code).toBe(ErrorCode.TOOL_EXECUTION_FAILED);
      expect(error.message).toBe("Tool 'get_variables' execution failed: Session not active");
      expect(error.details).toEqual({
        toolName: 'get_variables',
        reason: 'Session not active',
      });
    });
  });

  describe('Resource Errors', () => {
    it('creates ResourceReadError correctly', () => {
      const error = new ResourceReadError('file://workspace/launch.json', 'File not found');
      expect(error.code).toBe(ErrorCode.RESOURCE_READ_FAILED);
      expect(error.message).toBe(
        'Failed to read resource: file://workspace/launch.json. File not found'
      );
      expect(error.details).toEqual({
        resourceUri: 'file://workspace/launch.json',
        reason: 'File not found',
      });
    });
  });

  describe('Automation Level Errors', () => {
    it('creates AutomationLevelRestrictedError correctly', () => {
      const error = new AutomationLevelRestrictedError('start_debugging', 'assisted', 'full');
      expect(error.code).toBe(ErrorCode.AUTOMATION_LEVEL_RESTRICTED);
      expect(error.message).toBe(
        "Operation 'start_debugging' requires 'full' automation level, but current level is 'assisted'"
      );
      expect(error.details).toEqual({
        operation: 'start_debugging',
        currentLevel: 'assisted',
        requiredLevel: 'full',
      });
    });

    it('creates StepOperationsDisabledError correctly', () => {
      const error = new StepOperationsDisabledError('stepOver');
      expect(error.code).toBe(ErrorCode.STEP_OPERATIONS_DISABLED);
      expect(error.message).toBe(
        "Step operation 'stepOver' is disabled. Enable debugssy.allowStepOperations in settings."
      );
      expect(error.details).toEqual({ operation: 'stepOver' });
    });
  });

  describe('DAP Errors', () => {
    it('creates DAPRequestFailedError correctly', () => {
      const error = new DAPRequestFailedError('stackTrace', 'Adapter error');
      expect(error.code).toBe(ErrorCode.DAP_REQUEST_FAILED);
      expect(error.message).toBe("DAP request 'stackTrace' failed: Adapter error");
      expect(error.details).toEqual({
        request: 'stackTrace',
        reason: 'Adapter error',
      });
    });

    it('creates DAPTimeoutError correctly', () => {
      const error = new DAPTimeoutError('wait_for_breakpoint', 5000);
      expect(error.code).toBe(ErrorCode.DAP_TIMEOUT);
      expect(error.message).toBe('Timeout waiting for wait_for_breakpoint after 5000ms');
      expect(error.details).toEqual({
        operation: 'wait_for_breakpoint',
        timeoutMs: 5000,
      });
    });

    it('creates NoStackFramesError correctly', () => {
      const error = new NoStackFramesError();
      expect(error.code).toBe(ErrorCode.DAP_NO_STACK_FRAMES);
      expect(error.message).toBe('No stack frames available - debugger may not be paused');
    });
  });

  describe('Error Serialization', () => {
    it('serializes error to JSON correctly', () => {
      const error = new BreakpointNotFoundError('/path/to/file.ts', 42);
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'BreakpointNotFoundError',
        code: ErrorCode.BREAKPOINT_NOT_FOUND,
        message: 'No breakpoint found at /path/to/file.ts:42',
        timestamp: expect.any(Number),
        details: {
          filePath: '/path/to/file.ts',
          line: 42,
        },
      });
    });

    it('includes timestamp in serialization', () => {
      const before = Date.now();
      const error = new DebugNotActiveError();
      const after = Date.now();

      const json = error.toJSON();
      expect(json.timestamp).toBeGreaterThanOrEqual(before);
      expect(json.timestamp).toBeLessThanOrEqual(after);
    });

    it('includes details when provided', () => {
      const error = new ExpressionValidationError('test', 'reason', 'low' as RiskLevel, {
        extra: 'info',
      });
      const json = error.toJSON();

      expect(json.details).toEqual({
        expression: 'test',
        riskLevel: 'low',
        reason: 'reason',
        extra: 'info',
      });
    });

    it('handles missing details correctly', () => {
      const error = new NoStackFramesError();
      const json = error.toJSON();

      expect(json.details).toBeUndefined();
    });
  });

  describe('Utility Functions', () => {
    it('isDebugssyError identifies DebugssyError instances', () => {
      const error = new DebugNotActiveError();
      expect(isDebugssyError(error)).toBe(true);
    });

    it('isDebugssyError returns false for non-DebugssyError', () => {
      const error = new Error('Regular error');
      expect(isDebugssyError(error)).toBe(false);
    });

    it('isDebugssyError returns false for non-Error values', () => {
      expect(isDebugssyError(null)).toBe(false);
      expect(isDebugssyError(undefined)).toBe(false);
      expect(isDebugssyError('string')).toBe(false);
      expect(isDebugssyError({})).toBe(false);
    });

    it('formatErrorMessage returns message for DebugssyError', () => {
      const error = new BreakpointNotFoundError('/path.ts', 42);
      expect(formatErrorMessage(error)).toBe('No breakpoint found at /path.ts:42');
    });

    it('formatErrorMessage returns message for regular Error', () => {
      const error = new Error('Some error');
      expect(formatErrorMessage(error)).toBe('Some error');
    });

    it('formatErrorMessage returns default for unknown error type', () => {
      expect(formatErrorMessage(null)).toBe('Unknown error occurred');
      expect(formatErrorMessage(undefined)).toBe('Unknown error occurred');
      expect(formatErrorMessage('string')).toBe('Unknown error occurred');
    });

    it('getErrorCode returns code for DebugssyError', () => {
      const error = new BreakpointNotFoundError('/path.ts', 42);
      expect(getErrorCode(error)).toBe(ErrorCode.BREAKPOINT_NOT_FOUND);
    });

    it('getErrorCode returns UNKNOWN_ERROR for regular Error', () => {
      const error = new Error('Some error');
      expect(getErrorCode(error)).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('getErrorCode returns UNKNOWN_ERROR for non-Error', () => {
      expect(getErrorCode(null)).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(getErrorCode(undefined)).toBe(ErrorCode.UNKNOWN_ERROR);
    });
  });

  describe('Error Code Enum', () => {
    it('has all expected error codes', () => {
      expect(ErrorCode.DEBUG_NOT_ACTIVE).toBe('DEBUG_NOT_ACTIVE');
      expect(ErrorCode.BREAKPOINT_NOT_FOUND).toBe('BREAKPOINT_NOT_FOUND');
      expect(ErrorCode.EXPRESSION_VALIDATION_FAILED).toBe('EXPRESSION_VALIDATION_FAILED');
      expect(ErrorCode.UNKNOWN_TOOL).toBe('UNKNOWN_TOOL');
      expect(ErrorCode.INVALID_ARGUMENTS).toBe('INVALID_ARGUMENTS');
      expect(ErrorCode.TOOL_EXECUTION_FAILED).toBe('TOOL_EXECUTION_FAILED');
      expect(ErrorCode.RESOURCE_READ_FAILED).toBe('RESOURCE_READ_FAILED');
      expect(ErrorCode.AUTOMATION_LEVEL_RESTRICTED).toBe('AUTOMATION_LEVEL_RESTRICTED');
      expect(ErrorCode.STEP_OPERATIONS_DISABLED).toBe('STEP_OPERATIONS_DISABLED');
      expect(ErrorCode.DAP_REQUEST_FAILED).toBe('DAP_REQUEST_FAILED');
      expect(ErrorCode.DAP_TIMEOUT).toBe('DAP_TIMEOUT');
      expect(ErrorCode.DAP_NO_STACK_FRAMES).toBe('DAP_NO_STACK_FRAMES');
      expect(ErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
    });
  });
});
