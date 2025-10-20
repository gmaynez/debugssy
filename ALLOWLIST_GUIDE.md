# MCP Allowlist Quick Reference

This guide helps you configure which Debugsy tools should be automatically approved in your MCP client (like Claude Desktop) without requiring confirmation for each call.

## TL;DR - Safe Tools to Allowlist

These **6 read-only tools** are safe to allowlist:

1. `debugsy:get_debug_state` - Query debug session state
2. `debugsy:get_variables` - Read variable values  
3. `debugsy:get_call_stack` - Read call stack
4. `debugsy:get_threads` - List threads
5. `debugsy:list_breakpoints` - List breakpoints
6. `debugsy:wait_for_breakpoint` - Wait for execution to pause (full mode)

## Configuration Examples

### For Claude Desktop

Add to your `claude_desktop_config.json`:

#### Safest Configuration (Read-Only Analysis)
```json
{
  "mcpServers": {
    "debugsy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugsy:get_debug_state",
        "debugsy:get_variables",
        "debugsy:get_call_stack",
        "debugsy:list_breakpoints"
      ]
    }
  }
}
```

**Use case:** AI can analyze your debugging state but cannot modify anything. Perfect for code review and understanding execution flow.

#### Recommended Configuration (Active Debugging)
```json
{
  "mcpServers": {
    "debugsy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugsy:get_debug_state",
        "debugsy:get_variables",
        "debugsy:get_call_stack",
        "debugsy:get_threads",
        "debugsy:list_breakpoints",
        "debugsy:wait_for_breakpoint"
      ]
    }
  }
}
```

**Use case:** AI can inspect your debugging session comprehensively. You'll still approve each breakpoint and execution control operation manually. **Recommended for most users.**

#### Advanced Configuration (Semi-Automated)
```json
{
  "mcpServers": {
    "debugsy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugsy:get_debug_state",
        "debugsy:get_variables",
        "debugsy:get_call_stack",
        "debugsy:get_threads",
        "debugsy:list_breakpoints",
        "debugsy:wait_for_breakpoint",
        "debugsy:set_breakpoint",
        "debugsy:continue"
      ]
    }
  }
}
```

**Use case:** AI can set breakpoints and continue execution automatically. **Only recommended for full automation mode and experienced users.** Not suitable for production debugging.

## Tool Categories

### ✅ Safe (Read-Only)
These tools NEVER modify state:
- `debugsy:get_debug_state`
- `debugsy:get_variables`
- `debugsy:get_call_stack`
- `debugsy:get_threads`
- `debugsy:list_breakpoints`
- `debugsy:wait_for_breakpoint`

### ⚠️ Breakpoint Management (Write)
These tools modify breakpoints:
- `debugsy:set_breakpoint`
- `debugsy:remove_breakpoint`
- `debugsy:toggle_breakpoint`
- `debugsy:remove_all_breakpoints`

### 🔴 Execution Control (Full Mode Only)
These tools control program execution:
- `debugsy:start_debugging`
- `debugsy:stop_debugging`
- `debugsy:continue`
- `debugsy:step_over`
- `debugsy:step_into`
- `debugsy:step_out`
- `debugsy:pause`
- `debugsy:restart`

### ⚠️ Code Execution (Potential Side Effects)
This tool can execute arbitrary code:
- `debugsy:evaluate_expression`

## Why These Tools Are Safe

The 6 recommended allowlist tools are safe because they:

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
   "debugsy.mcp.port": 3000
   ```

3. **Check automation level** for full-mode-only tools:
   ```json
   "debugsy.automationLevel": "full"  // or "assisted"
   ```

4. **Test with a simple tool first:**
   - Start with just `debugsy:get_debug_state`
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

