# Debugssy

[![VS Code Marketplace Version](https://vsmarketplacebadges.dev/version-short/gamag.debugssy.svg)](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
[![Open VSX Version](https://img.shields.io/open-vsx/v/gamag/debugssy?label=Open%20VSX)](https://open-vsx.org/extension/gamag/debugssy)

**AI-powered debugging for VS Code.** Control your debugger with natural language through any AI coding assistant (Cursor, Copilot, etc.) using the Model Context Protocol (MCP).

TL;DR: Install the extension, connect your AI via MCP, and debug—no extra setup needed in assisted mode. Recommended model: **Claude 4.5 Haiku** — fast, smart, and low-cost.

Install now: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy) · [Open VSX](https://open-vsx.org/extension/gamag/debugssy)

Pro tip: Use built-in MCP prompts: `/debug-crash`, `/trace-variable`, `/inspect-function`, `/debug-loop`, and `/auto-debug-session` (full mode).

Jump to: [Quick Start](#quick-start-3-steps) · [Configuration](#configuration) · [Tools](#tools) · [Troubleshooting](#troubleshooting)

---

## What is Debugssy?

Debugssy is a VS Code extension that lets you **debug with AI assistance**. Instead of manually clicking through the debugger, you can ask your AI assistant to:

- Set breakpoints where bugs might be
- Inspect variables to understand what's wrong
- Step through code and explain what's happening
- Trace how values change during execution

---

## Quick Start (3 Steps)

### 1. Install the Extension

**Option A: From Extension Marketplace**

- [**→ Install from VS Code Marketplace**](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
- [**→ Install from Open VSX**](https://open-vsx.org/extension/gamag/debugssy) (for VSCodium, Gitpod, etc.)

Or search "Debugssy" in VS Code Extensions (`Ctrl+Shift+X`)

**Option B: Manual Installation (VSIX)**

1. Download the latest `.vsix` file from [GitHub Releases](https://github.com/gmaynez/debugssy/releases)
2. Open VS Code
3. Drag and drop the `.vsix` file into the VS Code window

Or install via command line:
```bash
code --install-extension path/to/debugssy-<version>.vsix
```

**Option C: Development Mode**
```bash
git clone <repository>
cd debugssy
npm install
# Press F5 in VS Code
```

### 2. Configure Your AI Assistant

Add Debugssy's MCP server to your AI assistant settings:

> Recommended model: **Claude 4.5 Haiku** — fast, smart, and low-cost for interactive debugging.

**For Cursor:**

[**→ One-click install in Cursor**](https://cursor.com/en-US/install-mcp?name=debugssy&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9tY3AifQ%3D%3D)

Or manually add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**For GitHub Copilot:**

Add to your VS Code `settings.json` (File → Preferences → Settings → Edit in settings.json):

```json
{
  "github.copilot.chat.mcp.servers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**For Claude Desktop:**

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

**For other MCP-compatible assistants:** Connect to `http://localhost:3000/mcp`

### 3. Start Debugging

1. Open your code in VS Code
2. Tell your AI assistant about the bug
3. The AI will guide you through debugging!

Tip: Use built-in MCP prompts for guided workflows: `debug-crash`, `trace-variable`, `inspect-function`, `debug-loop`, `auto-debug-session`. In Cursor and Copilot Chat, type `/` in the chat to see available prompts. See [MCP Prompts](#mcp-prompts-debugging-workflows).

**That's it!** The AI can now help you debug by setting breakpoints, inspecting variables, and understanding your code's behavior.

---

## Features at a Glance

- 🔴 **Smart Breakpoints** - AI sets breakpoints where bugs likely are
- 🔍 **Variable Inspection** - AI reads and explains variable values
- 📚 **Call Stack Analysis** - AI shows how you got to the current point
- 🎯 **Conditional Breakpoints** - Only stop when specific conditions are met
- 🚦 **Two Automation Modes** - Choose between assisted (you control) or full automation
- 🔒 **Secure** - Localhost-only, origin validation, follows MCP security best practices

---

## Modes

- Assisted (default): You control start/step/continue in VS Code; AI inspects and manages breakpoints.
- Full: AI may start sessions and control execution.

Switch in settings:
```json
{ "debugssy.automationLevel": "assisted" }
```
```json
{ "debugssy.automationLevel": "full" }
```

---

## Configuration

### VS Code Settings

Access via `File → Preferences → Settings` (search "debugssy"):

```json
{
  "debugssy.mcp.enabled": true,                    // Enable the MCP server
  "debugssy.mcp.port": 3000,                       // Server port
  "debugssy.automationLevel": "assisted",          // or "full"
  "debugssy.waitForBreakpointTimeout": 5000,       // Timeout in ms
  "debugssy.allowStepOperations": false            // Expose step_over/step_into/step_out in full mode
}
```

Note: VS Code `settings.json` supports comments.

### MCP Client Configuration

**Recommended Allowlist** (for Claude Desktop, Cursor, etc.):

Add these safe, read-only tools that won't modify your code:

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
        "debugssy:get_console_output",
        "debugssy:list_breakpoints"
      ]
    }
  }
}
```

> **📋 Need more details?** See [ALLOWLIST_GUIDE.md](./ALLOWLIST_GUIDE.md) for complete configuration examples.

---

 

## Security & Privacy

Debugssy is designed with security as a priority:

- 🔒 **Localhost Only** - Server binds to `localhost` (no network access)
- ✅ Follows [MCP 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices) security best practices

> **📋 For security details:** See [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md)

---

## Available Resources

Debugssy exposes workspace configuration as MCP resources for context:

### 📄 Debug Configuration Resources
- **`debugssy:///{workspaceName}/launch.json`** - Exposes debug configurations from `.vscode/launch.json`
  - Lists available debug configuration names
  - Used by `start_debugging` tool to know which configurations are available
  - AI assistants can read this before starting a debug session

**Example:** List resources to see available launch.json files, then read them to find configuration names.

---

## Tools

The AI assistant has access to these debugging tools:

### 🔍 Inspection Tools (Always Available)
- `get_debug_state` - Check if debugger is running/paused
- `get_variables` - Read variable values
- `get_call_stack` - See the call stack
- `evaluate_expression` - Evaluate expressions
- `get_threads` - List all threads
- `get_console_output` - Read debug console output (stdout, stderr, console.log)
- `clear_console_output` - Clear the console output buffer

### 🔴 Breakpoint Tools (Always Available)
- `set_breakpoint` - Set breakpoints (with conditions, hit counts, log messages)
- `remove_breakpoint` - Remove specific breakpoint
- `list_breakpoints` - Show all breakpoints
- `toggle_breakpoint` - Enable/disable breakpoint
- `remove_all_breakpoints` - Clear all breakpoints

### ▶️ Execution Control
- `continue`, `step_over`, `step_into`, `step_out`, `pause`, `restart`, `stop_debugging`
  - **Assisted mode**: Not exposed (use VS Code UI)
  - **Full mode**: AI controls these automatically (may start/continue sessions)
  - Note: `step_over`/`step_into`/`step_out` are hidden by default; enable via `debugssy.allowStepOperations`.

### 🚀 Advanced (Full Mode Only)
- `start_debugging` - Start debug session programmatically
- `wait_for_breakpoint` - Wait for execution to pause

---

## MCP Resources API

### Listing Resources
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'
```

### Reading a Resource
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"debugssy:///myproject/launch.json"}}'
```

---

## MCP Prompts (Debugging Workflows)

Debugssy provides structured debugging workflows that AI assistants can use:

How to access prompts:
- Cursor: Open the chat and type `/` to view available prompts.
- Copilot Chat (VS Code): Open the chat panel and type `/` to view available prompts.

> Recommended model: **Claude 4.5 Haiku** — fast, smart, and low-cost for interactive debugging.

- **`debug-crash`** - Debug crashes and exceptions
  - In full mode: Guides LLM to check launch.json resource before starting
  - Hints to use scope filters and maxDepth for efficiency
  
- **`trace-variable`** - Track where a variable becomes incorrect
  - Optimized with scope filtering and simple expressions
  - Guides proper resource usage in full mode
  
- **`inspect-function`** - Examine function behavior
  - Includes launch.json resource hints for full automation
  - Recommends efficient variable inspection patterns
  
- **`debug-loop`** - Debug infinite loops or unexpected iterations
  - Suggests conditional breakpoints and limited stack depth
  - Resource-aware in full automation mode
  
- **`auto-debug-session`** - Full automated debugging (full mode only)
  - **Enhanced:** Step-by-step guidance including:
    1. List MCP resources to find launch.json
    2. Read configuration before starting debug session
    3. Use scope filters and limits for context efficiency
    4. Verify breakpoint hits with get_debug_state
    5. Systematic narrowing of root cause

> **💡 For AI Assistants:** All prompts now include best practices for context efficiency (scope filters, maxDepth, simple expressions) and guide proper use of MCP resources.

---

## Requirements

- **VS Code** 1.85.0 or higher
- **Node.js** (for development/building)
- **MCP-compatible AI assistant** (Claude Desktop, Cursor, Copilot, or custom client)

---

## Commands

Access these via Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- `Debugssy: Start Server` - Manually start the MCP server
- `Debugssy: Stop Server` - Stop the MCP server
- `Debugssy: Restart Server` - Restart the MCP server

---

## Troubleshooting

### "No active debug session" error
**Solution:** Start debugging in VS Code (press F5) before asking AI to inspect variables

### Server won't start or port is in use
**Solution:** Change port in settings or stop process using port 3000
```json
{ "debugssy.mcp.port": 3001 }
```

### AI can't connect to server
**Solution:** 
1. Check Output panel: `View → Output → Debugssy`
2. Verify server is running: `curl http://localhost:3000/health`
3. Check your AI assistant's MCP configuration

### Variables not available
**Solution:** 
1. Ensure execution is paused at a breakpoint
2. Try `get_debug_state` first to verify debugger state

---

## Technical Details

<details>
<summary>🏗️ Architecture (Click to expand)</summary>

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
        │ (AI Assistant)  │
        └─────────────────┘
```

</details>

<details>
<summary>🔌 MCP Server Endpoints</summary>

- **MCP Endpoint**: `http://localhost:3000/mcp` (Streamable HTTP transport)
- **Health Check**: `http://localhost:3000/health`

**Test with curl:**
```bash
# Health check
curl http://localhost:3000/health

# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

</details>

<details>
<summary>🔧 Using MCP SDK (for custom clients)</summary>

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://localhost:3000/mcp')
);

const client = new Client({
  name: 'my-client',
  version: '1.0.0'
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: 'get_call_stack'
});
```

</details>

<details>
<summary>📊 Tool Details & Parameters</summary>

### `set_breakpoint`
```json
{
  "filePath": "/absolute/path/to/file.js",
  "line": 42,
  "condition": "x > 10",              // Optional
  "hitCondition": "> 5",              // Optional
  "logMessage": "Value: {x}"          // Optional (creates logpoint)
}
```

### `get_variables`
```json
{
  "scope": "Local",                    // Optional: scope prefix (case-insensitive)
  "frameId": 0                         // Optional: defaults to current frame
}
```

**Note:** Scope filtering uses prefix matching. "Local" matches scopes like "Local: functionName", making it easy to filter local variables without knowing the exact function name.

### `evaluate_expression`
```json
{
  "expression": "x + y",
  "frameId": 0                         // Optional: defaults to current frame
}
```

### `start_debugging` (Full mode only)
```json
{
  "name": "Launch Program",            // Name from launch.json
  "workspaceFolder": "myproject",      // Optional
  "configuration": { /* custom */ }    // Optional: full config object
}
```

**Tip:** Use MCP resources to read `debugssy:///{workspaceName}/launch.json` first to find available configuration names.

### `wait_for_breakpoint` (Full mode only)
```json
{
  "timeout": 10000                     // Optional: ms (default: 5000)
}
```

### `get_call_stack`
```json
{
  "maxDepth": 10                       // Optional: max stack frames (default: 20)
}
```

**Note:** Returns `truncated: true` if call stack was limited.

### `get_console_output`
```json
{
  "category": "stdout",                // Optional: "console", "stdout", "stderr", "telemetry"
  "limit": 50,                         // Optional: max entries (default: 50, max: 1000)
  "since": 1704067200000,              // Optional: Unix timestamp (ms) for filtering
  "clear": false                       // Optional: clear buffer after reading
}
```

**Note:** Returns `truncated: true` if more entries are available.

</details>

<details>
<summary>🔄 Live Configuration Changes</summary>

When you change settings, the server automatically restarts:

**Automation Mode Changes:**
```
1. Change debugssy.automationLevel in VS Code settings
2. Server detects change and restarts
3. New tool set becomes available
4. MCP clients reconnect automatically
```

**What happens:**
- Notifications appear confirming the restart
- Active MCP connections gracefully close and reconnect
- Active VS Code debug sessions are NOT affected
- New tool list immediately reflects your automation level

**Port Changes:**
Similarly, changing `debugssy.mcp.port` restarts the server on the new port.

**Step Operations Changes:**
```
1. Toggle debugssy.allowStepOperations in VS Code settings
2. Server notifies connected MCP clients that tools changed (no restart required)
3. Clients refresh their tool list automatically
```

</details>

---

## Performance & Context Usage

To minimize context usage when working with AI assistants:

- **`get_debug_state`** - Lightweight, always check this first
- **`get_call_stack`** - Defaults to 20 frames (configurable). Use `get_debug_state` if you only need current location
- **`get_console_output`** - Defaults to 50 most recent entries (configurable up to 1000). Use category filter to reduce output
- **`get_variables`** - Can be verbose. Specify scope prefix (e.g., "Local" to match "Local: functionName") to reduce output
- **`evaluate_expression`** - Keep expressions simple to avoid large object returns

Tools that return truncated data include `truncated: true` and `totalFrames`/`count` in their response.

## Known Limitations

- Watch expressions not directly accessible (use `evaluate_expression` instead)
- Assumes thread ID 1 for some operations (simplified for single-threaded debugging)
- In assisted mode, AI cannot detect when you manually click continue/step (use `get_debug_state` to check)
- `wait_for_breakpoint` requires debug session to be running (call after `continue` in full mode)
- Variable values are converted to strings by the debugger; complex nested objects may be abbreviated

---

## Development

### Building from Source

```bash
# Clone and install
git clone <repository>
cd debugssy
npm install

# Compile
npm run compile

# Run in development mode
# Press F5 in VS Code to open Extension Development Host
```

### Project Structure

```
debugssy/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── mcpServer.ts              # MCP server with HTTP transport
│   ├── config.ts                 # Configuration management
│   ├── dap/
│   │   └── client.ts             # Debug Adapter Protocol client
│   └── tools/
│       ├── debugControl.ts       # Debug control tools
│       ├── breakpoints.ts        # Breakpoint management
│       ├── inspection.ts         # Variable inspection
│       └── index.ts              # Tool registry
├── example/
│   └── test.js                   # Example for testing
└── README.md                     # This file
```

---

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

---

## Support This Project

If you find Debugssy helpful, consider supporting its development! Your contributions help maintain and improve the extension.

[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?hosted_button_id=FH3S38FT3NYGE)

**[💝 Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=FH3S38FT3NYGE)**

Every contribution, no matter how small, is greatly appreciated! 🙏

---

## License

Copyright © 2025 Guillermo Garcia Maynez

Licensed under the Apache License, Version 2.0. See the [LICENSE](./LICENSE) file for details.

---

## Additional Resources

- **📋 [ALLOWLIST_GUIDE.md](./ALLOWLIST_GUIDE.md)** - MCP client allowlist configuration examples
- **🔒 [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md)** - Security implementation and MCP spec compliance
- **🤖 [DEBUGSSY_PROMPT.md](./DEBUGSSY_PROMPT.md)** - Comprehensive guide for AI assistants
- **📝 [COMPACT_PROMPT.txt](./COMPACT_PROMPT.txt)** - Quick AI assistant reference

### External Links

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [VS Code Debug API](https://code.visualstudio.com/api/references/vscode-api#debug)
- [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

---


