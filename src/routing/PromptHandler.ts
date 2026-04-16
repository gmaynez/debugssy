// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2025 Guillermo Garcia Maynez

import { ConfigManager } from '../Config';
import { z } from 'zod';
import {
  RESOURCE_RESPONSE_EXAMPLES,
  TOOL_RESPONSE_EXAMPLES,
  formatJsonExample,
} from './toolResponseExamples';

const DebugCrashArgsSchema = z.object({
  errorMessage: z.string().min(1, { error: 'errorMessage is required and must not be empty' }),
  filePath: z.string().optional(),
});
type DebugCrashArgs = z.infer<typeof DebugCrashArgsSchema>;

const TraceVariableArgsSchema = z.object({
  variableName: z.string().min(1, { error: 'variableName is required and must not be empty' }),
  expectedValue: z.string().optional(),
  actualValue: z.string().optional(),
});
type TraceVariableArgs = z.infer<typeof TraceVariableArgsSchema>;

const InspectFunctionArgsSchema = z.object({
  functionName: z.string().min(1, { error: 'functionName is required and must not be empty' }),
  filePath: z.string().min(1, { error: 'filePath is required and must not be empty' }),
  issue: z.string().optional(),
});
type InspectFunctionArgs = z.infer<typeof InspectFunctionArgsSchema>;

const DebugLoopArgsSchema = z.object({
  loopLocation: z.string().min(1, { error: 'loopLocation is required and must not be empty' }),
  expectedIterations: z.preprocess(
    // Coerce string to number since MCP clients often send form values as strings
    (val) => (typeof val === 'string' ? Number(val) : val),
    z
      .number()
      .int()
      .positive({
        error: 'expectedIterations must be a positive integer',
      })
      .optional()
  ),
});
type DebugLoopArgs = z.infer<typeof DebugLoopArgsSchema>;

const AutoDebugSessionArgsSchema = z.object({
  issue: z.string().min(1, { error: 'issue is required and must not be empty' }),
  entryPoint: z.string().optional(),
});
type AutoDebugSessionArgs = z.infer<typeof AutoDebugSessionArgsSchema>;

type PromptArguments = Record<string, unknown>;

/**
 * Handles prompt registration and generation for the MCP server.
 * Provides prompt schemas and generates prompt content based on user input.
 */
export class PromptHandler {
  constructor(private configManager: ConfigManager) {}

