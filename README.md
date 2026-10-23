<div align="center">

<img src="assets/debugssy_logo.png" alt="Debugssy Logo" width="150" />

# Debugssy

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/gamag.debugssy.svg)](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
[![Open VSX](https://img.shields.io/open-vsx/v/gamag/debugssy?label=Open%20VSX)](https://open-vsx.org/extension/gamag/debugssy)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

**Give your AI assistant access to the debugger.**

Debugssy connects an MCP client to VS Code's debugger through the
[Model Context Protocol](https://modelcontextprotocol.io). The assistant can set
breakpoints, inspect variables, and evaluate expressions. You control execution
by default. Full mode also provides execution tools.

[Install](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy) ·
[Issues](https://github.com/gmaynez/debugssy/issues) · [Security](./SECURITY.md)

</div>

## Prerequisites

- VS Code 1.128.0 or later, or a compatible editor that supports this
  extension's VS Code API requirement.
- An installed debug adapter for your language.
- A working debug configuration, such as `.vscode/launch.json`.
- An AI client with MCP tool support and access to local Streamable HTTP
  servers.

Debugssy uses the installed debug adapter. Language support, expression syntax,
conditional breakpoints, hit conditions, and logpoints depend on that adapter.
Confirm that your project can start a debug session in the editor before using
Debugssy.

The server listens on localhost. It returns debug data to the AI client, which
may send that data to a model provider. See
[Security and privacy](#security-and-privacy).

## Quick start

### 1. Install Debugssy

1. Open the editor's Extensions view.
2. Search for **Debugssy**.
3. Install the extension published by **gamag**.

You can also find it on the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gamag.debugssy)
or [Open VSX](https://open-vsx.org/extension/gamag/debugssy).

The MCP server starts when the extension activates if `debugssy.mcp.enabled` is
`true`, which is the default. Keep the editor open while the AI client uses it.

### 2. Connect your AI client

Use the instructions for your client under [Client setup](#client-setup). The
default endpoint is `http://localhost:3000/mcp`.

### 3. Inspect a paused program

1. Open your project in the editor.
2. Select its debug configuration in **Run and Debug**.
3. Ask the assistant to set a breakpoint at a specific file and line.
4. Start debugging with `F5`.
5. Reproduce the behavior that reaches the breakpoint.
6. After execution pauses, ask: "Use Debugssy to show the current location and
   local variables."

In assisted mode, use the editor to continue or step. Ask the assistant to check
`get_debug_state` after an execution change. Debugssy tracks manual execution
changes through debug adapter messages in both modes.

## Client setup

These examples use the default port. If you change `debugssy.mcp.port`, update
manual client entries to use the same port. Merge each example into the relevant
file without replacing other entries.

The client must reach the loopback interface of the environment where the
extension runs. A cloud service cannot reach your machine through its own
`localhost`. Containers, WSL, and remote workspaces can also have separate
loopback interfaces. Keep this server local; do not expose it through a public
tunnel.

Debugssy provides a **Streamable HTTP** endpoint. It does not provide a stdio
launcher. A client that supports only stdio needs a separate local bridge that
supports Streamable HTTP. Configuration formats are client-specific.

### VS Code with GitHub Copilot

Debugssy registers a server definition when the host exposes
`vscode.lm.registerMcpServerDefinitionProvider`. The running server must be
enabled. Registration does not remove the client's trust or tool approval steps.

1. Open the client's MCP server list.
2. Select **Debugssy AI Debugger**, if it is present.
3. Review any server trust prompt.
4. Enable the Debugssy tools for the chat.

If no definition appears, add this entry to `.vscode/mcp.json` in your
workspace:

```json
{
  "servers": {
    "debugssy": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

This is the VS Code `mcp.json` format. Other configuration destinations can use
different keys. See the official
[VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

### Cursor

Debugssy registers the server when the host exposes
`vscode.cursor.mcp.registerServer`. Check Cursor's MCP settings for
**debugssy**.

If automatic registration is unavailable, add this entry to `.cursor/mcp.json`
in your project, or `~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

Enable the server in Cursor's MCP settings. See the official
[Cursor MCP guide](https://cursor.com/docs/mcp).

For either editor, remove an old manual entry only after you confirm that the
automatically registered server works. Use one entry for each Debugssy instance.

### Claude Code

Prerequisites: the Claude Code CLI is installed, and Debugssy is running in the
editor on the same local environment.

1. Open a terminal in your project directory.
2. Register the HTTP server for this project and user:

   ```sh
   claude mcp add --transport http --scope local debugssy http://localhost:3000/mcp
   ```

3. Start Claude Code with `claude`.
4. Use `/mcp` to check the server connection.

The `local` scope keeps this registration private to you for the current
project. Use `--scope user` instead if you need it across projects. A JSON
configuration for Claude Code needs `"type": "http"`; a URL alone is not enough.
See the official [Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

### OpenCode

Add this entry to `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "debugssy": {
      "type": "remote",
      "url": "http://localhost:3000/mcp",
      "enabled": true
    }
  }
}
```

OpenCode uses `remote` for a URL-based connection, even when the URL points to
localhost. Check the connection with `opencode mcp list`. See the official
[OpenCode MCP guide](https://opencode.ai/docs/mcp-servers/) and
[configuration guide](https://opencode.ai/docs/config/).

### Claude Desktop and other clients

Do not copy the Cursor URL-only configuration into Claude Desktop and assume it
will work. Claude Desktop's local server setup is a separate mechanism from
Claude's remote connectors. A stdio-based setup needs a local Streamable HTTP
bridge; Debugssy does not bundle one. See Claude's
[local MCP setup guide](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

Claude's remote connectors connect from Anthropic's cloud, including when used
in Claude Desktop. They cannot connect directly to this localhost endpoint. See
the
[remote connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
For a direct local HTTP connection, use one of the client setups above.

For other clients, check their documentation for local Streamable HTTP support.
MCP elicitation support is also needed to approve expressions that exceed the
configured validation threshold.

## Automation modes

| Mode                 | Execution control                                  | Assistant tools                               |
| -------------------- | -------------------------------------------------- | --------------------------------------------- |
| `assisted` (default) | You start, stop, continue, and step in the editor. | Breakpoints and inspection.                   |
| `full`               | The assistant can also control execution.          | Breakpoints, inspection, and execution tools. |

To enable full mode, set this editor setting:

```json
{ "debugssy.automationLevel": "full" }
```

Step tools also require `debugssy.allowStepOperations` to be `true`. Debugssy
notifies the client when the tool list changes. If the list does not refresh,
reconnect the MCP server in the client. Reload the editor window if reconnecting
does not resolve it.

Assisted mode limits execution tools. It does not guarantee that evaluated
expressions or breakpoint expressions are free of side effects.

## Available tools

Tool availability does not guarantee that a tool can run in every debug state.
Variables and call stacks normally require a paused program. Adapter support
also determines which operations succeed.

### Breakpoints: both modes

| Tool                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `set_breakpoint`         | Set a source breakpoint with an optional condition, hit condition, or log message. |
| `remove_breakpoint`      | Remove a source breakpoint at a file and line.                                     |
| `list_breakpoints`       | List workspace breakpoints.                                                        |
| `inspect_breakpoint`     | Return facts and diagnostic signal IDs for a source breakpoint.                    |
| `toggle_breakpoint`      | Enable or disable a source breakpoint.                                             |
| `remove_all_breakpoints` | Remove all workspace breakpoints.                                                  |

File paths must be absolute. Line numbers start at 1. Condition syntax, hit
condition syntax, and logpoint interpolation depend on the debug adapter.
`inspect_breakpoint` reports evidence; it does not generate a diagnosis.

### Inspection: both modes

| Tool                   | Purpose                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `get_debug_state`      | Read execution state, the current location when paused, and the stop reason. |
| `get_variables`        | Read variables, with optional scope and frame filters.                       |
| `get_call_stack`       | Read stack frames, with an optional maximum depth.                           |
| `evaluate_expression`  | Evaluate an expression, with an optional frame ID.                           |
| `get_threads`          | List threads in the active debug session.                                    |
| `get_console_output`   | Read buffered adapter output, with category, limit, and time filters.        |
| `clear_console_output` | Clear Debugssy's captured output buffer.                                     |

`get_console_output` can also clear the buffer after reading it with
`clear: true`. Clearing this buffer does not clear the editor's Debug Console
display.

### Execution: full mode only

| Tool                                 | Purpose                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `start_debugging`                    | Start a session with a named launch configuration or a configuration object. |
| `stop_debugging`                     | Stop the debug session.                                                      |
| `continue`                           | Resume execution.                                                            |
| `pause`                              | Pause execution.                                                             |
| `restart`                            | Restart the active debug session.                                            |
| `wait_for_breakpoint`                | Wait for a pause, subject to a timeout. Check `get_debug_state` afterward.   |
| `step_over`, `step_into`, `step_out` | Step through execution when `debugssy.allowStepOperations` is also enabled.  |

### Guided prompts

Debugssy provides `debug-crash`, `trace-variable`, `inspect-function`, and
`debug-loop`. Full mode also provides `auto-debug-session`. Use your client's
MCP prompt menu if it supports prompts. Slash-command names and availability
vary by client.

## Settings

Open the editor's Settings view and search for `debugssy`.

| Setting                              | Default    | Description                                                                                     |
| ------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------- |
| `debugssy.mcp.enabled`               | `true`     | Enable the local MCP server.                                                                    |
| `debugssy.mcp.port`                  | `3000`     | Server port. Integer from 1024 to 65535.                                                        |
| `debugssy.mcp.minifyResponses`       | `true`     | Compact JSON tool responses to reduce payload size.                                             |
| `debugssy.automationLevel`           | `assisted` | Choose `assisted` or `full`.                                                                    |
| `debugssy.expressionValidationLevel` | `moderate` | Choose `strict`, `moderate`, `permissive`, or `disabled`. See the thresholds below.             |
| `debugssy.maxExpressionLength`       | `100`      | Character limit for evaluations and validated breakpoint fields. Integer from 20 to 400.        |
| `debugssy.waitForBreakpointTimeout`  | `5000`     | Default wait timeout in milliseconds. Integer from 1000 to 300000. A tool call can override it. |
| `debugssy.allowStepOperations`       | `false`    | Enable step tools in full mode.                                                                 |

The Command Palette provides **Debugssy: Start Server**, **Debugssy: Stop
Server**, and **Debugssy: Restart Server**.

## Security and privacy

### Local connection and data flow

Debugssy binds to localhost. Host and Origin header checks reduce DNS rebinding
risk. Tool arguments are validated with Zod before processing. These controls do
not make the debugger a sandbox.

The MCP server returns variables, expression results, stack information, file
paths, and captured program output to the AI client. The client may send those
results to a model provider. Local transport does not mean that debug data stays
on your machine. Review the client's data policy before inspecting sensitive
values.

### Expression validation

Validation uses language rules, pattern checks, and allowlists. It is a risk
filter, not a guarantee that an expression is safe. An expression that passes
validation runs without a Debugssy approval prompt. If validation flags it, the
following thresholds apply:

| Level                | Flagged risks that require approval       |
| -------------------- | ----------------------------------------- |
| `strict`             | Low, medium, high, and critical.          |
| `moderate` (default) | Medium, high, and critical.               |
| `permissive`         | High and critical, including mutations.   |
| `disabled`           | No expression risk checks or elicitation. |

Typical classifications include getter patterns (low), unknown function calls
(medium), mutations (high), and system operations (critical). Flags below the
selected threshold are allowed without elicitation. Allowlisted operations can
pass even in strict mode.

Expressions at or above the threshold require confirmation through **MCP
elicitation**. If the client does not support elicitation, or the request fails,
Debugssy blocks the operation. A denial or cancellation also prevents it.

### Evaluation approvals

For `evaluate_expression`, you can choose **Allow once**, **Always allow for
this debug session**, or **Deny**. Session approval applies to the same
normalized expression in that debug session. It is cleared when the session
terminates. It does not approve other expressions or persistent breakpoints.

The evaluation length limit still applies when risk validation is disabled.
Overlong expressions are rejected rather than offered for approval.

### Persistent breakpoint approvals

Debugssy validates conditions, hit conditions, and log templates containing
interpolated expressions when its tools create or re-enable a breakpoint. It
checks the complete interpolated log template. The configured length limit
applies to these fields while validation is enabled.

A flagged breakpoint expression at or above the threshold requires approval to
create or enable the breakpoint. This approval permits persistent use. The
expression may run on every hit, including in future debug sessions, until the
breakpoint is removed. There is no session approval option for breakpoints.
Evaluation approvals do not bypass breakpoint checks.

Review the expression and approval scope before accepting. Use the MCP client's
tool permissions to limit access. See [SECURITY.md](./SECURITY.md) for the
threat model and [ALLOWLIST_GUIDE.md](./docs/ALLOWLIST_GUIDE.md) for client
permissions.

## Troubleshooting

### No active debug session

Start the project's debug configuration with `F5`. For variable or stack
inspection, pause execution at a breakpoint first.

### Port already in use

1. Choose an unused port from 1024 to 65535.
2. Set `debugssy.mcp.port` to that port.
3. Update any manual MCP client entries with the new port.
4. Reconnect the client.

Each editor window that runs Debugssy needs its own available port.

### Client cannot connect

1. Check that the editor is open.
2. Check that `debugssy.mcp.enabled` is `true`.
3. Open **View → Output → Debugssy** for server errors.
4. Check server health with `curl http://localhost:3000/health`.
5. Check that the client uses `http://localhost:3000/mcp` with Streamable HTTP.

Use your configured port in both URLs. A successful health request confirms HTTP
reachability, not a completed MCP connection. If the client runs in another
network environment, review [Client setup](#client-setup).

### Variables or stack frames are empty

1. Ask the assistant to check `get_debug_state`.
2. Pause execution if it is running.
3. Retry inspection after the pause.

Scope names depend on the adapter. A filter such as `scope: "Local"` can reduce
output, but a non-matching filter returns no variables. Object previews and
available frames also depend on the adapter.

### Tools are missing after a setting change

1. Check `debugssy.automationLevel`.
2. For step tools, check `debugssy.allowStepOperations`.
3. Reconnect the Debugssy MCP server in the client.
4. If tools are still missing, reload the editor window or restart the client.

This also applies to GitHub Copilot when its tool list does not refresh.

## Architecture and limitations

```text
AI client → MCP over local Streamable HTTP → Debugssy
          → ToolRouter → validation → tools → VS Code Debug API / DAP
```

- **One MCP session per server instance.** A valid new initialization replaces
  the previous connection. Use one AI client at a time for each instance.
- **Active debug session.** Inspection targets the editor's active debug
  session. Stack lookup prefers the stopped thread, then the last observed
  thread. It falls back to thread ID 1 only when no thread is known. Execution
  commands use the editor's debug controls.
- **Observed state.** Debugssy tracks adapter messages for manual and automated
  execution. The accuracy and detail depend on the adapter's messages.
- **Bounded output.** Debugssy keeps a limited output buffer. Output sent only
  to a terminal may not appear in adapter output events.
- **No watch-list management.** Use `evaluate_expression` for individual
  queries.
- **Adapter-dependent data.** Object previews and expression results may be
  abbreviated. Debugssy does not guarantee a complete object expansion.

Key implementation files:

- [src/extension.ts](./src/extension.ts): lifecycle and conditional host
  registration.
- [src/MCPServer.ts](./src/MCPServer.ts): HTTP transport and MCP sessions.
- [src/routing/ToolRouter.ts](./src/routing/ToolRouter.ts): tool dispatch and
  approvals.
- [src/security/ExpressionValidator.ts](./src/security/ExpressionValidator.ts):
  expression risk checks.
- [src/dap/Client.ts](./src/dap/Client.ts): DAP interception and state tracking.

## Building from source

Prerequisites: Git, Node.js 24 with npm, and a compatible editor.

1. Clone the repository:

   ```sh
   git clone https://github.com/gmaynez/debugssy.git
   ```

2. Open the repository directory:

   ```sh
   cd debugssy
   ```

3. Install the locked dependencies:

   ```sh
   npm ci
   ```

4. Compile the extension:

   ```sh
   npm run compile
   ```

Press `F5` in VS Code to launch an Extension Development Host.

| Command                       | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `npm run check-types`         | Check TypeScript types.                                        |
| `npm run lint`                | Check source lint rules.                                       |
| `npm run format:check`        | Check repository formatting.                                   |
| `npm test`                    | Compile and run the Vitest tests.                              |
| `npm run package`             | Build a local VSIX using the current README.md.                |
| `npm run publish-marketplace` | Build a local VSIX using MARKETPLACE.md as the package README. |

Despite its name, `npm run publish-marketplace` **does not upload a release**.
It runs `prepare-publish`, `package`, and `restore-publish` in sequence. The
[preparation script](./scripts/prepare-marketplace.js) backs up both documents
and temporarily copies MARKETPLACE.md over README.md. The package command runs
`vsce package`; its prepublish hook builds the production extension. On success,
the final step restores the documents.

If packaging fails after the swap, the chained restore step does not run. Check
`npm run publish-status` before editing either document. Run
`npm run restore-publish` to restore the backups before continuing.

## Contributing

Report bugs through [GitHub issues](https://github.com/gmaynez/debugssy/issues).
For code changes, follow [AGENTS.md](./AGENTS.md) and the existing TypeScript
style. Add tests for new behavior. Submit changes through a pull request.

Browse
[good first issues](https://github.com/gmaynez/debugssy/labels/good%20first%20issue)
for starter tasks.

## More documentation

- [SECURITY.md](./SECURITY.md): threat model and security policy.
- [ALLOWLIST_GUIDE.md](./docs/ALLOWLIST_GUIDE.md): MCP client tool permissions.
- [DEBUGSSY_PROMPT.md](./DEBUGSSY_PROMPT.md): guide for AI assistants.
- [MCP Specification](https://modelcontextprotocol.io): protocol reference.
- [Debug Adapter Protocol](https://microsoft.github.io/debug-adapter-protocol/):
  debugger integration reference.

## License

Apache 2.0. See [LICENSE](./LICENSE).

Copyright © 2025-2026 Guillermo Garcia Maynez
