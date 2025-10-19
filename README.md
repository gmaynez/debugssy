# Debugsy

A VS Code extension that provides debugging capabilities through a Model Context Protocol (MCP) server. Control VS Code's debugger remotely via MCP tools for breakpoint management, debug control, and variable inspection.

## Features

- **MCP Server with Streamable HTTP**: Embedded HTTP server exposing debugging tools via MCP protocol
- **Debug Control**: Start, stop, pause, continue, step over/into/out operations
- **Breakpoint Management**: Set, remove, list, and toggle breakpoints programmatically
- **Variable Inspection**: Read variables, evaluate expressions, and inspect call stacks
- **DAP Integration**: Direct access to Debug Adapter Protocol for detailed debugger state

## Installation

1. Clone or download this extension
2. Run `npm install` to install dependencies
3. Press F5 to run the extension in a new VS Code window (Extension Development Host)

## Configuration

Configure the MCP server through VS Code settings:

- `debugsy.mcp.enabled` (default: `true`): Enable/disable the MCP server
- `debugsy.mcp.port` (default: `3000`): Port for the MCP server (localhost only)

## Available MCP Tools

### Debug Control Tools

#### `start_debugging`
Start a debugging session with a configuration from `launch.json` or a custom configuration.

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

#### `continue`
Continue execution from a breakpoint.

#### `step_over`
Step over the current line.

#### `step_into`
Step into a function call.

#### `step_out`
Step out of the current function.

#### `pause`
Pause execution.

#### `restart`
Restart the current debug session.

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
  name: 'debugsy-client',
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

## Commands

The extension provides the following VS Code commands:

- `debugsy.startServer`: Manually start the MCP server
- `debugsy.stopServer`: Manually stop the MCP server
- `debugsy.restartServer`: Restart the MCP server

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
│   VS Code Extension (Debugsy)       │
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

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

Apache 2.0