  /**
   * Returns universal best practices that apply to all debugging workflows.
   * These guidelines help less-capable models use tools correctly.
   */
  private getBestPracticesPrefix(): string {
    const debugStateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);
    const variablesExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getVariablesLocalScope);
    const callStackExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getCallStack);
    const evaluateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.evaluateExpression);

    return `DEBUGGING BEST PRACTICES - Follow these guidelines for all debugging tasks:

1. ALWAYS call get_debug_state FIRST before any inspection operations
   - Verifies debugger is paused and shows current location
   - Returns a ToolResult payload like: ${debugStateExample}

2. Use filters and limits to reduce output verbosity:
   - get_variables: ALWAYS specify scope: "Local" to see only relevant variables
   - get_call_stack: Use maxDepth (e.g., 10) to limit stack frames
   - get_console_output: Use limit (default 50, max 1000) and category filters

3. Keep evaluate_expression simple:
   - Avoid complex nested expressions (max length varies by settings, typically 100 chars)
   - Don't use side effects (assignments, mutations, function calls that modify state)
   - If expression validation prompts appear, review carefully before approving

4. Check for truncation indicators in responses:
   - "truncated: true" means more data is available
   - Adjust maxDepth/limit parameters or use more specific filters

5. Common tool response patterns:
   - get_debug_state → Check "success", then inspect "data.executionState", "data.currentLocation", and "data.stoppedInfo"
   - get_variables → Returns ${variablesExample}
   - get_call_stack → Returns ${callStackExample}
   - evaluate_expression → Returns ${evaluateExample}

6. Error recovery:
   - "No active debug session" → Start debugging first
   - "Execution not paused" → Ensure breakpoint is hit or use pause
   - "Variable not found" → Check scope or use evaluate_expression instead

`;
  }

  /**
   * Returns guidance for reading launch.json resources in full automation mode.
   */
  private getResourceReadingGuidance(automationLevel: string): string {
    if (automationLevel !== 'full') {
      return '';
    }

    const listResourcesExample = formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.listResources);
    const readResourceExample = formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.readLaunchJson);

    return `STEP 0 - Read Debug Configuration (Full Automation Mode):
Before starting debugging, you need to find the correct configuration name:

a. List available resources:
   Call: list_resources()
   Example response: ${listResourcesExample}

b. Find launch.json resource in response:
   Look for URI pattern: "debugssy:///{workspaceName}/launch.json"

c. Read the resource:
   Call: read_resource({"uri": "debugssy:///{workspaceName}/launch.json"})
   Example response: ${readResourceExample}

d. Parse the JSON response to find "configurations" array
   Each configuration has a "name" field (e.g., "Launch Program", "Debug Tests")

e. Use one of these configuration names in start_debugging:
   Call: start_debugging({"name": "Launch Program"})

`;
  }

  /**
   * Returns the list of available prompts based on automation level.
   */
  getPromptSchemas(): any[] {
    const automationLevel = this.configManager.getConfig().automationLevel;

    const commonPrompts = [
      {
        name: 'debug-crash',
        description:
          'Debug a crash or exception by setting breakpoints and inspecting the call stack',
        arguments: [
          {
            name: 'errorMessage',
            description: 'The error message or description of the crash',
            required: true,
          },
          {
            name: 'filePath',
            description: 'File where the error occurs (if known)',
            required: false,
          },
        ],
      },
      {
        name: 'trace-variable',
        description:
          "Trace a variable's value through execution to find where it becomes incorrect",
        arguments: [
          {
            name: 'variableName',
            description: 'Name of the variable to trace',
            required: true,
          },
          {
            name: 'expectedValue',
            description: 'What the variable value should be',
            required: false,
          },
          {
            name: 'actualValue',
            description: 'What the variable value actually is (if known)',
            required: false,
          },
        ],
      },
      {
        name: 'inspect-function',
        description:
          "Inspect a function's behavior by setting breakpoints and examining inputs/outputs",
        arguments: [
          {
            name: 'functionName',
            description: 'Name of the function to inspect',
            required: true,
          },
          {
            name: 'filePath',
            description: 'File containing the function',
            required: true,
          },
          {
            name: 'issue',
            description: 'Description of the issue with the function',
            required: false,
          },
        ],
      },
      {
        name: 'debug-loop',
        description:
          'Debug an infinite loop or unexpected loop behavior using conditional breakpoints',
        arguments: [
          {
            name: 'loopLocation',
            description: 'Description of where the loop is (file and approximate line)',
            required: true,
          },
          {
            name: 'expectedIterations',
            description: 'How many times the loop should run',
            required: false,
          },
        ],
      },
    ];

    const fullAutomationPrompts = [
      {
        name: 'auto-debug-session',
        description:
          'Automatically start a full debugging session with breakpoints and inspection (full automation mode only)',
        arguments: [
          {
            name: 'issue',
            description: 'Description of the bug or issue to debug',
            required: true,
          },
          {
            name: 'entryPoint',
            description: 'Main file or function to start debugging from',
            required: false,
          },
        ],
      },
    ];

    return automationLevel === 'full'
      ? [...commonPrompts, ...fullAutomationPrompts]
      : commonPrompts;
  }

  /**
   * Generates prompt content based on the prompt name and arguments.
   * Validates arguments using Zod schemas per MCP security best practices.
   */
  generatePrompt(promptName: string, args: PromptArguments = {}): any {
    const automationLevel = this.configManager.getConfig().automationLevel;

    switch (promptName) {
      case 'debug-crash': {
        const validated = DebugCrashArgsSchema.parse(args);
        return this.generateDebugCrashPrompt(validated, automationLevel);
      }

      case 'trace-variable': {
        const validated = TraceVariableArgsSchema.parse(args);
        return this.generateTraceVariablePrompt(validated, automationLevel);
      }

      case 'inspect-function': {
        const validated = InspectFunctionArgsSchema.parse(args);
        return this.generateInspectFunctionPrompt(validated, automationLevel);
      }

      case 'debug-loop': {
        const validated = DebugLoopArgsSchema.parse(args);
        return this.generateDebugLoopPrompt(validated, automationLevel);
      }

      case 'auto-debug-session': {
        if (automationLevel !== 'full') {
          throw new Error('auto-debug-session prompt requires full automation mode');
        }
        const validated = AutoDebugSessionArgsSchema.parse(args);
        return this.generateAutoDebugSessionPrompt(validated);
      }

      default:
        throw new Error(`Unknown prompt: ${promptName}`);
    }
  }

  private generateDebugCrashPrompt(args: DebugCrashArgs, automationLevel: string): any {
    const errorMsg = args.errorMessage;
    const filePath = args.filePath ? ` in ${args.filePath}` : '';
    const filePathExample = args.filePath || '/path/to/file';

    const bestPractices = this.getBestPracticesPrefix();
    const resourceGuidance = this.getResourceReadingGuidance(automationLevel);
    const debugStateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);
    const callStackExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getCallStack);
    const variablesExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getVariablesLocalScope);

    const debugStartHint =
      automationLevel === 'assisted'
        ? 'Start debugging in VS Code (press F5 or click Run → Start Debugging), then reproduce the error'
        : 'Call start_debugging with the appropriate configuration name (see STEP 0)';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${bestPractices}
