# Getting Started with Debugssy

This guide will help you get up and running with the Debugssy VS Code extension.

> **💡 First Time Using Debugssy with AI?** Check out [COMPACT_PROMPT.txt](./COMPACT_PROMPT.txt) - paste it into your AI assistant to help it understand how to debug with Debugssy!

## Development Setup

### Prerequisites
- Node.js (v16 or higher)
- VS Code (v1.85.0 or higher)
- npm or yarn

### Installation

1. **Clone and Install Dependencies**
   ```bash
   cd debugssy
   npm install
   ```

2. **Compile the Extension**
   ```bash
   npm run compile
   ```

3. **Run the Extension**
   - Press `F5` in VS Code to open a new Extension Development Host window
   - The extension will activate automatically on startup
   - Check the Output panel (View → Output, select "Debugssy") for server logs

## Testing the MCP Server

### Step 1: Verify Server is Running

The MCP server should start automatically when the extension loads. You can verify it's running:

1. Open the Output panel (View → Output)
2. Look for the message: "MCP Server listening on http://localhost:3000/mcp"
3. Or check the health endpoint:
   ```bash
   curl http://localhost:3000/health
   ```

### Step 2: Open the Example Project

1. In the Extension Development Host window, open the `example` folder as a workspace
2. Open `test.js` to see the example code
3. The example already includes a launch configuration for debugging

### Step 3: Start a Debug Session

1. Open `test.js` in the editor
2. Set a breakpoint on line 10 (inside the `fibonacci` function)
3. Press F5 or Run → Start Debugging
4. The program will stop at your breakpoint

### Step 4: Test MCP Tools

Now you can test the MCP tools using an MCP client. Here's an example using curl:

#### List Available Tools
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

#### Get Call Stack (while paused at breakpoint)
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

#### Get Variables (while paused at breakpoint)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "get_variables"
    }
  }'
```

#### Evaluate Expression
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "evaluate_expression",
      "arguments": {
        "expression": "n + 1"
      }
    }
  }'
```

#### Continue Execution
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "continue"
    }
  }'
```

## Using MCP Prompts

Debugssy provides **MCP Prompts** - structured debugging workflows that AI assistants can request via the MCP protocol. These help guide the AI through common debugging scenarios.

### Available Prompts

- **`debug-crash`** - Debug crashes/exceptions
- **`trace-variable`** - Track where a variable becomes incorrect
- **`inspect-function`** - Examine function behavior
- **`debug-loop`** - Debug infinite loops or unexpected iterations
- **`auto-debug-session`** - Full automated debugging (full mode only)

### Example: Using a Prompt with Claude

```
You: Use the debug-crash prompt for this error: "TypeError: Cannot read property 'name' of undefined" in src/user.js

Claude: [Requests the prompt from Debugssy]
Claude: I'll help debug that crash. Let me set a breakpoint where the error occurs...
[Claude follows the structured workflow from the prompt]
```

The AI assistant can list available prompts and request them with specific arguments. Prompts adapt based on your automation mode (assisted vs full).

## Using with AI Assistants

### Claude Desktop Setup

1. **Configure Claude Desktop** to connect to Debugssy:
   ```json
   {
     "mcpServers": {
       "debugssy": {
         "url": "http://localhost:3000/mcp",
         "transport": "streamableHttp"
       }
     }
   }
   ```

2. **Start debugging in VS Code** (F5 or Run → Start Debugging)

3. **Give Claude context** - Paste [COMPACT_PROMPT.txt](./COMPACT_PROMPT.txt) into your conversation:
   ```
   You: [Paste COMPACT_PROMPT.txt content]
   
   You: I have a bug in my fibonacci function - it's returning wrong values
   
   Claude: I'll help debug that. Let me start by setting a breakpoint...
   [Claude uses set_breakpoint, get_variables, etc.]
   ```

4. **Work with Claude** to debug using the available tools

### Other MCP Clients

For any MCP client that supports Streamable HTTP transport:
1. Connect to `http://localhost:3000/mcp`
2. Use the Streamable HTTP transport
3. Paste the appropriate prompt to help the AI understand Debugssy
4. Start debugging!

## Extension Configuration

You can configure the extension in VS Code settings:

```json
{
  "debugssy.mcp.enabled": true,
  "debugssy.mcp.port": 3000,
  "debugssy.automationLevel": "assisted",
  "debugssy.waitForBreakpointTimeout": 10000
}
```

### Configuration Options

- **`debugssy.mcp.enabled`**: Enable or disable the MCP server
- **`debugssy.mcp.port`**: Port for the MCP server (default: 3000)
- **`debugssy.automationLevel`**: Control AI automation level
  - `assisted` (default): AI assists but user controls execution flow
  - `full`: AI has complete control over debugging
- **`debugssy.waitForBreakpointTimeout`**: Default timeout for wait_for_breakpoint (default: 10000ms)

### Live Configuration Updates

When you change settings in VS Code (File → Preferences → Settings → search for "debugssy"):

- **Changing automation level**: The MCP server automatically restarts to expose the correct tool set. You'll see notifications confirming the change. MCP clients should reconnect automatically.
- **Changing port**: The server restarts on the new port.
- **Enabling/disabling**: The server starts or stops accordingly.

These changes take effect immediately without requiring a VS Code reload.

## Commands

Available commands in the Command Palette (Ctrl+Shift+P):

- `Debugssy: Start Server` - Manually start the MCP server
- `Debugssy: Stop Server` - Stop the MCP server
- `Debugssy: Restart Server` - Restart the MCP server

## Troubleshooting

### Server Won't Start

**Problem**: Error message "Port 3000 is already in use"

**Solution**: Change the port in settings or stop the process using port 3000

### No Active Debug Session

**Problem**: Tools return "No active debug session" error

**Solution**: Make sure you've started a debug session (F5) in the Extension Development Host window

### Variables Not Available

**Problem**: `get_variables` returns empty or error

**Solution**: 
- Ensure execution is paused at a breakpoint
- Try getting the call stack first to verify the debugger is active
- Check that your debug adapter supports the DAP protocol properly

### Connection Refused

**Problem**: Cannot connect to the MCP server

**Solution**:
- Check the Output panel to verify the server started
- Ensure you're connecting to the correct port
- Verify the extension is active in the Extension Development Host

## Next Steps

- Explore all available tools by calling `tools/list`
- Try setting breakpoints programmatically with `set_breakpoint`
- Experiment with conditional breakpoints and logpoints
- Build an MCP client that automates debugging tasks
- Integrate with AI assistants for intelligent debugging

## Additional Resources

- [MCP Specification](https://modelcontextprotocol.io)
- [VS Code Debug API](https://code.visualstudio.com/api/references/vscode-api#debug)
- [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)

