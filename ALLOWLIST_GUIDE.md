# MCP Allowlist Configuration Guide

> **Configure which Debugssy tools your AI can use automatically without asking
> for permission each time**

This guide helps you set up allowlists for your MCP client (Claude Desktop,
Cursor, Copilot) to streamline your debugging workflow while maintaining
security.

---

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [How It Works](#-how-it-works)
- [Configuration Examples](#-configuration-examples)
- [Tool Reference](#-tool-reference)
- [Troubleshooting](#-troubleshooting)
- [Security Best Practices](#-security-best-practices)

---

## ⚡ Quick Start

**Too long; didn't read?** Copy one of these configs:

### 🟢 **Safest (Recommended for most users)**

**Uses:** `assisted` mode (default) + read-only tools only

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugssy:get_debug_state",
        "debugssy:get_variables",
        "debugssy:get_call_stack",
        "debugssy:get_console_output",
        "debugssy:list_breakpoints"
      ]
    }
  }
}
```

✅ You control debugging (F5, F10, F11 in VS Code)  
✅ AI can analyze bugs  
✅ AI can inspect variables  
✅ AI can trace execution  
❌ AI cannot set breakpoints or modify anything

---

## 🔄 How It Works

### Automation Modes (VS Code Setting)

Debugssy has **2 automation modes** set via `debugssy.automationLevel`:

| Mode                     | Tools Exposed                                               | You Control                           | AI Controls                    |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------- | ------------------------------ |
| **`assisted`** (default) | Read-only + breakpoints + UI prompts                        | Start/stop debugging, step operations | Inspect state, set breakpoints |
| **`full`**               | All tools including `start_debugging`, `continue`, `step_*` | Nothing (optional monitoring)         | Everything automatically       |

**Why this matters:** The AI only sees tools it can use, preventing confusing
error messages.

### Allowlist Levels (MCP Client Configuration)

Within each automation mode, you can further restrict which tools the AI can use
**without asking permission** via allowlists. Below are 3 common configurations:

---

## ⚙️ Configuration Examples

Choose the configuration that matches your workflow and AI client:

### 🟢 Level 1: Read-Only Tools (Safest)

**Automation mode:** `assisted` (default, no change needed)  
**Allowlist:** Read-only inspection tools only  
**For:** Code review, understanding bugs, learning  
**AI can:** Inspect state, analyze execution  
**AI cannot:** Set breakpoints, modify anything, control execution

<details>
<summary><b>📋 For Claude Desktop</b></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugssy:get_debug_state",
        "debugssy:get_variables",
        "debugssy:get_call_stack",
        "debugssy:get_console_output",
        "debugssy:list_breakpoints"
      ]
    }
  }
}
```

</details>

<details>
<summary><b>⚡ For Cursor</b></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugssy:get_debug_state",
        "debugssy:get_variables",
        "debugssy:get_call_stack",
        "debugssy:get_console_output",
        "debugssy:list_breakpoints"
      ]
    }
  }
}
```

</details>

<details>
<summary><b>🤖 For GitHub Copilot</b></summary>

Add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "debugssy": {
      "url": "http://localhost:3000/mcp",
      "allowlist": [
        "debugssy:get_debug_state",
        "debugssy:get_variables",
        "debugssy:get_call_stack",
        "debugssy:get_console_output",
        "debugssy:list_breakpoints"
      ]
    }
  }
}
```

</details>

---

### 🔵 Level 2: Assisted Mode with Breakpoints (Recommended)

**Automation mode:** `assisted` (default, no change needed)  
**Allowlist:** Read-only + breakpoint management + expression evaluation  
**For:** Interactive debugging, guided workflows  
**AI can:** Everything from Level 1 + set breakpoints + evaluate expressions  
**You control:** Start/stop debugging, step operations via VS Code UI