I need help debugging a crash/exception${filePath}.
Error: "${errorMsg}"

${resourceGuidance}
Follow these steps IN ORDER:

STEP 1 - Set Breakpoint:
Call set_breakpoint to pause execution where the error occurs:
  Example: {"filePath": "${filePathExample}", "line": 45}
  - Use absolute path for filePath
  - Line number is 1-based
  - Optional: Add "condition" to break only when specific state occurs (e.g., "user === null")

STEP 2 - Start Debugging:
${debugStartHint}
${automationLevel === 'full' ? '  - After calling start_debugging, wait for it to initialize' : '  - Trigger the error scenario in your application'}

STEP 3 - Verify Paused State (CRITICAL):
Call get_debug_state() to confirm execution paused at the breakpoint:
  Expected response: ${debugStateExample}
  - If data.executionState is "running", the breakpoint hasn't been hit yet
  - If data.executionState is "not_started" or "terminated", debugging isn't currently paused

STEP 4 - Get Call Stack:
Call get_call_stack to see the execution path leading to the error:
  Example: {"maxDepth": 10}
  Response: ${callStackExample}
  - Shows function call chain leading to the crash
  - Each frame is in data.frames with {id, name, source, line}
  - If data.truncated is true, increase maxDepth for more context

STEP 5 - Inspect Local Variables:
Call get_variables to examine values at the point of failure:
  Example: {"scope": "Local"}
  CRITICAL: ALWAYS use scope filter to reduce output verbosity
  Response: ${variablesExample}
  - Look for null/undefined values that might cause the error
  - Check if objects have expected properties

STEP 6 - Check Console Output (if relevant):
Call get_console_output to view any logged messages:
  Example: {"limit": 50, "category": "console"}
  Optional filters: category ("console", "stdout", "stderr"), since (timestamp)
  - May contain stack traces or additional error details
  - Response includes "truncated" indicator if more entries available

STEP 7 - Evaluate Specific Expressions (if needed):
Call evaluate_expression to check specific values or conditions:
  Example: {"expression": "user.id"}
  - Keep expressions simple (avoid complex nested calls)
  - Don't use side effects (assignments, mutations)
  - If validation prompts appear, review carefully before approving

STEP 8 - Analyze & Report:
Based on the data collected:
  - Identify the root cause of the crash
  - Explain WHY the error occurred (not just what happened)
  - Suggest a specific fix with code example
  - Recommend preventive measures (null checks, validation, etc.)

