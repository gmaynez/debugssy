# MCP Allowlist Quick Reference

This guide helps you configure which Debugssy tools should be automatically approved in your MCP client (like Claude Desktop) without requiring confirmation for each call.

## How Tool Availability Works

**Important:** Debugssy dynamically exposes different tools based on your automation mode:

- **Assisted Mode** (default): AI sees read-only tools, breakpoint management, and tools that prompt you to use VS Code UI for execution control. The `start_debugging` and `wait_for_breakpoint` tools are NOT available.
  
- **Full Automation Mode**: AI sees all tools and can automatically control debugging execution. The `start_debugging` and `wait_for_breakpoint` tools become available.

This prevents the AI from attempting to call tools that would be blocked by your automation mode, improving the user experience.

## TL;DR - Safe Tools to Allowlist

These **5 read-only tools** are safe to allowlist in **both modes**:

1. `debugssy:get_debug_state` - Query debug session state
2. `debugssy:get_variables` - Read variable values  
3. `debugssy:get_call_stack` - Read call stack
4. `debugssy:get_threads` - List threads
5. `debugssy:list_breakpoints` - List breakpoints

**Full automation mode only:**
- `debugssy:wait_for_breakpoint` - Wait for execution to pause (only visible in full mode)

## Configuration Examples

### For Claude Desktop

Add to your `claude_desktop_config.json`:

#### Safest Configuration (Read-Only Analysis)
```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugssy:get_debug_state",
        "debugssy:get_variables",
        "debugssy:get_call_stack",
        "debugssy:list_breakpoints"
      ]
    }
  }
}
```

**Use case:** AI can analyze your debugging state but cannot modify anything. Perfect for code review and understanding execution flow.

#### Recommended Configuration (Assisted Mode)
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
        "debugssy:list_breakpoints",
        "debugssy:continue",
        "debugssy:step_over",
        "debugssy:step_into",
        "debugssy:step_out"
      ]
    }
  }
}
```

**Use case:** AI can inspect your debugging session and guide you through execution. AI will prompt you to click buttons in VS Code UI (e.g., "Please click Continue"). You manually start debugging and retain full control. **Recommended for most users.**

#### Advanced Configuration (Full Automation Mode)
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
        "debugssy:list_breakpoints",
        "debugssy:wait_for_breakpoint",
        "debugssy:start_debugging",
        "debugssy:set_breakpoint",
        "debugssy:continue",
        "debugssy:step_over",
        "debugssy:step_into"
      ]
    }
  }
}
```

**Prerequisites:** Set `"debugssy.automationLevel": "full"` in VS Code settings.

**Use case:** AI can start debugging, set breakpoints, and control execution automatically. **Only recommended for full automation mode and experienced users.** Not suitable for production debugging.

## Tool Categories

### ✅ Safe (Read-Only) - Available in Both Modes
These tools NEVER modify state:
- `debugssy:get_debug_state`
- `debugssy:get_variables`
- `debugssy:get_call_stack`
- `debugssy:get_threads`
- `debugssy:list_breakpoints`

### 🔵 Full Automation Only
These tools are only exposed when `automationLevel` is set to `"full"`:
- `debugssy:start_debugging` - Start a debug session programmatically
- `debugssy:wait_for_breakpoint` - Block until execution pauses

### ⚠️ Breakpoint Management (Write)
These tools modify breakpoints:
- `debugssy:set_breakpoint`
- `debugssy:remove_breakpoint`
- `debugssy:toggle_breakpoint`
- `debugssy:remove_all_breakpoints`

### 🔴 Execution Control - Mode-Aware Behavior
These tools control program execution and behave differently based on mode:

**In Assisted Mode** (default): These tools return friendly messages prompting you to use VS Code UI:
- `debugssy:stop_debugging` - Stops the session
- `debugssy:continue` - Prompts "Please click Continue in VS Code debugger UI"
- `debugssy:step_over` - Prompts "Please click Step Over in VS Code debugger UI"
- `debugssy:step_into` - Prompts "Please click Step Into in VS Code debugger UI"
- `debugssy:step_out` - Prompts "Please click Step Out in VS Code debugger UI"
- `debugssy:pause` - Prompts "Please click Pause in VS Code debugger UI"
- `debugssy:restart` - Prompts "Please click Restart in VS Code debugger UI"

**In Full Automation Mode**: These tools directly execute the corresponding commands automatically.

### ⚠️ Code Execution (Potential Side Effects)
This tool can execute arbitrary code:
- `debugssy:evaluate_expression`

## Why These Tools Are Safe

The 5 recommended read-only tools are safe because they:

1. **Cannot modify your code** - They only read existing state
2. **Cannot change execution flow** - They don't start/stop/step through code
3. **Cannot create/remove breakpoints** - Your breakpoints remain unchanged
4. **Cannot execute code** - No `eval()` or expression evaluation
5. **Only read what you can see** - They access the same info visible in VS Code's debugger UI
6. **Respect VS Code permissions** - They work within VS Code's security model

Even with these tools allowlisted, you maintain control through:
- Your automation level setting (assisted vs full)
- Manual approval of all write operations
- VS Code's debugging safeguards

## Debugging Your Allowlist Configuration

If tools aren't working as expected:

1. **Check the server is running:**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return `{"status":"ok",...}`

2. **Verify port number:** Default is 3000, check your VS Code settings:
   ```json
   "debugssy.mcp.port": 3000
   ```

3. **Check automation level** for full-mode-only tools:
   ```json
   "debugssy.automationLevel": "full"  // or "assisted"
   ```

4. **Test with a simple tool first:**
   - Start with just `debugssy:get_debug_state`
   - Verify it works without approval prompts
   - Add more tools incrementally

## Security Considerations

- **Never allowlist execution control tools** unless you fully trust the AI and understand the implications
- **Always review `evaluate_expression` calls** - they can execute arbitrary code
- **Use assisted mode by default** - switch to full mode only when needed
- **The server only accepts localhost connections** - no remote access is possible
- **Origin validation is enabled** - protects against DNS rebinding attacks

## Learn More

- See [README.md](./README.md) for complete tool documentation
- See [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md) for security implementation details
- See [MCP Specification](https://modelcontextprotocol.io/) for protocol details

