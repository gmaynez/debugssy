# Debugssy

A VS Code extension that provides debugging capabilities through a Model Context Protocol (MCP) server. Control VS Code's debugger remotely via MCP tools for breakpoint management, debug control, and variable inspection.

## Features

- **MCP Server with Streamable HTTP**: Embedded HTTP server exposing debugging tools via MCP protocol
- **Debug Control**: Start, stop, pause, continue, step over/into/out operations
- **Breakpoint Management**: Set, remove, list, and toggle breakpoints programmatically
- **Variable Inspection**: Read variables, evaluate expressions, and inspect call stacks
- **DAP Integration**: Direct access to Debug Adapter Protocol for detailed debugger state
- **Security**: Origin validation and localhost-only binding to prevent attacks

## Security

Debugssy follows [MCP specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) security best practices (with backwards compatibility for 2025-03-26):

- **Localhost Only**: Server binds exclusively to `localhost` (127.0.0.1), preventing external network access
- **Origin Validation**: All requests are validated to ensure they originate from localhost, protecting against DNS rebinding attacks
- **Session Management**: Cryptographically secure session IDs with proper lifecycle management
- **No Remote Access**: The server cannot be accessed from other machines on your network

For detailed compliance information, see [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md).

## Installation

1. Clone or download this extension
2. Run `npm install` to install dependencies
3. Press F5 to run the extension in a new VS Code window (Extension Development Host)

## Configuration

Configure the MCP server through VS Code settings:

- `debugssy.mcp.enabled` (default: `true`): Enable/disable the MCP server
- `debugssy.mcp.port` (default: `3000`): Port for the MCP server (localhost only)
- `debugssy.automationLevel` (default: `assisted`): Control AI automation level
  - `assisted`: AI can set breakpoints and inspect variables, but user controls execution flow via VS Code UI (safer, recommended)
  - `full`: AI has complete control over debugging including starting sessions, stepping, and continuing execution
- `debugssy.waitForBreakpointTimeout` (default: `10000`): Default timeout in milliseconds for wait_for_breakpoint tool (1s to 5min). Can be overridden per-call.

### MCP Client Configuration (Claude Desktop, etc.)