COMMON ISSUES:
❌ "No active debug session" → Start debugging first (STEP 2)
❌ "Execution not paused" → Ensure breakpoint is hit
❌ "Variable not found" → Check scope or use evaluate_expression
`,
          },
        },
      ],
    };
  }

  private generateTraceVariablePrompt(args: TraceVariableArgs, automationLevel: string): any {
    const varName = args.variableName;
    const expected = args.expectedValue ? ` (expected: ${args.expectedValue})` : '';
    const actual = args.actualValue ? ` but is actually ${args.actualValue}` : '';

    const bestPractices = this.getBestPracticesPrefix();
    const resourceGuidance = this.getResourceReadingGuidance(automationLevel);
    const debugStateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);
    const evaluateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.evaluateExpression);

    const executionControl =
      automationLevel === 'assisted'
        ? 'I will guide you when to click Continue/Step in VS Code'
        : 'Use continue to move between breakpoints, checking state at each stop';

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${bestPractices}
I need to trace the variable "${varName}"${expected}${actual}.

${resourceGuidance}
Follow these steps IN ORDER:

STEP 1 - Identify Modification Points:
Set breakpoints at key locations where "${varName}" is assigned or modified:
  Example: {"filePath": "/path/to/file", "line": 10}
  - Set breakpoints at variable declaration
  - Set breakpoints at each assignment/modification
  - Set breakpoints before the point where value is incorrect
  - Typically need 2-3 strategic breakpoints to trace the flow

STEP 2 - Start Debugging:
${automationLevel === 'assisted' ? 'Start debugging in VS Code (F5), then trigger the code path that uses this variable' : 'Call start_debugging with appropriate configuration (see STEP 0)'}

STEP 3 - First Breakpoint - Verify Initial State (CRITICAL):
When execution pauses at the first breakpoint:

a. Call get_debug_state() to verify pause:
   Expected: ${debugStateExample}

b. Call get_variables to see current value:
   Example: {"scope": "Local"}
   Look for "${varName}" in data.scopes[*].variables

c. Or use evaluate_expression for specific check:
   Example: {"expression": "${varName}"}
   Response: ${evaluateExample}

STEP 4 - Continue to Next Breakpoint:
${executionControl}
${
  automationLevel === 'full'
    ? `Call continue() to proceed to next breakpoint
