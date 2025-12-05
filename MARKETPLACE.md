# Debugssy - AI-Powered Debugging for VS Code

[![VS Code Marketplace Version](https://vsmarketplacebadges.dev/version-short/gamag.debugssy.svg)](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
[![Open VSX Version](https://img.shields.io/open-vsx/v/gamag/debugssy?label=Open%20VSX)](https://open-vsx.org/extension/gamag/debugssy)

> **Stop clicking through the debugger. Just tell your AI what's broken.**

Debug with natural language through any AI assistant (Cursor, GitHub Copilot,
Claude Desktop, etc.) using the Model Context Protocol.

---

## 💡 The Problem (Why This Exists)

Debugging itself is useful; the **way** we usually do it is not:

- **Manual breakpoint hunting** – guessing lines until something hits
- **Repetitive stepping** – step, inspect, step, inspect… for the tenth time
- **Context switching** – juggling code, debugger UI, logs, docs, and chat
- **Time sink** – 20–30 minutes to track down a trivial null reference

I built Debugssy after a few too many sessions of "click step until my wrist
hurts" while explaining bugs to an AI anyway.

## ✨ The Idea

Instead of fiddling with the debugger UI, you describe the bug and let your AI
drive VS Code's debugger through MCP.

Typical flow:

```
You: "The login function returns null for admin users"

AI: Sets a breakpoint → inspects the user object → notices the role check fails
    → traces back to the database query → spots the missing WHERE clause
```

The goal is to get from "something is off" to "I see the exact line and reason"
without you micromanaging every step.

---

## 🚀 What You Get

- **Smarter breakpoints** – AI sets breakpoints where the bug is likely to be,
  not just "somewhere in this file"
- **Variable inspection on demand** – ask about `user`, `cartTotal`, or any
  expression in plain language
- **Call stack analysis** – have the AI walk the stack and explain how you got
  here
- **Conditional breakpoints without the syntax tax** – describe the condition,
  let the tool set it up
- **Two modes** – assisted (you drive, AI inspects) or full (AI drives, you
  review)

In practice this looks like: instead of setting 10 breakpoints and poking
around, you say _"debug why users can't checkout"_ and let the AI do the
mechanical work while you make the decisions.

---

## 🏁 Quick Start (About 2 Minutes)

### Step 1: Install Extension

**In VS Code:** Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac) → search
`Debugssy` → install

**Or install from:**
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
· [Open VSX](https://open-vsx.org/extension/gamag/debugssy)

### Step 2: Connect Your AI

<details>
<summary><b>GitHub Copilot (VS Code)</b> - Click to expand</summary>

**One-click setup:**
[Install in VS Code](vscode:mcp/install?%7B%22name%22%3A%22debugssy%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22http%3A%2F%2Flocalhost%3A3000%2Fmcp%22%7D)
or [Open from browser](https://gmaynez.github.io/debugssy/oneclick-vscode.html)

<details>
<summary>Or add manually to settings.json</summary>

```json
{
  "github.copilot.chat.mcp.servers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

</details>

> ⚠️ **Note:** Restart VS Code after changing automation modes for Copilot to
> see updated tools.

</details>

<details>
<summary><b>Cursor</b> - Click to expand</summary>

**One-click setup:**
[Install in Cursor](https://cursor.com/en-US/install-mcp?name=debugssy&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9tY3AifQ%3D%3D)

<details>
<summary>Or add manually to ~/.cursor/mcp.json</summary>

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

</details>

<details>
<summary><b>Claude Desktop</b> - Click to expand</summary>

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

**Other MCP clients?** Connect to `http://localhost:3000/mcp`

### Step 3: Start Debugging

Start your usual debug session in VS Code, then talk to your AI:

> "Debug why users get null when logging in"  
> "Find where cartTotal becomes 0"  
> "Trace why this loop runs 1000x instead of 10x"

If your AI supports slash commands, type `/` in your AI chat to see guided
debugging workflows (`/debug-crash`, `/trace-variable`, etc.)

---

## ⚙️ How It Works

Debugssy connects your AI assistant to VS Code's debugging tools via the Model
Context Protocol (MCP). Your AI gets access to:

| Tool Category      | What It Does                                                           |
| ------------------ | ---------------------------------------------------------------------- |
| **🔴 Breakpoints** | Set, remove, list, toggle breakpoints (with conditions & hit counts)   |
| **🔍 Inspection**  | Read variables, evaluate expressions, check call stack, console output |
| **▶️ Control**     | Start, stop, continue, step (optional - you choose automation level)   |

**Two modes:**

- **Assisted** (default): You control execution via VS Code UI, AI inspects &
  sets breakpoints
- **Full automation**: AI controls everything (start debugging, continue, step
  through)

**Secure:** Localhost-only, origin validation, follows
[MCP security standards](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)

---

## 🎬 Real-World Examples

These are the kinds of things I actually use it for.

### Crash/Exception

```
You: "Getting 'Cannot read property id of undefined' in UserService.ts line 45"

AI: Sets a breakpoint → inspects the `user` object (null) → walks back through
    the call stack → finds the database query missing a WHERE clause
```

### Wrong Value

```
You: "cartTotal shows $0 but should be $150"

AI: Sets breakpoints on all `cartTotal` assignments → continues execution →
    finds the discount calculation multiplying by 0 instead of subtracting
```

### Infinite Loop

```
You: "Loop running 1000x instead of 10x"

AI: Sets a conditional breakpoint `i > 10` → pauses at `i = 11` → inspects the
    condition → finds `<=` instead of `<` (off-by-one error)
```

If you prefer more structure, type `/` in your AI chat:

- `/debug-crash` - Systematic crash debugging
- `/trace-variable` - Track variable changes
- `/inspect-function` - Function behavior analysis
- `/debug-loop` - Loop debugging
- `/auto-debug-session` - Full automation (full mode)

**Recommended models:** Claude 4.5 Haiku or Grok 4 Fast (fast, accurate,
cost-effective)

---

## ⚙️ Settings

**Key settings** (access via `File → Preferences → Settings`, search
`debugssy`):

| Setting                     | Default    | Description                                      |
| --------------------------- | ---------- | ------------------------------------------------ |
| `automationLevel`           | `assisted` | `assisted` (you control) or `full` (AI controls) |
| `mcp.port`                  | `3000`     | Server port (change if 3000 is in use)           |
| `expressionValidationLevel` | `moderate` | Security level for code execution                |

**All settings:**

<details>
<summary>Click to see all configuration options</summary>

```json
{
  "debugssy.mcp.enabled": true,
  "debugssy.mcp.port": 3000,
  "debugssy.automationLevel": "assisted", // or "full"
  "debugssy.waitForBreakpointTimeout": 5000, // ms
  "debugssy.allowStepOperations": false, // Enable step ops in full mode
  "debugssy.maxExpressionLength": 100, // Security: max expression chars
  "debugssy.expressionValidationLevel": "moderate" // Security level
}
```

</details>

**Commands** (via `Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Debugssy: Start Server`, `Stop Server`, `Restart Server`

---

## ❓ Troubleshooting (Short Version)

| Issue                          | Quick Fix                                                    |
| ------------------------------ | ------------------------------------------------------------ |
| **"No active debug session"**  | Press `F5` to start debugging before asking AI to inspect    |
| **Port already in use**        | Change port: `"debugssy.mcp.port": 3001`                     |
| **AI can't connect**           | Check `View → Output → Debugssy` for errors, restart VS Code |
| **Variables not available**    | Ensure execution is paused at a breakpoint                   |
| **Copilot not seeing changes** | Restart VS Code after changing `automationLevel`             |

If you're still stuck, check the full docs at
[github.com/gmaynez/debugssy](https://github.com/gmaynez/debugssy)

---

## 🔒 Security & Privacy

- ✅ **Localhost only** - No network access, binds to 127.0.0.1
- ✅ **Origin validation** - Prevents DNS rebinding attacks
- ✅ **Expression validation** - Optional safeguards against unsafe code
  execution
- ✅ **No telemetry** - Your code stays on your machine

Follows
[MCP Security Best Practices 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)

---

## 📋 Requirements

- VS Code 1.85.0+
- Any MCP-compatible AI assistant (Cursor, Copilot, Claude Desktop, etc.)

---

## 📚 Learn More

- **[GitHub Repository](https://github.com/gmaynez/debugssy)** - Full docs,
  source code, contribute
- **[Allowlist Guide](https://github.com/gmaynez/debugssy/blob/main/docs/ALLOWLIST_GUIDE.md)** -
  Security configuration examples
- **[MCP Compliance](https://github.com/gmaynez/debugssy/blob/main/docs/MCP_COMPLIANCE.md)** -
  Security implementation details
- **[Model Context Protocol](https://modelcontextprotocol.io)** - Learn about
  MCP

---

## 📄 License

Apache License 2.0 · Copyright © 2025 Guillermo Garcia Maynez

---

<div align="center">

**Stop debugging manually. Let AI find your bugs.**

Made with ❤️ for developers who want their time back

</div>