For MCP clients that support tool allowlists, see the **[MCP Allowlist Recommendations](#mcp-allowlist-recommendations)** section below for guidance on which tools are safe to auto-approve.

## Automation Levels

Debugssy supports two automation levels to balance AI assistance with user control:

**Important:** The MCP server dynamically exposes different tools based on your current automation level. This prevents AI agents from attempting to call tools that would be blocked, providing a better user experience. Tools like `start_debugging` and `wait_for_breakpoint` are only exposed in full automation mode.

### Assisted Mode (Default)
In **assisted mode**, the AI agent can:
- ✅ Set, remove, and manage breakpoints
- ✅ Inspect variables, evaluate expressions, and read call stacks
- ✅ Query debug state (is execution paused? where?)
- ✅ Stop debugging sessions (safety escape hatch)
- ✅ Call execution control tools (`continue`, `step_*`, etc.) which return friendly prompts like "Please click Continue in VS Code debugger UI"

But the user must:
- 🔵 Start debugging sessions manually via VS Code
- 🔵 Control execution flow by clicking buttons in VS Code debugger UI

**Tools NOT exposed in assisted mode:**
- ❌ `start_debugging` - Must start manually
- ❌ `wait_for_breakpoint` - Requires automation to be useful

This mode provides maximum safety and control, ideal for:
- Senior engineers who want to maintain situational awareness
- Learning and understanding code behavior step-by-step
- Production or critical debugging scenarios

### Full Automation Mode
In **full mode**, the AI agent has complete control:
- ✅ Everything from assisted mode
- ✅ Start debugging sessions programmatically (`start_debugging`)
- ✅ Control execution flow automatically (continue, step over/into/out, pause, restart)
- ✅ Wait for breakpoint hits with timeout (`wait_for_breakpoint`)

**Additional tools exposed in full mode:**
- ✅ `start_debugging` - Programmatically start debug sessions
- ✅ `wait_for_breakpoint` - Block until execution pauses

This mode is ideal for:
- Rapid iteration and exploration
- AI-driven "vibe coding" workflows
- Automated testing and validation scenarios
- Experienced users comfortable with AI autonomy

## Available MCP Tools

### Debug Control Tools

**Note:** In **assisted mode**, flow control tools (`continue`, `step_*`, `pause`, `restart`) will return a message asking the user to use VS Code UI. Only in **full mode** do these tools execute automatically.

#### `start_debugging`
**[Full automation mode only]** Start a debugging session with a configuration from `launch.json` or a custom configuration.

**Automation:** Full mode only (returns error in assisted mode)

**Parameters:**
- `workspaceFolder` (optional): Name or path of workspace folder
- `name` (optional): Name of debug configuration from launch.json
- `configuration` (optional): Full debug configuration object

**Example:**
```json
{
  "name": "Launch Program"
}
```

#### `stop_debugging`
Stop the current debugging session.

**Automation:** Available in all modes (safety escape hatch)

#### `continue`
Continue execution from a breakpoint.

**Automation:** Full mode executes; assisted mode returns guidance message

#### `step_over`
Step over the current line.

**Automation:** Full mode executes; assisted mode returns guidance message

#### `step_into`
Step into a function call.

**Automation:** Full mode executes; assisted mode returns guidance message

#### `step_out`
Step out of the current function.

**Automation:** Full mode executes; assisted mode returns guidance message

#### `pause`
Pause execution.

**Automation:** Full mode executes; assisted mode returns guidance message

#### `restart`
Restart the current debug session.

**Automation:** Full mode executes; assisted mode returns guidance message

### Breakpoint Tools

#### `set_breakpoint`
Set a breakpoint at a specific file and line.

**Parameters:**
- `filePath` (required): Absolute path to the file
- `line` (required): Line number (1-based)
- `condition` (optional): Condition expression for conditional breakpoint
- `hitCondition` (optional): Hit count condition
- `logMessage` (optional): Log message (creates a logpoint)

**Example:**
```json
{
  "filePath": "/path/to/file.js",
  "line": 42,
  "condition": "x > 10"
}
```

#### `remove_breakpoint`
Remove a breakpoint at a specific location.

**Parameters:**
- `filePath` (required): Absolute path to the file
- `line` (required): Line number (1-based)

#### `list_breakpoints`
List all breakpoints in the workspace.

**Returns:**
```json
{
  "success": true,
  "breakpoints": [
    {
      "id": "...",
      "location": {
        "uri": "/path/to/file.js",
        "line": 42
      },
      "enabled": true,
      "condition": "x > 10"
    }
  ]
}
```

#### `toggle_breakpoint`
Toggle a breakpoint's enabled/disabled state.

**Parameters:**
- `filePath` (required): Absolute path to the file
- `line` (required): Line number (1-based)

#### `remove_all_breakpoints`
Remove all breakpoints from the workspace.

### Inspection Tools

#### `get_variables`
Get variables from the current stack frame.

**Parameters:**
- `scope` (optional): Scope name to filter (e.g., "Local", "Global")
- `frameId` (optional): Frame ID (defaults to current frame)

**Returns:**
```json
{
  "success": true,
  "data": {
    "frameId": 0,
    "scopes": [
      {
        "name": "Local",
        "variables": [
          {
            "name": "x",
            "value": "42",
            "type": "number"
          }
        ]
      }
    ]
  }
}
```

#### `get_call_stack`
Get the current call stack.

**Returns:**
```json
{
  "success": true,
  "data": {
    "frames": [
      {
        "id": 0,
        "name": "myFunction",
        "source": "/path/to/file.js",
        "line": 42,
        "column": 10
      }
    ]
  }
}
```

#### `evaluate_expression`
Evaluate an expression in the current debug context.

**Parameters:**
- `expression` (required): Expression to evaluate
- `frameId` (optional): Frame ID (defaults to current frame)

**Example:**
```json
{
  "expression": "x + y"
}
```

**Returns:**
```json
{
  "success": true,
  "data": {
    "expression": "x + y",
    "result": "15",
    "type": "number"
  }
}
```

#### `get_threads`
Get all threads in the current debug session.

#### `get_debug_state`
Get the current debug session state including execution status and location information.

**Automation:** Available in all modes

**Returns:**
```json
{
  "success": true,
  "data": {
    "hasActiveSession": true,
    "sessionName": "Launch Program",
    "sessionType": "node",
    "executionState": "paused",
    "stoppedInfo": {
      "reason": "breakpoint",
      "description": "Paused on breakpoint",
      "threadId": 1,
      "allThreadsStopped": true,
      "hitBreakpointIds": [1]
    },
    "currentLocation": {
      "file": "/path/to/file.js",
      "line": 42,
      "column": 5,
      "functionName": "myFunction"
    }
  }
}
```

**Execution States:**
- `not_started`: No debug session active or hasn't started yet
- `running`: Debug session active and executing
- `paused`: Execution paused (at breakpoint, after step, etc.)
- `terminated`: Debug session ended

**Use Case:** Call this before `evaluate_expression` or `get_variables` to ensure execution is paused and ready for inspection.

#### `wait_for_breakpoint`
**[Full automation mode only]** Wait for execution to pause at a breakpoint. Blocks until the next breakpoint is hit or timeout occurs.

**Automation:** Full mode only (not exposed to AI agents in assisted mode)

**Parameters:**
- `timeout` (optional): Timeout in milliseconds. If not provided, uses `debugssy.waitForBreakpointTimeout` setting (default: 10000ms)

**Returns:** Same as `get_debug_state` when breakpoint is hit

**Example workflow (full mode):**
```
1. set_breakpoint at line 42
2. continue
3. wait_for_breakpoint (blocks until hit, uses configured timeout)
   OR
3. wait_for_breakpoint(timeout: 5000) (override with 5s timeout)
4. evaluate_expression "myVar"
5. get_variables
```

**Configuration:**
You can set the default timeout globally in VS Code settings:
```json
{
  "debugssy.waitForBreakpointTimeout": 15000  // 15 seconds
}
```

## Usage Examples

### Assisted Mode Workflow (Default)

In assisted mode, the AI helps you set up debugging but you maintain control:

```
AI: "I'll set a breakpoint at line 42 where the calculation happens"
AI: set_breakpoint(filePath: "app.js", line: 42)

AI: "Please start debugging using VS Code (F5) and click Continue when you're ready"

[User starts debugging and clicks Continue in VS Code UI]
[Execution pauses at breakpoint]

AI: get_debug_state()
→ Returns: { executionState: "paused", currentLocation: "app.js:42" }

AI: "Now I can inspect the values"
AI: get_variables()
→ Returns: { x: 10, y: 20, result: undefined }

AI: evaluate_expression("x + y")
→ Returns: { result: "30" }

AI: "The values look correct. Please click Continue to proceed."
```

### Full Automation Mode Workflow

In full mode, the AI controls the entire debugging session:

```
AI: "I'll debug this function automatically"
AI: set_breakpoint(filePath: "app.js", line: 42)
AI: start_debugging(name: "Launch Program")
AI: wait_for_breakpoint(timeout: 5000)
→ Blocks until breakpoint hit
→ Returns: { executionState: "paused", currentLocation: "app.js:42" }

AI: get_variables()
→ Returns: { x: 10, y: 20 }

AI: evaluate_expression("x + y")
→ Returns: { result: "30" }

AI: "Found the issue. Setting another breakpoint to verify the fix."
AI: set_breakpoint(filePath: "app.js", line: 55)
AI: continue()
AI: wait_for_breakpoint()
→ Execution continues and pauses at line 55

AI: evaluate_expression("finalResult")
→ Returns: { result: "30" }

AI: "Verification complete. Stopping debug session."
AI: stop_debugging()
```

## MCP Server Endpoints

- **MCP Endpoint**: `http://localhost:3000/mcp` (Streamable HTTP transport)
- **Health Check**: `http://localhost:3000/health`

## Usage with MCP Clients

Connect to the MCP server using any MCP client that supports Streamable HTTP transport:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp')
);