Then call wait_for_breakpoint() to pause execution
Check with get_debug_state() again`
    : ''
}

STEP 5 - Second Breakpoint - Track Changes:
At each subsequent breakpoint, repeat the inspection:

a. Call get_debug_state() - verify we're paused

b. Call get_variables({"scope": "Local"}) or evaluate_expression({"expression": "${varName}"})

c. Compare value to previous checkpoint:
   - Note when value changes
   - Note what operation caused the change
   - Check if change is expected

STEP 6 - Identify Divergence Point:
Continue this pattern until you find where "${varName}" becomes incorrect:
  - Compare actual value to expected value${expected}
  - Examine the code between breakpoints
  - Look for:
    • Incorrect assignment logic
    • Missing validation
    • Type coercion issues
    • Scope problems (wrong variable being modified)

STEP 7 - Analyze Root Cause:
Examine the context at the divergence point:

a. Call get_call_stack({"maxDepth": 10}) to see call chain

b. Call get_variables({"scope": "Local"}) to see all related variables

c. Call evaluate_expression to test hypotheses:
   Example: {"expression": "typeof ${varName}"}
   Example: {"expression": "${varName} === null"}

STEP 8 - Report Findings:
  - Identify exactly where "${varName}" becomes incorrect (file:line)
  - Explain WHY it gets the wrong value
  - Show the expected vs actual transformation
  - Suggest fix with code example
  - Recommend preventive measures

COMMON ISSUES:
❌ "Variable not found" → Check you're in the right scope or use evaluate_expression
❌ "Execution not paused" → Ensure breakpoint is hit before inspection
❌ Variable undefined → May be out of scope at this breakpoint
`,
          },
        },
      ],
    };
  }

  private generateInspectFunctionPrompt(args: InspectFunctionArgs, automationLevel: string): any {
    const funcName = args.functionName;
    const filePath = args.filePath;
    const issue = args.issue ? `\nIssue: ${args.issue}` : '';

    const bestPractices = this.getBestPracticesPrefix();
    const resourceGuidance = this.getResourceReadingGuidance(automationLevel);
    const debugStateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${bestPractices}
I need to inspect the function "${funcName}" in ${filePath}.${issue}

${resourceGuidance}
Follow these steps IN ORDER:

STEP 1 - Set Breakpoint at Function Entry:
Call set_breakpoint at the first line of the function:
  Example: {"filePath": "${filePath}", "line": <first-line-of-function>}
  - This pauses execution when function is called
  - Allows inspection of input parameters

STEP 2 - Start Debugging:
${automationLevel === 'assisted' ? 'Start debugging in VS Code (F5), then trigger the code path that calls this function' : 'Call start_debugging with appropriate configuration (see STEP 0)'}

STEP 3 - Verify Function Entry (CRITICAL):
When breakpoint hits:

a. Call get_debug_state():
   Expected shape: ${debugStateExample}
   - Confirms we're paused at function entry

b. Call get_call_stack({"maxDepth": 5}):
   - Shows how the function was called
   - Top frame should be "${funcName}"

STEP 4 - Inspect Input Parameters:
Call get_variables to see function inputs:
  Example: {"scope": "Local"}
  - Shows all parameters passed to the function
  - Check if inputs match expected types/values
  - Look for null/undefined/incorrect values

STEP 5 - Navigate Through Function Logic:
${
  automationLevel === 'assisted'
    ? `I will guide you through the function step by step:
  - Tell me when to click "Step Over" (F10) in VS Code
  - At each interesting line, inspect variables again
  - Focus on:
    • Variable assignments
    • Conditional branches
    • Return statements`
    : `Set additional breakpoints at key points in the function:
  - Before conditional branches (if/switch)
  - After important calculations
  - Before return statement

Then use continue() and wait_for_breakpoint() to move between points
At each stop, call get_debug_state() and inspect variables`
}

STEP 6 - Track Intermediate State:
At each important point in the function:

a. Call get_variables({"scope": "Local"}) to see current state

b. Call evaluate_expression for specific checks:
   Example: {"expression": "result > 0"}
   Example: {"expression": "data.length"}
   - Verify intermediate calculations
   - Check loop counters
   - Validate conditions

STEP 7 - Inspect Return Value:
Set breakpoint at the return statement:
  Example: {"filePath": "${filePath}", "line": <return-line>}

When hit:
a. Call get_debug_state() to verify location

b. Call evaluate_expression to check return value:
   Example: {"expression": "returnValue"}
   - Verify the value being returned
   - Check if it matches expected output

STEP 8 - Analyze Function Behavior:
Based on collected data:
  - Explain what the function does step-by-step
  - Identify any unexpected behavior
  - Compare actual vs expected logic flow
  - Point out the root cause if there's an issue
  - Suggest fixes with code examples

COMMON ISSUES:
❌ "Function not found" → Verify function name and file path are correct
❌ Breakpoint not hit → Ensure code path actually calls this function
❌ Parameters show unexpected values → Check caller's logic
`,
          },
        },
      ],
    };
  }

  private generateDebugLoopPrompt(args: DebugLoopArgs, automationLevel: string): any {
    const location = args.loopLocation;
    const expected = args.expectedIterations
      ? ` It should run ${args.expectedIterations} times.`
      : '';

    const bestPractices = this.getBestPracticesPrefix();
    const resourceGuidance = this.getResourceReadingGuidance(automationLevel);
    const debugStateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);
    const callStackExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getCallStack);

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${bestPractices}
I have a loop issue at ${location}.${expected}

${resourceGuidance}
Follow these steps IN ORDER:

STEP 1 - Set Conditional Breakpoint:
Set a breakpoint INSIDE the loop with a condition to catch problematic iterations:

Examples:
  • For infinite loop: {"filePath": "/path/to/file", "line": <loop-line>, "condition": "i > 100"}
  • For wrong iterations: {"filePath": "/path/to/file", "line": <loop-line>, "hitCondition": "> ${args.expectedIterations || '10'}"}
  • For specific values: {"filePath": "/path/to/file", "line": <loop-line>, "condition": "item === null"}

The condition prevents hitting the breakpoint on every iteration - only when problem occurs.

STEP 2 - Start Debugging:
${automationLevel === 'assisted' ? 'Start debugging in VS Code (F5), then trigger the code path that contains this loop' : 'Call start_debugging with appropriate configuration (see STEP 0)'}

STEP 3 - Verify Conditional Breakpoint Hit (CRITICAL):
When the breakpoint hits (meaning condition is true):

a. Call get_debug_state():
   Expected: ${debugStateExample}
   - Confirms we caught the problematic iteration

b. Call get_call_stack({"maxDepth": 10}):
   Response: ${callStackExample}
   - Shows how we entered this loop
   - May reveal if loop is being called unexpectedly

STEP 4 - Inspect Loop Variables:
Call get_variables to see loop state:
  Example: {"scope": "Local"}
  Look for:
  - Loop counter (i, j, index, etc.)
  - Loop condition variables
  - Collection being iterated
  - Any accumulators or state variables

STEP 5 - Check Loop Condition:
Call evaluate_expression to examine the loop's exit condition:
  Examples:
    {"expression": "i < array.length"}  // Should this still be true?
    {"expression": "hasMore"}  // What controls this flag?
    {"expression": "items.length"}  // Is collection size changing?

  This reveals why the loop continues/stops unexpectedly

STEP 6 - Analyze Loop Behavior:
Determine the root cause:

a. For infinite loops, check:
   - Is counter being incremented? evaluate_expression({"expression": "i"})
   - Is condition ever false? Check the condition logic
   - Is collection being modified during iteration?

b. For wrong iteration count, check:
   - Starting value: evaluate_expression({"expression": "startIndex"})
   - Ending condition: evaluate_expression({"expression": "endCondition"})
   - Increment step: Look at loop increment in code

c. For unexpected behavior in loop body:
   - Check iteration variables match expected
   - Verify collection contents
   - Look for early break/continue/return statements

STEP 7 - Examine Loop Context:
If loop behavior is externally caused:

a. Call get_call_stack({"maxDepth": 10}):
   - See if loop is called from unexpected place
   - Check for recursive calls

b. Call get_variables({"scope": "Local"}):
   - Check variables from outer scopes
   - Look for shared state being modified

STEP 8 - Report Findings:
  - Identify exact loop issue (infinite, wrong count, logic error)
  - Explain WHY it's behaving incorrectly
  - Show current vs expected iteration behavior
  - Suggest fix with code example:
    • Add proper exit condition
    • Fix counter increment
    • Add bounds checking
    • Remove/fix early exits

COMMON ISSUES:
❌ Breakpoint hits on EVERY iteration → Add a condition to hit only on problematic cases
❌ "i is not defined" → Use the actual loop counter variable name
❌ Breakpoint never hits → Check condition syntax or remove condition temporarily
❌ Loop exits too early → Check break/continue statements and exit conditions
`,
          },
        },
      ],
    };
  }

  private generateAutoDebugSessionPrompt(args: AutoDebugSessionArgs): any {
    const issue = args.issue;
    const entryPoint = args.entryPoint ? ` starting from ${args.entryPoint}` : '';

    const bestPractices = this.getBestPracticesPrefix();
    const listResourcesExample = formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.listResources);
    const readResourceExample = formatJsonExample(RESOURCE_RESPONSE_EXAMPLES.readLaunchJson);
    const debugStateExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getDebugStatePaused);
    const callStackExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getCallStack);
    const variablesExample = formatJsonExample(TOOL_RESPONSE_EXAMPLES.getVariablesLocalScope);

    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${bestPractices}
