<div align="center">

<img src="assets/debugssy_logo.png" alt="Debugssy Logo" width="150" />

# Debugssy

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/gamag.debugssy.svg)](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
[![Open VSX](https://img.shields.io/open-vsx/v/gamag/debugssy?label=Open%20VSX)](https://open-vsx.org/extension/gamag/debugssy)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

**Let your AI assistant drive the debugger.**

Debugssy connects AI assistants (Cursor, Copilot, Claude Desktop) to VS Code's
debugging engine via the
[Model Context Protocol](https://modelcontextprotocol.io). Instead of clicking
through the debugger UI, describe what you're hunting for.

[Install](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy) ·
[Issues](https://github.com/gmaynez/debugssy/issues) · [Security](./SECURITY.md)

</div>

---

## What It Does

```
You: "Figure out why users get null when logging in"

AI: Sets breakpoint in auth handler → waits for hit → inspects `user` object →
    traces call stack → spots missing WHERE clause in the query. Done.
```

The AI gets tools to set breakpoints (with conditions, hit counts, logpoints),
read variables, walk the call stack, and evaluate expressions—all through MCP.
You stay in control of _when_ debugging runs, or hand over the reins entirely.

Works with any language that VS Code can debug: JavaScript, TypeScript, Python,
Go, Java, C++, Rust, you name it.

**Recommended models:** Claude 4.5 Haiku or Grok 4.1 Fast (speed + cost).

---

## Quick Start

### 1. Install the Extension

Search **"Debugssy"** in VS Code's extension panel (`Ctrl+Shift+X`), or grab it
from:

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
- [Open VSX](https://open-vsx.org/extension/gamag/debugssy) (VSCodium, Gitpod,
  etc.)

### 2. Connect Your AI

**One-click links** (if your client supports them):

- **Copilot:**
  [Install MCP server](vscode:mcp/install?%7B%22name%22%3A%22debugssy%22%2C%22type%22%3A%22http%22%2C%22url%22%3A%22http%3A%2F%2Flocalhost%3A3000%2Fmcp%22%7D)
- **Cursor:**
  [Install MCP server](https://cursor.com/en-US/install-mcp?name=debugssy&config=eyJ0eXBlIjoiaHR0cCIsInVybCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9tY3AifQ%3D%3D)

**Manual config** (all clients use the same URL):

```json
{
  "mcpServers": {
    "debugssy": { "url": "http://localhost:3000/mcp" }
  }
}
```

Put this in:

- **Copilot:** VS Code `settings.json` under `"github.copilot.chat.mcp.servers"`
- **Cursor:** `~/.cursor/mcp.json`
- **Claude Desktop:**
  `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or
  `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

### 3. Debug Something

1. Start a debug session in VS Code (`F5`)
2. Ask your AI: _"Set a breakpoint where user authentication fails and show me
   what's in the request object"_
3. Watch it work

Type `/` in chat to see guided workflows like `/debug-crash` or
`/trace-variable`.

---

## Two Modes

**Assisted (default):** You control execution (F5, step, continue). The AI sets
breakpoints and inspects state. Good for learning and staying hands-on.

**Full automation:** The AI controls everything—starting sessions, continuing
past breakpoints, the works. Good for "just find the bug" scenarios.

```json
{ "debugssy.automationLevel": "full" }
```

Copilot users: restart VS Code after switching modes (it doesn't refresh tools
dynamically).

---

## Available Tools

Your AI sees these via MCP:

**Inspection** (always available): `get_debug_state`, `get_variables`,
`get_call_stack`, `evaluate_expression`, `get_console_output`, `get_threads`

**Breakpoints** (always available): `set_breakpoint`, `remove_breakpoint`,
`list_breakpoints`, `toggle_breakpoint`, `remove_all_breakpoints`

`set_breakpoint` supports conditions (`user.role === 'admin'`), hit counts
(`> 10`), and log messages (logpoints).

**Execution control** (full mode only): `start_debugging`, `stop_debugging`,
`continue`, `pause`, `restart`, `wait_for_breakpoint`

Step operations (`step_over`, `step_into`, `step_out`) are available in full
mode if you enable `debugssy.allowStepOperations`. Usually unnecessary—strategic
breakpoints + continue is faster for AI debugging.

---

## Settings

Open VS Code settings and search "debugssy":

| Setting                              | Default    | What it does                                                                                            |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------- |
| `debugssy.mcp.port`                  | `3000`     | Server port. Change if 3000 is taken.                                                                   |
| `debugssy.automationLevel`           | `assisted` | `assisted` or `full`                                                                                    |
| `debugssy.expressionValidationLevel` | `moderate` | How paranoid to be about `evaluate_expression`. Options: `strict`, `moderate`, `permissive`, `disabled` |
| `debugssy.maxExpressionLength`       | `100`      | Max chars for evaluated expressions                                                                     |
| `debugssy.waitForBreakpointTimeout`  | `5000`     | How long `wait_for_breakpoint` waits (ms)                                                               |
| `debugssy.allowStepOperations`       | `false`    | Enable step_over/into/out in full mode                                                                  |

For tighter security, configure an allowlist in your MCP client—see
[ALLOWLIST_GUIDE.md](./docs/ALLOWLIST_GUIDE.md).

---

## Security

Debugssy runs on localhost only. Your code never leaves your machine.

The expression validator blocks obvious injection attempts (`eval`,
`require('fs')`, `process.exit`, etc.) and asks for confirmation on anything
suspicious. Four levels of paranoia: `strict` (whitelist only), `moderate`
(default, blocks known dangerous patterns), `permissive` (blocks only the scary
stuff), `disabled` (you're on your own).

Best practices for AI-assisted debugging:

1. **Start fresh.** Use a new AI conversation for debug sessions to avoid prompt
   injection from earlier context.
2. **Skip web searches.** Don't search the web in the same conversation—external
   content is the main vector for prompt injection.
3. **Review elicitation prompts.** When the validator asks about an expression,
   actually read it before approving.

Full details: [SECURITY.md](./SECURITY.md),
[MCP_COMPLIANCE.md](./docs/MCP_COMPLIANCE.md)

---

## Troubleshooting

**"No active debug session"** — Start debugging (`F5`) before asking the AI to
inspect things. The debugger needs to be running.

**Port 3000 in use** — Change `debugssy.mcp.port` to something else (3001, 8080,
whatever). Or kill whatever's hogging 3000:

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <pid> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
```

**AI can't connect** — Check the VS Code Output panel
(`View → Output → Debugssy`). Verify the server's up with
`curl http://localhost:3000/health`. Make sure your AI config points to
`http://localhost:3000/mcp`.

**Variables empty** — Execution must be paused at a breakpoint. If it's running,
there's nothing to inspect. Also try `scope: "Local"` to filter out noise.

**Copilot doesn't see new tools** — Restart VS Code. Copilot caches the tool
list.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  VS Code Extension                              │
│                                                 │
│   MCP Server (localhost:3000)                   │
│        ↓                                        │
│   ToolRouter → Security Layer → Tool Registry   │
│        ↓                                        │
│   DAP Client ← → VS Code Debug API              │
└─────────────────────────────────────────────────┘
        ↑
        │ HTTP + MCP Protocol
        ↓
┌─────────────────────┐
│   AI Assistant      │
│ (Cursor/Copilot/    │
│  Claude Desktop)    │
└─────────────────────┘
```

The MCP server speaks Streamable HTTP (spec version 2025-06-18). Session IDs are
`crypto.randomUUID()`. All tool inputs go through Zod validation.

Key files if you're diving in:

- `src/MCPServer.ts` — Server setup and MCP protocol handling
- `src/routing/ToolRouter.ts` — Tool dispatch
- `src/security/ExpressionValidator.ts` — The paranoia engine
- `src/dap/Client.ts` — Debug Adapter Protocol integration

---

## Building from Source

```bash
git clone https://github.com/gmaynez/debugssy.git
cd debugssy
npm install
npm run compile    # Build
npm run package    # Creates .vsix
npm test           # Run tests
```

Press `F5` in VS Code to launch the Extension Development Host for live testing.

---

## Known Limitations

- **Copilot caches tools.** Restart VS Code after changing `automationLevel`.
- **No watch expressions.** Use `evaluate_expression` instead.
- **Single-threaded assumption.** Defaults to thread ID 1.
- **Assisted mode is blind to manual steps.** If you click Continue in the UI,
  the AI doesn't know.
- **Nested objects get truncated.** Blame the debugger, not us.

---

## Contributing

Found a bug? [Open an issue](https://github.com/gmaynez/debugssy/issues).

Want to contribute? Fork it, make a branch, open a PR. Follow the existing code
style (TypeScript, ESLint). Add tests for new features.

Check
[good first issues](https://github.com/gmaynez/debugssy/labels/good%20first%20issue)
for starter tasks.

---

## More Documentation

- [SECURITY.md](./SECURITY.md) — Threat model, security policy
- [ALLOWLIST_GUIDE.md](./docs/ALLOWLIST_GUIDE.md) — Lock down which tools your
  AI can use
- [DEBUGSSY_PROMPT.md](./DEBUGSSY_PROMPT.md) — Detailed guide for AI assistants
- [MCP Specification](https://modelcontextprotocol.io) — The protocol itself
- [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/)
  — What VS Code speaks under the hood

---

## License

Apache 2.0. See [LICENSE](./LICENSE).

Copyright © 2025 Guillermo Garcia Maynez