const client = new Client({
  name: 'debugssy-client',
  version: '1.0.0'
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: 'set_breakpoint',
  arguments: {
    filePath: '/path/to/file.js',
    line: 42
  }
});
```

## MCP Allowlist Recommendations

When using Debugssy with MCP clients that support tool allowlists (like Claude Desktop), you can configure which tools should be automatically approved without requiring user confirmation for each call.

> **📋 Quick Start:** See [ALLOWLIST_GUIDE.md](./ALLOWLIST_GUIDE.md) for copy-paste configuration examples!

### ✅ Safe Tools (Recommended for Allowlist)

These tools are **read-only** and have no side effects. They're safe to add to your allowlist:

#### Inspection Tools (Always Safe)
- **`debugssy:get_debug_state`** - Query current debug session state and execution status
- **`debugssy:get_variables`** - Read variable values from current stack frame
- **`debugssy:get_call_stack`** - Read the current call stack
- **`debugssy:get_threads`** - List all threads in the debug session
- **`debugssy:list_breakpoints`** - List all breakpoints in the workspace
- **`debugssy:wait_for_breakpoint`** - Wait for execution to pause (passive operation, full mode only)

**Why these are safe:** These tools only read debugging state without modifying anything. They cannot alter your code execution, change breakpoints, or affect your debugging session.

**Example allowlist configuration** (e.g., in Claude Desktop's `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugssy:get_debug_state",
        "debugssy:get_variables",
        "debugssy:get_call_stack",
        "debugssy:get_threads",
        "debugssy:list_breakpoints",
        "debugssy:wait_for_breakpoint"
      ]
    }
  }
}
```

### ⚠️ Write Tools (Require User Approval)

These tools modify state or control execution. They should **NOT** be allowlisted:

#### Breakpoint Management
- **`debugssy:set_breakpoint`** - Creates a new breakpoint
- **`debugssy:remove_breakpoint`** - Removes a breakpoint
- **`debugssy:toggle_breakpoint`** - Enables/disables a breakpoint
- **`debugssy:remove_all_breakpoints`** - Removes all breakpoints

#### Debug Control (Full Mode)
- **`debugssy:start_debugging`** - Starts a debug session
- **`debugssy:stop_debugging`** - Stops the current debug session
- **`debugssy:continue`** - Resumes execution
- **`debugssy:step_over`** - Steps over current line
- **`debugssy:step_into`** - Steps into function
- **`debugssy:step_out`** - Steps out of function
- **`debugssy:pause`** - Pauses execution
- **`debugssy:restart`** - Restarts debug session

#### Expression Evaluation
- **`debugssy:evaluate_expression`** - Evaluates code (can have side effects)

**Why approval is needed:** These tools can modify your debugging environment, change execution flow, or execute arbitrary code. You should review each call to ensure it aligns with your intent.

### Workflow Recommendations

#### For Read-Only Analysis (Safest)
If you're only having the AI analyze your code without making changes:
```json
"allowlist": [
  "debugssy:get_debug_state",
  "debugssy:get_variables",
  "debugssy:get_call_stack",
  "debugssy:list_breakpoints"
]
```

#### For Active Debugging with Breakpoints
If you want the AI to set breakpoints but maintain control over execution:
```json
"allowlist": [
  "debugssy:get_debug_state",
  "debugssy:get_variables",
  "debugssy:get_call_stack",
  "debugssy:get_threads",
  "debugssy:list_breakpoints"
]
```
Then manually approve `set_breakpoint` calls as needed.

#### For Full Automation (Advanced)
If you're in full automation mode and trust the AI completely, you might allowlist more tools, but this is **not recommended** for production debugging:
```json
"allowlist": [
  "debugssy:get_debug_state",
  "debugssy:get_variables",
  "debugssy:get_call_stack",
  "debugssy:get_threads",
  "debugssy:list_breakpoints",
  "debugssy:wait_for_breakpoint",
  "debugssy:set_breakpoint",
  "debugssy:continue"
]
```

### Security Note

The read-only inspection tools are safe to allowlist because:
1. They cannot modify your code or debugging state
2. They cannot execute arbitrary code
3. They only read information that's already visible in VS Code's debugger UI
4. They respect VS Code's security model and permissions

Even with these tools allowlisted, you maintain complete control through:
- Automation level settings (assisted vs full mode)
- Manual approval of write operations
- VS Code's built-in debugging safeguards

## Commands

The extension provides the following VS Code commands:

- `debugssy.startServer`: Manually start the MCP server
- `debugssy.stopServer`: Manually stop the MCP server
- `debugssy.restartServer`: Restart the MCP server

## Requirements

- VS Code 1.85.0 or higher
- Node.js for running the extension

## Development

1. Clone the repository
2. Run `npm install`
3. Press F5 to open a new VS Code window with the extension loaded
4. Start a debug session in a workspace
5. Connect an MCP client to `http://localhost:3000/mcp`

## Architecture

```
┌─────────────────────────────────────┐
│   VS Code Extension (Debugssy)       │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   MCP Server                 │  │
│  │   (Streamable HTTP)          │  │
│  │   Port: 3000                 │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
│  ┌──────────────┴───────────────┐  │
│  │   Tool Registry              │  │
│  │   - Debug Control Tools      │  │
│  │   - Breakpoint Tools         │  │
│  │   - Inspection Tools         │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
│  ┌──────────────┴───────────────┐  │
│  │   VS Code Debug API          │  │
│  │   + DAP Client               │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
                 │
                 │ HTTP/MCP Protocol
                 │
        ┌────────▼────────┐
        │   MCP Client    │
        │  (Claude, etc)  │
        └─────────────────┘
```

## Known Limitations

- Watch expressions are not directly accessible via VS Code API (use `evaluate_expression` instead)
- The extension currently assumes thread ID 1 for some DAP operations
- Session management is simplified for single-threaded debugging scenarios
- In assisted mode, AI cannot detect when user manually clicks continue/step (use `get_debug_state` to poll current state)
- `wait_for_breakpoint` requires the debug session to already be running (call after `continue` in full mode)

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

Apache 2.0