I need help debugging: "${issue}"${entryPoint}

This is FULL AUTOMATION MODE - you have complete control over the debugging session.

Follow these steps IN ORDER:

STEP 1 - Find Debug Configuration:
a. Call list_resources() to see available resources
   Response will include: ${listResourcesExample}

b. Call read_resource with the launch.json URI:
   Example: {"uri": "debugssy:///myproject/launch.json"}
   Response contains: ${readResourceExample}

c. Parse the JSON to find configuration names:
   Look for "configurations" array, each has "name" field
   Common names: "Launch Program", "Debug Tests", "Debug Current File"

STEP 2 - Analyze the Issue:
Based on the issue description "${issue}":
  - Identify likely file(s) where the problem occurs${entryPoint ? `\n  - Focus on ${args.entryPoint}` : ''}
  - Determine strategic breakpoint locations:
    • Entry points to relevant functions
    • Areas where data is transformed
    • Conditional logic that might fail
    • Return statements or outputs

STEP 3 - Set Strategic Breakpoints:
Call set_breakpoint for each strategic location:
  Example: {"filePath": "/path/to/file", "line": 45}
  Example with condition: {"filePath": "/path/to/file", "line": 67, "condition": "user === null"}

Tips:
  - Start with 2-4 breakpoints to avoid too many stops
  - Use conditions to break only on problematic cases
  - Place breakpoints where you can inspect relevant state