<details>
<summary><b>📋 Configuration for all MCP clients</b></summary>

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
        "debugssy:list_breakpoints",
        "debugssy:set_breakpoint",
        "debugssy:remove_breakpoint",
        "debugssy:evaluate_expression"
      ]
    }
  }
}
```

> **Note:** In assisted mode, execution control tools (`continue`, `step_over`,
> etc.) return friendly messages prompting you to use VS Code UI.

</details>

---

### 🔴 Level 3: Full Automation (Advanced)

**Automation mode:** `full` ⚠️ **Must set `"debugssy.automationLevel": "full"`
in VS Code settings**  
**Allowlist:** All tools including execution control  
**For:** Automated debugging, batch processing, experienced users  
**AI can:** Complete control including starting/stopping sessions, continue,
step operations  
**You control:** Nothing (AI drives everything)

**⚠️ Only use in trusted environments**

<details>
<summary><b>📋 Configuration for all MCP clients</b></summary>

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
        "debugssy:list_breakpoints",
        "debugssy:wait_for_breakpoint",
        "debugssy:start_debugging",
        "debugssy:stop_debugging",
        "debugssy:set_breakpoint",
        "debugssy:remove_breakpoint",
        "debugssy:continue",
        "debugssy:pause",
        "debugssy:restart",
        "debugssy:evaluate_expression"
      ]
    }
  }
}
```

> **⚠️ Warning:** Full automation gives AI complete control over debugging. Not
> recommended for production debugging or untrusted code.

</details>

---

## 📚 Tool Reference

All Debugssy tools organized by category and safety level:

### 🟢 Read-Only Tools (Safest)

| Tool                 | Description                           | Available In |
| -------------------- | ------------------------------------- | ------------ |
| `get_debug_state`    | Check if debugger is running/paused   | Both modes   |
| `get_variables`      | Read variable values at current point | Both modes   |
| `get_call_stack`     | View execution call stack             | Both modes   |
| `get_threads`        | List all threads                      | Both modes   |
| `get_console_output` | Read debug console output             | Both modes   |
| `list_breakpoints`   | Show all active breakpoints           | Both modes   |

**Why safe:** Cannot modify code, change execution, or execute expressions.
Read-only access to what's visible in VS Code debugger UI.

---

### 🟡 Breakpoint Management Tools

| Tool                     | Description                          | Risk Level |
| ------------------------ | ------------------------------------ | ---------- |
| `set_breakpoint`         | Create breakpoints (with conditions) | 🟡 Low     |
| `remove_breakpoint`      | Remove specific breakpoint           | 🟡 Low     |
| `toggle_breakpoint`      | Enable/disable breakpoint            | 🟡 Low     |
| `remove_all_breakpoints` | Clear all breakpoints                | 🟡 Low     |

**Why generally safe:** Only affects debugging, not your actual code. Easy to
undo manually via VS Code UI.

---

### 🟠 Code Execution Tools

| Tool                  | Description                           | Safety Features                                                 |
| --------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `evaluate_expression` | Evaluate expressions in debug context | ✅ Built-in validation with user approval for unsafe operations |

**Safety:** Expressions are validated for side effects. Safe operations
(variable access, arithmetic) run automatically. Dangerous operations (function
calls, assignments) require your approval via elicitation.

#### Expression Validation Levels

Configure how strictly expressions are validated via
`debugssy.expressionValidationLevel`:

| Validation Level          | What Requires Approval                        | What Runs Automatically                                                                                | Use Case                                   |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **`strict`**              | 🔴 Critical<br>🟠 High<br>🟡 Medium<br>🟢 Low | ✅ Only safe built-ins<br>✅ Variable access<br>✅ Arithmetic                                          | Maximum security, high interruption        |
| **`moderate`** ⭐ Default | 🔴 Critical<br>🟠 High<br>🟡 Medium           | ✅ Safe built-ins<br>✅ Variable access<br>✅ Arithmetic<br>✅ **Getter methods**                      | Balanced security/usability                |
| **`permissive`**          | 🔴 Critical<br>🟠 High                        | ✅ Safe built-ins<br>✅ Variable access<br>✅ Arithmetic<br>✅ Getter methods<br>✅ **User functions** | Low interruption, experienced users        |
| **`disabled`**            | (Nothing)                                     | ⚠️ **Everything**                                                                                      | Not recommended, trusted environments only |

**Risk Levels Explained:**

