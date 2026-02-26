# Debugssy

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/gamag.debugssy.svg)](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
[![Open VSX](https://img.shields.io/open-vsx/v/gamag/debugssy?label=Open%20VSX)](https://open-vsx.org/extension/gamag/debugssy)

**Let your AI assistant drive the debugger.**

Connect Cursor, GitHub Copilot, or Claude Desktop to VS Code's debugging engine
via [MCP](https://modelcontextprotocol.io). Describe what's broken, let the AI
poke around.

---

## Why This Exists

I got tired of the usual debugging loop: guess where the bug might be, set a
breakpoint, step through, inspect, repeat. Meanwhile I'm already explaining the
problem to an AI in chat. Why not let it do the clicking?

```
You: "The login function returns null for admin users"

AI: Sets a breakpoint → inspects the user object → notices the role check fails
    → traces back to the database query → spots the missing WHERE clause
```

The goal: get from "something is off" to "here's the exact line" without you
micromanaging every step.

---

## Setup (2 minutes)

### 1. Install

Search **Debugssy** in VS Code extensions (`Ctrl+Shift+X`) and install.

Or:
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
· [Open VSX](https://open-vsx.org/extension/gamag/debugssy)

### 2. Connect Your AI

All clients connect to the same URL: `http://localhost:3000/mcp`

**GitHub Copilot** —
[One-click install](https://gmaynez.github.io/debugssy/oneclick-vscode.html), or
add to `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "debugssy": { "url": "http://localhost:3000/mcp" }
  }
}
```

**Cursor** —
[One-click install](https://cursor.com/en-US/install-mcp?name=debugssy&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9tY3AifQ%3D%3D),
or add to `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "debugssy": { "url": "http://localhost:3000/mcp" } } }
```

**Claude Desktop** — Add to
`~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{ "mcpServers": { "debugssy": { "url": "http://localhost:3000/mcp" } } }
```

**Other MCP clients** — Point them at `http://localhost:3000/mcp`.

### 3. Debug

Start a debug session (`F5`), then ask your AI something like:

> "Debug why users get null when logging in" "Find where cartTotal becomes 0"
> "Trace why this loop runs 1000x instead of 10x"

Type `/` in chat for guided workflows (`/debug-crash`, `/trace-variable`, etc.)

---

## What the AI Gets

**Breakpoints:** Set, remove, toggle, list. Supports conditions
(`user.role === 'admin'`), hit counts (`> 10`), and logpoints.

**Inspection:** Read variables, evaluate expressions, walk the call stack, read
console output.

**Execution control:** Start/stop sessions, continue, step (if you enable it).
By default, you control execution via VS Code and the AI just inspects.

Two modes:

- **Assisted** (default): You press F5, step, continue. AI sets breakpoints and
  reads state.
- **Full automation**: AI controls everything. Set `debugssy.automationLevel` to
  `full`.

Copilot users: restart VS Code after switching modes.

---

## Examples

**Crash debugging:**

```
You: "Getting 'Cannot read property id of undefined' in UserService.ts"

AI: Sets breakpoint → finds `user` is null → walks call stack → spots
    database query missing a WHERE clause
```

**Wrong value:**

```
You: "cartTotal shows $0 but should be $150"

AI: Sets breakpoints on cartTotal assignments → continues → finds the
    discount calculation multiplying by 0 instead of subtracting
```

**Infinite loop:**

```
You: "Loop running 1000x instead of 10x"

AI: Sets conditional breakpoint `i > 10` → pauses at i=11 → finds
    `<=` instead of `<`
```

**Recommended models:** Claude 4.5 Haiku or Grok 4.1 Fast for speed.

---

## Settings

Search "debugssy" in VS Code settings. The important ones:

- `debugssy.automationLevel` — `assisted` (default) or `full`
- `debugssy.mcp.port` — Change if 3000 is taken
- `debugssy.expressionValidationLevel` — How paranoid to be about evaluated
  expressions (`strict`, `moderate`, `permissive`, `disabled`)

Commands via `Ctrl+Shift+P`: Start Server, Stop Server, Restart Server.

---

## Troubleshooting

**"No active debug session"** — Press F5 first. The debugger needs to be
running.

**Port in use** — Set `debugssy.mcp.port` to 3001 or whatever's free.

**AI can't connect** — Check `View → Output → Debugssy`. Make sure the URL is
`http://localhost:3000/mcp`.

**Variables empty** — Execution must be paused at a breakpoint.

**Copilot doesn't see tools** — Restart VS Code after changing settings.

Full docs: [github.com/gmaynez/debugssy](https://github.com/gmaynez/debugssy)

---

## Security

Runs on localhost only. Your code never leaves your machine. Expression
validation blocks obvious injection attempts. Origin validation prevents DNS
rebinding. Follows
[MCP security best practices](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices).

---

## Requirements

VS Code 1.101.0+ and an MCP-compatible AI (Cursor, Copilot, Claude Desktop,
etc.)

---

## More

[GitHub](https://github.com/gmaynez/debugssy) ·
[Security docs](https://github.com/gmaynez/debugssy/blob/main/SECURITY.md) ·
[MCP spec](https://modelcontextprotocol.io)

---

Apache 2.0 · © 2025-2026 Guillermo Garcia Maynez