STEP 4 - Start Debugging:
Call start_debugging with the configuration name from STEP 1:
  Example: {"name": "Launch Program"}

Wait for initialization - this may take a few seconds

STEP 5 - Wait for First Breakpoint:
Call wait_for_breakpoint to pause at first breakpoint:
  Example: {"timeout": 10000}
  - Timeout should be long enough for app to reach breakpoint
  - Default is 5000ms, increase if needed

If timeout occurs:
  ❌ No breakpoint hit → Check if breakpoints are in code path that actually executes

STEP 6 - Inspect State at Breakpoint (CRITICAL PATTERN):
At EACH breakpoint, follow this inspection pattern:

a. Call get_debug_state():
   Verify: ${debugStateExample}

b. Call get_call_stack({"maxDepth": 10}):
   Response: ${callStackExample}
   - Shows execution path to this point
   - Helps understand how we got here

c. Call get_variables({"scope": "Local"}):
   Response: ${variablesExample}
   CRITICAL: Use scope filter to reduce verbosity
   - Examine values for correctness
   - Look for null/undefined/unexpected values

d. Call evaluate_expression for specific checks:
   Example: {"expression": "user.isAuthenticated"}
   Example: {"expression": "data.length > 0"}
   - Verify hypotheses about the bug
   - Check specific conditions

STEP 7 - Continue to Next Breakpoint:
Call continue() to resume execution:
  No parameters needed

Then call wait_for_breakpoint() again:
  Example: {"timeout": 10000}

Repeat STEP 6 inspection pattern at this new location

STEP 8 - Narrow Down Root Cause:
As you collect data from multiple breakpoints:
  - Compare expected vs actual values
  - Track how data transforms between breakpoints
  - Identify where behavior diverges from expected
  - Look for patterns:
    • Missing null checks
    • Incorrect conditional logic
    • Wrong variable being used
    • Type mismatches
    • Off-by-one errors

STEP 9 - Optional: Check Console Output:
If relevant, call get_console_output:
  Example: {"limit": 100, "category": "console"}
  - May contain error messages or stack traces
  - Can provide additional context

STEP 10 - Stop Debugging:
When investigation is complete, call stop_debugging():
  No parameters needed
  - Cleans up debug session
  - Required before starting a new session

STEP 11 - Report Findings:
Provide comprehensive analysis:
  - Describe the root cause of "${issue}"
  - Explain WHERE the bug occurs (file:line)
  - Explain WHY it happens (logic error, missing check, etc.)
  - Show the sequence of events leading to the bug
  - Provide fix with code example
  - Suggest preventive measures (tests, validation, etc.)

AUTOMATION TIPS:
✅ Use wait_for_breakpoint between continue calls
✅ Always call get_debug_state before inspection
✅ Use scope: "Local" to reduce variable output
✅ Set conditional breakpoints to skip irrelevant hits
✅ Check "truncated" indicators in responses
✅ Call stop_debugging when done

COMMON ISSUES:
❌ "No active debug session" → Call start_debugging first
❌ wait_for_breakpoint timeout → Increase timeout or check if code path executes
❌ "Server already initialized" → Call stop_debugging and restart
❌ Breakpoint never hit → Verify breakpoint is in executed code path
`,
          },
        },
      ],
    };
  }
}
