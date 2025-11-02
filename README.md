<div align="center">

<img src="assets/debugssy_logo.png" alt="Debugssy Logo" width="150" />

# Debugssy

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/gamag.debugssy.svg)](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
[![Open VSX](https://img.shields.io/open-vsx/v/gamag/debugssy?label=Open%20VSX)](https://open-vsx.org/extension/gamag/debugssy)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/gmaynez/debugssy?style=social)](https://github.com/gmaynez/debugssy)

**AI-Powered Debugging for VS Code**

Control your debugger with natural language through any AI assistant using the Model Context Protocol (MCP).

[Install Now](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy) · [Documentation](#documentation) · [Report Bug](https://github.com/gmaynez/debugssy/issues) · [Request Feature](https://github.com/gmaynez/debugssy/issues)

</div>

---

## 🎯 Overview

**Stop clicking through the debugger.** Debugssy lets you debug with natural language by connecting your AI assistant (Cursor, GitHub Copilot, Claude Desktop) to VS Code's debugging engine via the Model Context Protocol.

```
💬 You: "Debug why users get null when logging in"

🤖 AI: Sets breakpoint → Inspects variables → Traces execution → 
      Finds missing WHERE clause in database query → Fixed! ⚡
```

**Key Features:**
- 🔴 **Smart breakpoints** with conditions, hit counts, and log messages
- 🔍 **Variable inspection** at any point in execution  
- 📊 **Call stack analysis** to trace execution flow
- ⚡ **Two automation modes** - You control, or AI controls
- 🔒 **Secure by design** - Localhost-only, follows MCP security standards

**Recommended AI models:** Claude 4.5 Haiku or Grok 4 Fast (fast, smart, cost-effective)

---

## 📑 Table of Contents

<details open>
<summary><b>Getting Started</b></summary>

- [Quick Start](#-quick-start)
- [Installation](#installation)
- [Configuration](#-configuration)
- [Your First Debug Session](#your-first-debug-session)

</details>

<details>
<summary><b>Features & Tools</b></summary>

- [Automation Modes](#-automation-modes)
- [Available Tools](#-tools)
- [MCP Prompts](#-mcp-prompts)
- [MCP Resources](#-mcp-resources)

</details>

<details>
<summary><b>Technical Documentation</b></summary>

- [Architecture](#-architecture)
- [MCP Server Implementation](#mcp-server-implementation)
- [Security Model](#-security)
- [API Reference](#-api-reference)
- [Performance & Optimization](#-performance--context-usage)

</details>

<details>
<summary><b>Development & Contributing</b></summary>

- [Building from Source](#-building-from-source)
- [Project Structure](#project-structure)
- [Contributing](#-contributing)
- [Known Limitations](#-known-limitations)

</details>

<details>
<summary><b>Support & Resources</b></summary>

- [Troubleshooting](#-troubleshooting)
- [FAQ](#faq)
- [Additional Documentation](#-additional-resources)
- [Support This Project](#-support-this-project)

</details>

---

## 🚀 Quick Start

### Installation

**Option 1: VS Code Marketplace (Recommended)**

```bash
# In VS Code: Press Ctrl+Shift+X, search "Debugssy", click Install
```

Or install from:
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
- [Open VSX Registry](https://open-vsx.org/extension/gamag/debugssy) (for VSCodium, Gitpod, etc.)

**Option 2: Manual Installation (VSIX)**

```bash
# Download from GitHub Releases
wget https://github.com/gmaynez/debugssy/releases/latest/download/debugssy-<version>.vsix

# Install
code --install-extension debugssy-<version>.vsix
```

**Option 3: Development Mode**

```bash
git clone https://github.com/gmaynez/debugssy.git
cd debugssy
npm install
# Press F5 in VS Code to launch Extension Development Host
```

### Connect Your AI Assistant

**One-Click Setup Links:**

| AI Assistant | Setup Link | Manual Config |
|--------------|------------|---------------|
| **GitHub Copilot** | [Install in VS Code](vscode:mcp/install?%7B%22name%22%3A%22debugssy%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22http%3A%2F%2Flocalhost%3A3000%2Fmcp%22%7D) | [See below](#github-copilot-configuration) |
| **Cursor** | [Install in Cursor](https://cursor.com/en-US/install-mcp?name=debugssy&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9tY3AifQ%3D%3D) | [See below](#cursor-configuration) |
| **Claude Desktop** | Manual only | [See below](#claude-desktop-configuration) |

<details id="github-copilot-configuration">
<summary><b>GitHub Copilot Configuration</b></summary>

Add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

> ⚠️ **Note:** Restart VS Code after changing `debugssy.automationLevel` for Copilot to see updated tools.

</details>

<details id="cursor-configuration">
<summary><b>Cursor Configuration</b></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

</details>

<details id="claude-desktop-configuration">
<summary><b>Claude Desktop Configuration</b></summary>

Add to config file:
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

</details>

### Your First Debug Session

1. **Start debugging** your application in VS Code (`F5`)
2. **Tell your AI** about the bug:
   ```
   "Debug why users get null when logging in"
   ```
3. **Watch AI work:**
   - Sets breakpoints automatically
   - Inspects variables
   - Traces execution
   - Identifies root cause

**Pro tip:** Type `/` in your AI chat to see guided debugging workflows (`/debug-crash`, `/trace-variable`, etc.)

---

## ⚙️ Configuration

### VS Code Settings

Access via `File → Preferences → Settings` (search "debugssy"):

| Setting | Default | Description |
|---------|---------|-------------|
| `debugssy.mcp.enabled` | `true` | Enable the MCP server |
| `debugssy.mcp.port` | `3000` | Server port (change if in use) |
| `debugssy.automationLevel` | `assisted` | `assisted` or `full` |
| `debugssy.waitForBreakpointTimeout` | `5000` | Timeout in ms (1s-5min) |
| `debugssy.allowStepOperations` | `false` | Enable step operations in full mode |
| `debugssy.maxExpressionLength` | `100` | Max expression length (security) |
| `debugssy.expressionValidationLevel` | `moderate` | Expression validation strictness |

<details>
<summary><b>Example configuration</b></summary>

```json
{
  "debugssy.mcp.enabled": true,
  "debugssy.mcp.port": 3000,
  "debugssy.automationLevel": "assisted",
  "debugssy.waitForBreakpointTimeout": 5000,
  "debugssy.allowStepOperations": false,
  "debugssy.maxExpressionLength": 100,
  "debugssy.expressionValidationLevel": "moderate"
}
```

</details>

### MCP Client Configuration

**Recommended: Configure allowlist for enhanced security**

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

> **📋 Complete allowlist examples:** See [ALLOWLIST_GUIDE.md](./ALLOWLIST_GUIDE.md)

---

## 🎮 Automation Modes

Debugssy offers two automation levels to match your workflow:

### Assisted Mode (Default - Recommended)

**You control execution, AI assists with inspection**

- ✅ **You:** Start/stop debugging, step through code via VS Code UI
- ✅ **AI:** Set breakpoints, inspect variables, analyze state, suggest fixes
- ✅ **Best for:** Learning, maintaining control, interactive exploration

```json
{ "debugssy.automationLevel": "assisted" }
```

### Full Automation Mode

**AI controls everything**

- ✅ **AI:** Start debugging, set breakpoints, continue execution, step through code
- ✅ **You:** Watch the AI debug or review results afterward
- ✅ **Best for:** Batch debugging, known issues, automated testing

```json
{ "debugssy.automationLevel": "full" }
```

> ⚠️ **GitHub Copilot users:** Restart VS Code after changing modes to refresh the tool list.

---

## 🛠️ Tools

Your AI assistant gets access to these debugging tools via MCP:

### 🔍 Inspection Tools (Always Available)

| Tool | Description | Example |
|------|-------------|---------|
| `get_debug_state` | Check if debugger is running/paused | Check execution state |
| `get_variables` | Read variable values at current point | Inspect `user` object |
| `get_call_stack` | View execution call stack | Trace how we got here |
| `evaluate_expression` | Evaluate expressions in context | Calculate `price * quantity` |
| `get_console_output` | Read debug console output | View `console.log` statements |
| `get_threads` | List all threads | Multi-threaded debugging |

### 🔴 Breakpoint Tools (Always Available)

| Tool | Description | Example |
|------|-------------|---------|
| `set_breakpoint` | Set breakpoints (with conditions, hit counts, log messages) | Break when `user.role === 'admin'` |
| `remove_breakpoint` | Remove specific breakpoint | Clean up temporary breakpoint |
| `list_breakpoints` | Show all active breakpoints | Review current breakpoints |
| `toggle_breakpoint` | Enable/disable breakpoint | Temporarily disable without removing |
| `remove_all_breakpoints` | Clear all breakpoints | Start fresh |

### ▶️ Execution Control (Mode-Dependent)

**Assisted Mode:** Not exposed (you use VS Code UI)  
**Full Automation Mode:**

| Tool | Description |
|------|-------------|
| `start_debugging` | Start debug session programmatically |
| `stop_debugging` | Stop current session |
| `continue` | Continue execution to next breakpoint |
| `pause` | Pause execution |
| `restart` | Restart debug session |
| `wait_for_breakpoint` | Wait for execution to pause |

**Optional (Full Mode + Enabled):**
- `step_over`, `step_into`, `step_out` (enable via `debugssy.allowStepOperations`)

> **📝 Note:** For AI debugging, setting strategic breakpoints + `continue` is more efficient than stepping.

---

## 📚 MCP Prompts

Debugssy provides structured debugging workflows accessible via `/` in your AI chat:

| Prompt | When to Use | What It Does |
|--------|-------------|--------------|
| `/debug-crash` | Crashes, exceptions | Systematic crash debugging with breakpoints & stack traces |
| `/trace-variable` | Wrong values | Track where a variable becomes incorrect |
| `/inspect-function` | Function behavior | Step through function to understand logic |
| `/debug-loop` | Infinite loops | Use conditional breakpoints to catch loop issues |
| `/auto-debug-session` | Full automation | Complete automated debugging session (full mode only) |

**Example usage:**

```
/debug-crash errorMessage:"Cannot read property 'id' of undefined" filePath:"UserService.ts"
```

> **💡 AI models:** Claude 4.5 Haiku or Grok 4 Fast recommended for interactive debugging

---

## 🗂️ MCP Resources

Debugssy exposes workspace configuration as MCP resources for context:

### Available Resources

| Resource URI | Description | Use Case |
|--------------|-------------|----------|
| `debugssy:///{workspaceName}/launch.json` | Debug configurations from `.vscode/launch.json` | Find available debug configuration names before starting |

**Example:**

```typescript
// AI reads resource to find configuration names
const resource = await client.readResource('debugssy:///myproject/launch.json');
// Then starts debugging with correct configuration
await client.callTool('start_debugging', { name: 'Launch Program' });
```

### Using Resources API

**List available resources:**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'
```

**Read a resource:**

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"debugssy:///myproject/launch.json"}}'
```

---

## 🏗️ Architecture

<details>
<summary><b>System Architecture Diagram</b></summary>

```
┌─────────────────────────────────────────┐
│     VS Code Extension (Debugssy)         │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │      MCP Server                    │ │
│  │  (Streamable HTTP Transport)       │ │
│  │  Port: 3000 (localhost only)       │ │
│  └──────────────┬─────────────────────┘ │
│                 │                         │
│  ┌──────────────┴─────────────────────┐ │
│  │     Routing Layer                   │ │
│  │  ┌────────────┬──────────────────┐ │ │
│  │  │ToolRouter  │ PromptHandler    │ │ │
│  │  │Completion  │ ResourceProvider │ │ │
│  │  └────────────┴──────────────────┘ │ │
│  └──────────────┬─────────────────────┘ │
│                 │                         │
│  ┌──────────────┴─────────────────────┐ │
│  │     Security Layer                  │ │
│  │  ┌──────────────────────────────┐  │ │
│  │  │ McpRequestValidator          │  │ │
│  │  │ ExpressionValidator          │  │ │
│  │  └──────────────────────────────┘  │ │
│  └──────────────┬─────────────────────┘ │
│                 │                         │
│  ┌──────────────┴─────────────────────┐ │
│  │     Tool Registry                   │ │
│  │  ┌───────────────────────────────┐ │ │
│  │  │ BreakpointTools               │ │ │
│  │  │ DebugControlTools             │ │ │
│  │  │ InspectionTools               │ │ │
│  │  └───────────────────────────────┘ │ │
│  └──────────────┬─────────────────────┘ │
│                 │                         │
│  ┌──────────────┴─────────────────────┐ │
│  │     VS Code Debug API               │ │
│  │  + DAP Client (Debug Adapter)       │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                 │
                 │ HTTP/MCP Protocol
                 │
        ┌────────▼────────┐
        │   MCP Client    │
        │ (AI Assistant)  │
        └─────────────────┘
```

</details>

### MCP Server Implementation

**Transport:** Streamable HTTP (MCP 2025-06-18)
- **Endpoint:** `http://localhost:3000/mcp`
- **Health Check:** `http://localhost:3000/health`
- **Session Management:** Cryptographically secure UUIDs
- **Protocol Versions:** `2025-03-26`, `2025-06-18`

**Key Components:**

| Component | Responsibility | Location |
|-----------|----------------|----------|
| `MCPServer` | MCP protocol orchestration | `src/MCPServer.ts` |
| `ToolRouter` | Tool schema management & routing | `src/routing/ToolRouter.ts` |
| `McpRequestValidator` | Origin & protocol validation | `src/security/McpRequestValidator.ts` |
| `ExpressionValidator` | Expression safety checks | `src/security/ExpressionValidator.ts` |
| `DAPClient` | Debug Adapter Protocol interaction | `src/dap/Client.ts` |

---

## 🔒 Security

Debugssy follows [MCP Security Best Practices 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices):

### Security Features

| Layer | Implementation | Protection |
|-------|----------------|------------|
| **Network** | Localhost-only binding | Prevents remote access |
| **Origin** | Origin header validation | Prevents DNS rebinding attacks |
| **Protocol** | MCP version validation | Ensures compatibility |
| **Sessions** | Cryptographic UUIDs | Secure session management |
| **Expressions** | Multi-level validation | Prevents code injection |
| **Input** | Zod schema validation | Type-safe parameter handling |

### Expression Validation

Four validation levels:

| Level | Behavior | Use Case |
|-------|----------|----------|
| `strict` | Only whitelisted functions allowed | Maximum security |
| `moderate` | Common patterns + whitelist (default) | Balanced security/usability |
| `permissive` | Only dangerous operations blocked | Minimal interruptions |
| `disabled` | No validation | Fully trusted environments only |

**Validation uses elicitation** for user approval of potentially unsafe operations.

> **📋 Complete security details:** See [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md)

---

## 📖 API Reference

### Tool Parameters

<details>
<summary><b>set_breakpoint</b></summary>

```typescript
{
  filePath: string;              // Absolute path to file
  line: number;                  // Line number (1-based)
  condition?: string;            // Break only when condition is true
  hitCondition?: string;         // Break after N hits (e.g., "> 5")
  logMessage?: string;           // Log message instead of breaking
}
```

**Example:**
```json
{
  "filePath": "/path/to/UserService.ts",
  "line": 45,
  "condition": "user.role === 'admin'",
  "hitCondition": "> 10"
}
```

</details>

<details>
<summary><b>get_variables</b></summary>

```typescript
{
  scope?: string;                // Scope prefix filter (e.g., "Local")
  frameId?: number;              // Stack frame ID (defaults to current)
}
```

**Example:**
```json
{
  "scope": "Local",
  "frameId": 0
}
```

**Note:** Scope filtering uses prefix matching. "Local" matches "Local: functionName".

</details>

<details>
<summary><b>evaluate_expression</b></summary>

```typescript
{
  expression: string;            // Expression to evaluate
  frameId?: number;              // Stack frame ID (defaults to current)
}
```

**Example:**
```json
{
  "expression": "user.firstName + ' ' + user.lastName",
  "frameId": 0
}
```

</details>

<details>
<summary><b>get_call_stack</b></summary>

```typescript
{
  maxDepth?: number;             // Max stack frames (default: 20)
}
```

**Returns:** `truncated: true` if call stack was limited.

</details>

<details>
<summary><b>get_console_output</b></summary>

```typescript
{
  category?: string;             // "console", "stdout", "stderr", "telemetry"
  limit?: number;                // Max entries (default: 50, max: 1000)
  since?: number;                // Unix timestamp (ms) for filtering
  clear?: boolean;               // Clear buffer after reading
}
```

**Returns:** `truncated: true` if more entries available.

</details>

<details>
<summary><b>start_debugging (Full mode only)</b></summary>

```typescript
{
  name?: string;                 // Configuration name from launch.json
  workspaceFolder?: string;      // Workspace folder name
  configuration?: object;        // Full debug configuration object
}
```

**Tip:** Use MCP resources to read launch.json first to find configuration names.

</details>

<details>
<summary><b>wait_for_breakpoint (Full mode only)</b></summary>

```typescript
{
  timeout?: number;              // Timeout in ms (default from settings)
}
```

</details>

### Health Check Endpoint

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "server": "debugssy-mcp",
  "version": "1.2.0",
  "transportInitialized": true,
  "transport": "streamable-http",
  "protocolVersion": "2025-06-18",
  "supportedProtocolVersions": ["2025-03-26", "2025-06-18"]
}
```

---

## ⚡ Performance & Context Usage

**Optimize AI context usage** with these tips:

| Tool | Context Impact | Optimization |
|------|----------------|--------------|
| `get_debug_state` | ✅ Minimal | Check this first, always lightweight |
| `get_call_stack` | ⚠️ Medium | Use `maxDepth` parameter (default: 20) |
| `get_console_output` | ⚠️ Medium | Use `limit` & `category` filters |
| `get_variables` | ⚠️ High | Specify `scope` prefix (e.g., "Local") |
| `evaluate_expression` | ⚠️ Varies | Keep expressions simple |

**Tools return truncation indicators:**
- `truncated: true`
- `totalFrames` / `count` in response

---

## 🏭 Building from Source

### Prerequisites

- Node.js 18+ (for development)
- VS Code 1.85.0+
- Git

### Build Steps

```bash
# Clone repository
git clone https://github.com/gmaynez/debugssy.git
cd debugssy

# Install dependencies
npm install

# Type check
npm run check-types

# Compile (TypeScript → JavaScript via esbuild)
npm run compile

# Package extension (creates .vsix)
npm run package

# Run in development mode
# Press F5 in VS Code to launch Extension Development Host
```

### Project Structure

```
debugssy/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── MCPServer.ts              # MCP server orchestration
│   ├── Config.ts                 # Configuration management
│   ├── constants.ts              # App-wide constants
│   │
│   ├── dap/
│   │   └── Client.ts             # Debug Adapter Protocol client
│   │
│   ├── tools/
│   │   ├── Breakpoints.ts        # Breakpoint operations
│   │   ├── DebugControl.ts       # Debug flow control
│   │   ├── Inspection.ts         # Variable inspection
│   │   └── index.ts              # Tool registry factory
│   │
│   ├── routing/
│   │   ├── ToolRouter.ts         # Tool call routing
│   │   ├── PromptHandler.ts      # Prompt generation
│   │   ├── CompletionProvider.ts # Autocomplete support
│   │   ├── ResourceProvider.ts   # Resource exposure
│   │   ├── schemas/              # Zod validation schemas
│   │   └── types/                # TypeScript types
│   │
│   └── security/
│       ├── McpRequestValidator.ts  # Origin/protocol validation
│       └── ExpressionValidator.ts  # Expression safety checks
│
├── assets/
│   └── debugssy_logo.png         # Extension icon
│
├── docs/
│   └── oneclick-vscode.html      # One-click install page
│
├── .github/workflows/
│   └── publish.yml               # Automated publishing
│
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
├── esbuild.js                    # Build script
└── README.md                     # This file
```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile TypeScript + bundle with esbuild |
| `npm run check-types` | Type check without building |
| `npm run watch` | Watch mode (esbuild + tsc) |
| `npm run lint` | Lint source code |
| `npm run package` | Create .vsix package |
| `npm test` | Run tests |

---

## 🐛 Troubleshooting

<details>
<summary><b>"No active debug session" error</b></summary>

**Cause:** AI trying to inspect variables when debugger isn't running  
**Solution:** Start debugging (`F5`) before asking AI to inspect

</details>

<details>
<summary><b>Server won't start / port in use</b></summary>

**Cause:** Port 3000 already in use  
**Solution:** Change port in settings:

```json
{ "debugssy.mcp.port": 3001 }
```

Or find and kill process using port 3000:

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

</details>

<details>
<summary><b>AI can't connect to server</b></summary>

**Diagnosis steps:**

1. Check VS Code Output panel: `View → Output → Debugssy`
2. Verify server is running:
   ```bash
   curl http://localhost:3000/health
   ```
3. Check AI configuration has correct URL: `http://localhost:3000/mcp`
4. Restart VS Code
5. Restart AI assistant

</details>

<details>
<summary><b>Variables not available</b></summary>

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Execution not paused | Ensure breakpoint is hit |
| Wrong stack frame | Check `get_debug_state` first |
| Scope issue | Use `scope: "Local"` parameter |

</details>

<details>
<summary><b>GitHub Copilot doesn't see tool changes</b></summary>

**Cause:** Copilot doesn't refresh tools dynamically  
**Solution:** Restart VS Code after changing `debugssy.automationLevel`

</details>

<details>
<summary><b>Expression validation blocking safe code</b></summary>

**Options:**

1. Change validation level to `permissive`:
   ```json
   { "debugssy.expressionValidationLevel": "permissive" }
   ```

2. Increase expression length limit:
   ```json
   { "debugssy.maxExpressionLength": 200 }
   ```

3. Disable validation (not recommended):
   ```json
   { "debugssy.expressionValidationLevel": "disabled" }
   ```

</details>

### FAQ

<details>
<summary><b>Q: Can I debug remote applications?</b></summary>

A: No, Debugssy binds to localhost for security. It debugs applications running in your local VS Code.

</details>

<details>
<summary><b>Q: Does this work with all programming languages?</b></summary>

A: Debugssy works with any language that has VS Code debug adapter support (JavaScript, TypeScript, Python, Go, Java, C++, C#, PHP, Ruby, Rust, etc.).

</details>

<details>
<summary><b>Q: Can I use this without an AI assistant?</b></summary>

A: No, Debugssy requires an MCP-compatible AI assistant to send debugging commands.

</details>

<details>
<summary><b>Q: Is my code sent to any external servers?</b></summary>

A: No. Debugssy runs entirely on localhost. Your code never leaves your machine. The AI assistant connects to your local MCP server.

</details>

<details>
<summary><b>Q: Why use MCP instead of a VS Code extension API?</b></summary>

A: MCP allows any AI assistant (Cursor, Copilot, Claude, custom clients) to use Debugssy, not just VS Code's built-in features. It's more flexible and follows an open standard.

</details>

---

## 🚧 Known Limitations

- **Copilot dynamic refresh:** Requires VS Code restart when changing automation modes
- **Watch expressions:** Not directly accessible (use `evaluate_expression` instead)
- **Thread assumption:** Assumes thread ID 1 for single-threaded debugging
- **Manual flow detection:** In assisted mode, AI can't detect when you manually click continue/step
- **`wait_for_breakpoint`:** Requires debug session to be running
- **Variable formatting:** Complex nested objects may be abbreviated by debugger

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Ways to Contribute

- 🐛 **Report bugs** - [Open an issue](https://github.com/gmaynez/debugssy/issues)
- 💡 **Suggest features** - [Request a feature](https://github.com/gmaynez/debugssy/issues)
- 📖 **Improve docs** - Submit PRs for documentation
- 🔧 **Fix issues** - Check [good first issues](https://github.com/gmaynez/debugssy/labels/good%20first%20issue)
- 🌍 **Add language support** - Help with internationalization

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit with clear messages: `git commit -m 'Add amazing feature'`
5. Push to your fork: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Code Style

- Follow existing TypeScript/ESLint conventions
- Add JSDoc comments for public APIs
- Include unit tests for new features
- Update documentation as needed

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community guidelines.

---

## 💝 Support This Project

If Debugssy saves you time, consider supporting its development!

[![Donate with PayPal](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://www.paypal.com/donate/?hosted_button_id=FH3S38FT3NYGE)

**[→ Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=FH3S38FT3NYGE)**

Every contribution helps maintain and improve Debugssy. Thank you! 🙏

---

## 📚 Additional Resources

### Documentation

- **[ALLOWLIST_GUIDE.md](./ALLOWLIST_GUIDE.md)** - MCP client allowlist configuration
- **[MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md)** - Security implementation details
- **[DEBUGSSY_PROMPT.md](./DEBUGSSY_PROMPT.md)** - Comprehensive guide for AI assistants
- **[COMPACT_PROMPT.txt](./COMPACT_PROMPT.txt)** - Quick AI assistant reference

### External Links

- **[Model Context Protocol Specification](https://modelcontextprotocol.io)** - MCP standard
- **[VS Code Debug API](https://code.visualstudio.com/api/references/vscode-api#debug)** - VS Code debugging
- **[Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)** - DAP specification
- **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** - SDK documentation

---

## 📄 License

**Apache License 2.0**

Copyright © 2025 Guillermo Garcia Maynez

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See the [LICENSE](./LICENSE) file for details.

---

<div align="center">

**Made with ❤️ for developers who want smarter debugging workflows**

[⬆ Back to Top](#debugssy)

</div>