| Risk            | Examples                                    | Why It's Risky                                             |
| --------------- | ------------------------------------------- | ---------------------------------------------------------- |
| 🔴 **Critical** | `fs.unlink()`, `process.exit()`, `fetch()`  | Can modify files, exit app, make network requests          |
| 🟠 **High**     | `arr.push()`, `x = 5`, `eval()`             | Modifies state, can mask bugs or cause unexpected behavior |
| 🟡 **Medium**   | `myFunction()`, `customUtil()`              | User-defined functions may have side effects               |
| 🟢 **Low**      | `getUser()`, `isValid()`, `hasPermission()` | Getter patterns, typically read-only                       |

**Example configuration:**

```json
{
  "debugssy.expressionValidationLevel": "moderate"
}
```

**Learn more:** See
[EXPRESSION_VALIDATION_GUIDE.md](./EXPRESSION_VALIDATION_GUIDE.md)

---

### 🔵 Execution Control Tools (Mode-Aware)

**Behavior changes based on automation mode:**

| Tool             | Assisted Mode                      | Full Automation Mode      |
| ---------------- | ---------------------------------- | ------------------------- |
| `continue`       | Prompts you to click in VS Code UI | ▶️ Executes automatically |
| `step_over`      | Prompts you to click in VS Code UI | ▶️ Executes automatically |
| `step_into`      | Prompts you to click in VS Code UI | ▶️ Executes automatically |
| `step_out`       | Prompts you to click in VS Code UI | ▶️ Executes automatically |
| `pause`          | Prompts you to click in VS Code UI | ▶️ Executes automatically |
| `restart`        | Prompts you to click in VS Code UI | ▶️ Executes automatically |
| `stop_debugging` | Stops the session                  | Stops the session         |

---

### 🔴 Full Automation Only Tools

| Tool                  | Description                          | Availability          |
| --------------------- | ------------------------------------ | --------------------- |
| `start_debugging`     | Start debug session programmatically | **Only in full mode** |
| `wait_for_breakpoint` | Block until execution pauses         | **Only in full mode** |

**Why restricted:** These tools give AI complete control over debugging. Only
visible when `automationLevel` is set to `"full"`.

---

## 🛡️ Security Best Practices

### ✅ Do's

- ✅ **Start with Level 1** (read-only) and add tools as needed
- ✅ **Use assisted mode by default** - You maintain control
- ✅ **Trust the built-in validation** - Expression validator protects against
  unsafe code
- ✅ **Test with simple queries first** - "What's the value of x?"
- ✅ **Review allowlist periodically** - Remove unused tools

### ❌ Don'ts

- ❌ **Don't allowlist all tools blindly** - Only add what you need
- ❌ **Don't use full automation for production** - Too risky
- ❌ **Don't disable expression validation** - Keep `expressionValidationLevel`
  at `moderate`
- ❌ **Don't expose remote access** - Server is localhost-only by design

### 🔒 Additional Security Layers

Debugssy has multiple security layers regardless of allowlist:

| Layer           | Protection                                      |
| --------------- | ----------------------------------------------- |
| **Network**     | Localhost-only binding (127.0.0.1)              |
| **Origin**      | Origin header validation prevents DNS rebinding |
| **Protocol**    | MCP version validation                          |
| **Sessions**    | Cryptographic UUIDs                             |
| **Expressions** | Multi-level validation with elicitation         |
| **Input**       | Zod schema validation for all parameters        |

**Learn more:** See [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md) for complete
security details

---

## 🔧 Troubleshooting

### Tools Not Working?

<details>
<summary><b>✓ Check server is running</b></summary>

```bash
curl http://localhost:3000/health
```

**Expected response:**

```json
{
  "status": "ok",
  "server": "debugssy-mcp",
  "version": "1.2.0",
  "transportInitialized": true
}
```

If it fails:

1. Check VS Code Output panel: `View → Output → Debugssy`
2. Restart VS Code
3. Verify extension is installed

</details>

<details>
<summary><b>✓ Verify port configuration</b></summary>

Check VS Code settings match your allowlist config:

```json
// In VS Code settings.json
"debugssy.mcp.port": 3000  // Should match your MCP client config
```

Common issue: Using port 3001 in settings but 3000 in allowlist.

</details>

<details>
<summary><b>✓ Check automation mode</b></summary>

Some tools only work in specific modes:

