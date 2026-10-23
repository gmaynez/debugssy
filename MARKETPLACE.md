# Debugssy

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/gamag.debugssy.svg)](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
[![Open VSX](https://img.shields.io/open-vsx/v/gamag/debugssy?label=Open%20VSX)](https://open-vsx.org/extension/gamag/debugssy)

**Give your AI assistant access to the debugger.**

Debugssy connects an MCP client to VS Code's debugger. The assistant can set
breakpoints, inspect variables, read the call stack, and evaluate expressions.
You control execution by default.

## Before you start

You need:

- VS Code 1.128.0 or later, or a compatible editor that supports this
  extension's VS Code API requirement.
- A debug adapter for your language and a working debug configuration.
- An AI client that supports MCP tools and local Streamable HTTP connections.

Debugger features and expression syntax depend on the installed debug adapter.
Confirm that your project can start a debug session in the editor first.

## Install

1. Open the editor's Extensions view.
2. Search for **Debugssy**.
3. Install the extension published by **gamag**.

Available on the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
and [Open VSX](https://open-vsx.org/extension/gamag/debugssy).

## Connect your AI client

Keep the editor open. The MCP server starts automatically when the extension
activates with `debugssy.mcp.enabled` set to `true` (the default).

**GitHub Copilot in VS Code and Cursor:** Debugssy registers the server when the
host provides the required MCP registration API. Check your client's MCP server
list for **Debugssy AI Debugger** or **debugssy**. Review any trust prompt.
Enable the tools for your chat.

If automatic registration is unavailable, use the
[client-specific setup instructions](https://github.com/gmaynez/debugssy/blob/main/README.md#client-setup).
Remove an old manual entry only after the automatically registered server works.

**Claude Code:** With the CLI installed, run this command from your project
terminal:

```sh
claude mcp add --transport http --scope local debugssy http://localhost:3000/mcp
```

Start Claude Code with `claude`. Use `/mcp` to check the connection. See the
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

**Other clients:** Configuration formats differ. The client must support
Streamable HTTP and reach the environment where Debugssy runs. A cloud connector
cannot reach this server through `localhost`. See the
[README](https://github.com/gmaynez/debugssy/blob/main/README.md#client-setup)
for OpenCode setup and Claude Desktop limitations.

The default endpoint is `http://localhost:3000/mcp`. If you change
`debugssy.mcp.port`, update manual client entries with the new port.

## Try it

1. Open your project in the editor.
2. Select its debug configuration in **Run and Debug**.
3. Ask the assistant to set a breakpoint at a specific file and line.
4. Start debugging with `F5`.
5. Reproduce the behavior that reaches the breakpoint.
6. After execution pauses, ask: "Use Debugssy to show the current location and
   local variables."

Use the editor to continue or step. The assistant can read the updated state
with `get_debug_state`.

## Choose your level of control

- **Assisted** (default): You control execution. The assistant manages
  breakpoints and inspects debug data.
- **Full**: Set `debugssy.automationLevel` to `full` to add tools for starting,
  stopping, continuing, pausing, and restarting sessions. Step tools also
  require `debugssy.allowStepOperations` to be `true`.

If the client's tool list does not refresh after a setting change, reconnect the
MCP server. Reload the editor window if reconnecting does not resolve it.

## Security and privacy

Debugssy listens on localhost and checks Host and Origin headers. It returns
debug data to the AI client, which may send that data to a model provider.
Review your client's data policy before inspecting sensitive values.

Expression validation requests approval for flagged risks at these thresholds:
`strict` includes low risks and above; `moderate` (default) includes medium and
above; `permissive` includes high and critical risks, including mutations.
`disabled` skips expression risk checks. Validation is a risk filter, not a
sandbox.

Approvals use MCP elicitation. If required confirmation is unavailable, the
operation is blocked. Evaluation approvals apply once or to the same expression
for the current debug session. Session approvals end when that session
terminates. Breakpoint approvals permit repeated execution, including in future
sessions, until removal. Evaluation approvals do not approve persistent
breakpoints.

See the
[security reference](https://github.com/gmaynez/debugssy/blob/main/README.md#security-and-privacy)
for details.

## Need help?

- **No active debug session:** Start your debug configuration with `F5`.
- **Empty variables:** Pause execution before inspection.
- **Port in use:** Choose an unused port in `debugssy.mcp.port`. Update manual
  client entries afterward.
- **Connection failed:** Check **View → Output → Debugssy** for server errors.

The Command Palette includes **Debugssy: Start Server**, **Debugssy: Stop
Server**, and **Debugssy: Restart Server**.

[Full documentation](https://github.com/gmaynez/debugssy/blob/main/README.md) ·
[Report an issue](https://github.com/gmaynez/debugssy/issues) ·
[Security policy](https://github.com/gmaynez/debugssy/blob/main/SECURITY.md)

Apache 2.0 · © 2025-2026 Guillermo Garcia Maynez
