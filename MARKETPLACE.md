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

**GitHub Copilot and Cursor — nothing to configure.** Debugssy registers its MCP
server automatically. Install the extension and start chatting.

> Upgrading from an older version? Remove any manual `"debugssy"` entry from
> your `settings.json` or `mcp.json` to avoid duplicates.

**Claude Desktop, Claude Code, OpenCode, and other MCP clients** — add this to
your client's config:

```json
{ "mcpServers": { "debugssy": { "url": "http://localhost:3000/mcp" } } }
```

Config file locations vary by client. The URL is always
`http://localhost:3000/mcp` (or your custom port).

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

VS Code 1.105.0+ and an MCP-compatible AI (Copilot, Cursor, Claude Desktop,
etc.)

---

## More

[GitHub](https://github.com/gmaynez/debugssy) ·
[Security docs](https://github.com/gmaynez/debugssy/blob/main/SECURITY.md) ·
[MCP spec](https://modelcontextprotocol.io)

---

Apache 2.0 · © 2025-2026 Guillermo Garcia Maynez
