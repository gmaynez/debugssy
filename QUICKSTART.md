# Debugsy Quick Start

## What is Debugsy?

Debugsy is a VS Code extension that exposes debugging capabilities through an MCP (Model Context Protocol) server. It allows you to control VS Code's debugger remotely via HTTP, making it possible to integrate debugging with AI assistants like Claude.

## Quick Start (3 Steps)

### 1. Run the Extension
```bash
# In the debugsy directory
npm install
npm run compile
# Press F5 in VS Code
```

This opens an Extension Development Host window with Debugsy active.

### 2. Start Debugging Something

In the Extension Development Host window:
- Open the `example` folder
- Open `example/test.js`
- Press F5 to start debugging
- Execution will run (add a breakpoint if you want to pause)

### 3. Test the MCP Server

The server is running at `http://localhost:3000/mcp`

```bash
# Test health endpoint
curl http://localhost:3000/health

# List available tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Available Tools at a Glance

### Debug Control
- `start_debugging` - Start a debug session
- `stop_debugging` - Stop current session
- `continue` - Continue execution
- `step_over` / `step_into` / `step_out` - Navigate code
- `pause` - Pause execution
- `restart` - Restart session

### Breakpoints
- `set_breakpoint` - Set breakpoint (supports conditions, logpoints)
- `remove_breakpoint` - Remove specific breakpoint
- `list_breakpoints` - List all breakpoints
- `toggle_breakpoint` - Enable/disable breakpoint
- `remove_all_breakpoints` - Clear all

### Inspection (requires paused execution)
- `get_variables` - Get variables in current scope
- `get_call_stack` - Get stack trace
- `evaluate_expression` - Evaluate expression in debug context
- `get_threads` - Get all threads

## Example Tool Calls

### Set a Breakpoint
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "set_breakpoint",
      "arguments": {
        "filePath": "C:/path/to/file.js",
        "line": 10,
        "condition": "x > 5"
      }
    }
  }'
```

### Get Call Stack (when paused)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_call_stack"
    }
  }'
```

### Evaluate Expression
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "evaluate_expression",
      "arguments": {
        "expression": "myVariable * 2"
      }
    }
  }'
```

## Configuration

Settings (File → Preferences → Settings → search "debugsy"):
- `debugsy.mcp.enabled` - Enable/disable server (default: true)
- `debugsy.mcp.port` - Server port (default: 3000)

Commands (Ctrl+Shift+P):
- `Debugsy: Start Server`
- `Debugsy: Stop Server`
- `Debugsy: Restart Server`

## Project Structure

```
debugsy/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── mcpServer.ts          # MCP server with HTTP transport
│   ├── config.ts             # Configuration management
│   ├── dap/
│   │   └── client.ts         # Debug Adapter Protocol client
│   └── tools/
│       ├── debugControl.ts   # Debug control tools
│       ├── breakpoints.ts    # Breakpoint management
│       ├── inspection.ts     # Variable inspection
│       └── index.ts          # Tool registry
├── example/
│   ├── test.js               # Example file for testing
│   └── .vscode/launch.json   # Debug config for example
├── package.json              # Extension manifest
├── tsconfig.json             # TypeScript config
└── README.md                 # Full documentation
```

## Use with Claude Desktop

Add to your Claude Desktop config:
```json
{
  "mcpServers": {
    "debugsy": {
      "url": "http://localhost:3000/mcp",
      "transport": "streamableHttp"
    }
  }
}
```

Then ask Claude: "Set a breakpoint at line 10 of test.js" or "What are the current variable values?"

## Troubleshooting

**Server won't start?**
- Check if port 3000 is in use
- Look at Output panel (View → Output → Debugsy)

**"No active debug session" error?**
- Make sure you've pressed F5 to start debugging
- Check that the debugger is running in the Extension Development Host window

**Can't get variables?**
- Ensure execution is paused at a breakpoint
- Try `get_call_stack` first to verify debugger state

## Next Steps

- See `GETTING_STARTED.md` for detailed walkthrough
- See `README.md` for complete API documentation
- Try the example in the `example/` folder
- Integrate with your own MCP client or AI assistant

## Key Technologies

- **MCP SDK**: [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **VS Code API**: [Debug API](https://code.visualstudio.com/api/references/vscode-api#debug)
- **DAP**: [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)
- **Transport**: Streamable HTTP (modern, preferred over SSE)

Enjoy debugging with AI! 🐛🤖

