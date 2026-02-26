# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in
Debugssy, please report it responsibly.

### How to Report

1. **DO NOT** open a public GitHub issue for security vulnerabilities
2. Open a private security advisory at:
   **[GitHub Security Advisories](https://github.com/gmaynez/debugssy/security/advisories/new)**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### Response Timeline

- **Initial response:** Within 48 hours
- **Status update:** Within 7 days
- **Fix timeline:** Depends on severity (critical: ASAP, high: 2 weeks, medium:
  1 month)

---

## Security Architecture

### Defense in Depth

Debugssy implements multiple security layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layers                          │
├─────────────────────────────────────────────────────────────┤
│  1. Network Security     │ Localhost-only binding           │
│  2. Origin Validation    │ DNS rebinding protection         │
│  3. Protocol Validation  │ MCP version enforcement          │
│  4. Session Security     │ Cryptographic UUIDs              │
│  5. Input Validation     │ Zod schema validation            │
│  6. Expression Security  │ Multi-layer pattern detection    │
│  7. User Confirmation    │ Elicitation for risky operations │
└─────────────────────────────────────────────────────────────┘
```

### Expression Validator Protection

The expression validator protects against code injection attacks through:

| Protection Layer         | Attacks Blocked                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Critical Operations**  | File system, process execution, network requests                                                                       |
| **Prototype Chain**      | `__proto__`, `.constructor.constructor`, pollution                                                                     |
| **Global Object Access** | `globalThis`, `window`, `global`, `self`                                                                               |
| **String Obfuscation**   | `String.fromCharCode`, `atob`, `Buffer.from`                                                                           |
| **Meta-programming**     | `Proxy`, `Reflect`, `Object.defineProperty`                                                                            |
| **Comment Injection**    | `/* */`, `//`, `#` hiding malicious code                                                                               |
| **Dynamic Invocation**   | `eval`, `Function`, `exec`, `compile`                                                                                  |
| **State Mutations**      | Assignments, `push()`, `splice()`, `++`                                                                                |
| **Bracket Obfuscation**  | Concatenation `["ev"+"al"]()`, template literals, variable identifiers `[varName]()`, escape sequences `["\x65val"]()` |

### Validation Levels

| Level        | Risk Threshold  | Use Case                   |
| ------------ | --------------- | -------------------------- |
| `strict`     | All risks       | Maximum security           |
| `moderate`   | Medium+         | Balanced (default)         |
| `permissive` | Critical + High | Experienced users          |
| `disabled`   | None            | Fully trusted environments |

---

## Security Best Practices for Users

### 🛡️ Recommended Practices

#### 1. Use Fresh Agent Windows

Start a new AI conversation for debugging sessions. This prevents:

- Prompt injection from previous web searches
- Context pollution from untrusted sources
- Accumulated malicious instructions

```
✅ Good: New chat → Debug session
❌ Bad:  Web search → Debug in same chat
```

#### 2. Avoid Web Searches During Debugging

The primary attack vector for prompt injection is external content:

```
Attack Chain:
User searches web → Malicious site with hidden prompt injection
                              ↓
              AI reads poisoned content → AI manipulated
                              ↓
              AI calls evaluate_expression("malicious code")
```

**Mitigation:** Keep debugging sessions isolated from web searches.

#### 3. Keep Expression Validation Enabled

```json
{
  "debugssy.expressionValidationLevel": "moderate"
}
```

Never set to `disabled` unless in a fully trusted, isolated environment.

#### 4. Review Elicitation Prompts

When the AI requests approval for an expression:

- Read the expression carefully
- Understand what it will do
- Reject if unfamiliar or suspicious

#### 5. Use MCP Client Allowlists

Restrict which tools the AI can use:

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

See [ALLOWLIST_GUIDE.md](./docs/ALLOWLIST_GUIDE.md) for complete examples.

---

## Threat Model

### In Scope

| Threat                    | Mitigation                              |
| ------------------------- | --------------------------------------- |
| Prompt injection via AI   | Expression validation, user elicitation |
| DNS rebinding attacks     | Origin header validation                |
| Remote access attempts    | Localhost-only binding                  |
| Code injection via eval   | Blocked at validator level              |
| File system manipulation  | Critical operation detection            |
| Process execution         | Critical operation detection            |
| Prototype pollution       | Prototype chain blocking                |
| Obfuscated malicious code | Multiple obfuscation pattern detection  |

### Out of Scope

| Threat                        | Reason                                    |
| ----------------------------- | ----------------------------------------- |
| Malicious code in user's repo | User controls their own codebase          |
| AI assistant vulnerabilities  | Outside Debugssy's control                |
| VS Code vulnerabilities       | Outside Debugssy's control                |
| Physical access attacks       | Desktop security is user's responsibility |
| Social engineering            | User education, not technical mitigation  |

### Known Limitations

The regex-based expression validator has inherent limitations.

Previously, indirect invocation techniques (indirect calling conventions, array
extraction, tagged template syntax) and Unicode confusable characters could
bypass keyword detection. These have been addressed:

- Indirect `eval` invocation forms are now blocked by matching the bare keyword
  rather than only `eval(` call syntax
- Unicode normalization (NFKC) is applied before validation to neutralize
  fullwidth and compatibility look-alike characters

Remaining inherent limitations of a regex-based approach:

- **Novel obfuscation chains** not yet covered by existing patterns may go
  undetected until identified and patched
- **NFKC-invisible confusables** — characters that are visually similar but have
  no NFKC decomposition to ASCII (e.g. some Cyrillic/Greek look-alikes) are not
  normalized away; a full Unicode confusables database would be needed for
  complete coverage

These residual risks are mitigated by:

1. User elicitation for unrecognized patterns
2. Operational security (fresh agent windows, avoiding web searches mid-session)
3. Low likelihood of these specific techniques appearing in typical prompt
   injection attacks targeting a debug tool

---

## Compliance

Debugssy follows:

- [MCP Security Best Practices 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)
- OWASP secure coding guidelines
- Principle of least privilege

See [MCP_COMPLIANCE.md](./docs/MCP_COMPLIANCE.md) for detailed compliance
information.

---

## Security Updates

Security updates are released as patch versions (e.g., 1.4.5) and announced via:

- GitHub Releases
- VS Code Marketplace update notifications
- GitHub Security Advisories (for vulnerabilities)

**Always keep Debugssy updated to the latest version.**

---

## Acknowledgments

We appreciate responsible security researchers who help make Debugssy safer.
Contributors who report valid security issues will be acknowledged here (with
permission).

---

## Contact

- **Security issues:**
  [GitHub Security Advisories](https://github.com/gmaynez/debugssy/security/advisories/new)
- **General questions:**
  [GitHub Issues](https://github.com/gmaynez/debugssy/issues)
- **Documentation:** [README.md](./README.md)