```json
// In VS Code settings.json
"debugssy.automationLevel": "assisted"  // or "full"
```

| Tool                  | Required Mode |
| --------------------- | ------------- |
| `start_debugging`     | Full only     |
| `wait_for_breakpoint` | Full only     |
| All others            | Both modes    |

</details>

<details>
<summary><b>✓ Test incrementally</b></summary>

**Step 1:** Start with ONE safe tool:

```json
{
  "allowlist": ["debugssy:get_debug_state"]
}
```

**Step 2:** Verify it works without approval prompts

**Step 3:** Add more tools one at a time

**Step 4:** If a tool stops working, you know which one caused the issue

</details>

<details>
<summary><b>✓ Expression validation too strict or too lenient?</b></summary>

Adjust the validation level in VS Code settings:

```json
// In VS Code settings.json
"debugssy.expressionValidationLevel": "moderate"  // strict, moderate, permissive, or disabled
```

**If you're getting too many approval prompts:**

- `moderate` → `permissive` (allows user functions automatically)
- Check which risk level is triggering prompts (shown in approval message)

**If expressions aren't being validated enough:**

- `moderate` → `strict` (asks approval even for getter methods)

**Understanding what gets validated:**

| Level         | Asks Approval For               | Runs Automatically                        |
| ------------- | ------------------------------- | ----------------------------------------- |
| `strict`      | Critical, High, Medium, **Low** | Only safe built-ins                       |
| `moderate` ⭐ | Critical, High, **Medium**      | Safe built-ins + getter methods           |
| `permissive`  | **Critical, High**              | Safe built-ins + getters + user functions |
| `disabled`    | Nothing                         | Everything (not recommended)              |

See the [Expression Validation Levels](#expression-validation-levels) section
for details on risk levels.

</details>

---

## 🎓 Quick Decision Guide

**Not sure which configuration to use?** Answer these questions:

### 1. Choose Your Automation Mode (VS Code Setting)

| Mode            | Setting                                            | Who Controls Debugging?                   |
| --------------- | -------------------------------------------------- | ----------------------------------------- |
| **Assisted** ⭐ | `"debugssy.automationLevel": "assisted"` (default) | You control via VS Code UI (F5, F10, F11) |
| **Full**        | `"debugssy.automationLevel": "full"`               | AI controls everything automatically      |

### 2. Choose Your Allowlist Level (MCP Client Config)

**What's your goal?**

- Just understand bugs → **Level 1** (Read-only tools only)
- Interactive debugging → **Level 2** (Add breakpoints + expressions)
- Fully automated sessions → **Level 3** (Requires `full` mode + all tools)

**How much control do you want?**

- Full control (you click buttons) → **Level 1 or 2** with `assisted` mode
- Let AI drive → **Level 3** with `full` mode

**Is this production code?**

- Yes → **Level 1 only** (safest, read-only)
- No → **Any level** based on your comfort

**How much do you trust your AI?**

- Still learning → **Level 1** (read-only)
- Trust for guided help → **Level 2** (breakpoints allowed)
- Complete trust → **Level 3** (full automation)

### 3. Choose Your Expression Validation Level

**In VS Code settings** (`debugssy.expressionValidationLevel`):

- Maximum security, don't mind approvals → **`strict`**
- Balanced (recommended) → **`moderate`** ⭐
- Experienced user, minimal interruption → **`permissive`**
- Fully trusted environment only → **`disabled`** ⚠️

---

## 📚 Additional Resources

- **[README.md](./README.md)** - Complete tool documentation and API reference
- **[MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md)** - Security implementation details
- **[EXPRESSION_VALIDATION_GUIDE.md](./EXPRESSION_VALIDATION_GUIDE.md)** -
  Expression safety guide
- **[Model Context Protocol Specification](https://modelcontextprotocol.io/)** -
  Official MCP docs

---

## 💬 Need Help?

- **Issues or bugs:**
  [Open an issue](https://github.com/gmaynez/debugssy/issues)
- **Questions:** Check [README.md FAQ](./README.md#faq)
- **Security concerns:** See [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md)

---

<div align="center">

**Happy debugging! 🐛→✅**

Made with ❤️ for developers who want smarter workflows

</div>
