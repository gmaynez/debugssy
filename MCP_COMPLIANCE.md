# MCP Specification Compliance

> **How Debugssy follows the Model Context Protocol security standards**

This document outlines Debugssy's compliance with the [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) security best practices.

**Protocol Support:** 2025-03-26 and 2025-06-18 (backwards compatible)

---

## 📋 Table of Contents

- [Transport Implementation](#transport-implementation)
- [Security Best Practices](#-security-best-practices)
- [Session Management](#-session-management)
- [Protocol Version Handling](#-protocol-version-handling)
- [Compliance Summary](#-compliance-summary)
- [Verification](#-verification)

---

## Transport Implementation

Debugssy uses **Streamable HTTP** transport as defined in the MCP specification:

| Feature | Implementation |
|---------|---------------|
| **Endpoint** | `/mcp` (POST, GET, DELETE) |
| **Protocol** | JSON-RPC 2.0 over HTTP |
| **Streaming** | Server-Sent Events (SSE) |
| **Session Management** | MCP SDK's `StreamableHTTPServerTransport` |

---

## 🔒 Security Best Practices

### Network Security

| Protection | Status | Description |
|------------|--------|-------------|
| **Localhost Binding** | ✅ **MUST** | Server binds only to `127.0.0.1`, no remote access |
| **Origin Validation** | ✅ **MUST** | Validates `Origin` header to prevent DNS rebinding attacks |
| **Supported Origins** | ✅ Enforced | Only `localhost`, `127.0.0.1`, `[::1]` allowed |

**What this means:** Debugssy is unreachable from the network. Only applications running on your local machine can connect.

### Authentication

| Feature | Status | Rationale |
|---------|--------|-----------|
| **Token Auth** | ⚪ Not Implemented | Local-only VS Code extension, origin validation provides sufficient protection |

**Note:** Authentication may be added in future versions for multi-user scenarios.

---

## 🎫 Session Management

### Session ID Generation

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Cryptographically Secure** | ✅ **MUST** | Uses `crypto.randomUUID()` |
| **Globally Unique** | ✅ **SHOULD** | UUID v4 format |
| **Visible ASCII Only** | ✅ **MUST** | Alphanumeric + hyphens only |
| **Format** | ✅ Enforced | `mcp-session-<uuid>` |

**Example Session ID:** `mcp-session-123e4567-e89b-12d3-a456-426614174000`

**Security:** Session IDs are unpredictable and cannot be guessed or enumerated by attackers.

### Session Lifecycle

| Stage | HTTP Response | Description |
|-------|---------------|-------------|
| **Initialize** | `200 OK` + `Mcp-Session-Id` header | Session created, ID provided to client |
| **Active** | `200 OK` | Valid session ID accepted |
| **Missing ID** | `400 Bad Request` | Client must provide `Mcp-Session-Id` header |
| **Expired** | `404 Not Found` | Session no longer exists |
| **Terminate** | `200 OK` (on DELETE) | Client explicitly ends session |

---

## 📦 Protocol Version Handling

### MCP-Protocol-Version Header (NEW in 2025-06-18)

| Supported Version | Status | Notes |
|-------------------|--------|-------|
| **2025-06-18** | ✅ Current | Latest specification |
| **2025-03-26** | ✅ Legacy | Backwards compatibility |

**Header Validation:**

| Client Behavior | Server Response |
|-----------------|-----------------|
| Sends `2025-06-18` | ✅ `200 OK` |
| Sends `2025-03-26` | ✅ `200 OK` |
| Sends unsupported version | ❌ `400 Bad Request` |
| Omits header | ✅ `200 OK` (assumes `2025-03-26`) |

**Backwards Compatibility:** Clients using older MCP implementations without the version header are supported.

---

## 🛡️ Advanced Security Features

### Session Hijacking Prevention

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Non-Deterministic IDs** | ✅ **MUST** | Cryptographically secure UUIDs |
| **Secure Random Generation** | ✅ **SHOULD** | `crypto.randomUUID()` |
| **Session ≠ Authentication** | ✅ **MUST NOT** | Sessions track connections only |

**Protection:** Session IDs cannot be predicted, guessed, or enumerated by attackers.

### OAuth Security Patterns

| Pattern | Applicability | Status |
|---------|---------------|--------|
| **Confused Deputy** | MCP proxy servers forwarding to third-party APIs | ⚪ Not Applicable (not a proxy) |
| **Token Passthrough** | Accepting OAuth tokens without validation | ⚪ Not Applicable (no OAuth) |

**Note:** Debugssy operates exclusively within VS Code without third-party API integrations or OAuth flows.

---

## 📝 Protocol Details

### Message Format

| Requirement | Status | Details |
|-------------|--------|---------|
| **Encoding** | ✅ **MUST** | JSON-RPC 2.0, UTF-8 encoded |
| **Format** | ✅ Enforced | All messages follow JSON-RPC spec |

### HTTP Methods

| Method | Purpose | Response |
|--------|---------|----------|
| **POST** | Send JSON-RPC messages | `200 OK` with response |
| **GET** | Open SSE stream for server messages | `200 OK` (streaming) |
| **DELETE** | Terminate session | `200 OK` |

### Connection Management

| Feature | Status | Handled By |
|---------|--------|------------|
| **Multiple Connections** | ✅ Supported | MCP SDK |
| **SSE Streams** | ✅ Supported | MCP SDK |
| **Reconnection** | ✅ Supported | MCP SDK (`Last-Event-ID`) |
| **Message Redelivery** | ✅ Supported | MCP SDK |

### HTTP Status Codes

| Code | Meaning | When Used |
|------|---------|-----------|
| `200 OK` | Success | Valid requests |
| `202 Accepted` | Acknowledged | Notifications |
| `400 Bad Request` | Invalid request | Missing session ID, bad protocol version |
| `403 Forbidden` | Access denied | Invalid origin |
| `404 Not Found` | Not found | Expired session |
| `405 Method Not Allowed` | Wrong method | Unsupported HTTP method |
| `500 Internal Server Error` | Server error | Unexpected failures |

---

## ✅ Verification

### Quick Health Check

```bash
curl http://localhost:3000/health
```

**Expected response:**
```json
{
  "status": "ok",
  "server": "debugssy-mcp",
  "version": "1.2.0",
  "transportInitialized": true,
  "transport": "streamable-http",
  "protocolVersion": "2025-06-18",
  "supportedProtocolVersions": ["2025-03-26", "2025-06-18"]
}
```

### Security Tests

<details>
<summary><b>Test Origin Validation</b></summary>

```bash
# Should reject remote origins
curl -H "Origin: http://evil-domain.com" http://localhost:3000/mcp
# Expected: 403 Forbidden
```

</details>

<details>
<summary><b>Test Session Management</b></summary>

1. Initialize session → Verify `Mcp-Session-Id` header
2. Use session ID in requests → Verify `200 OK`
3. Omit session ID → Verify `400 Bad Request`
4. Use expired session → Verify `404 Not Found`

</details>

---

## 📊 Compliance Summary

### Core Requirements

| Requirement | Priority | Status | Notes |
|------------|----------|--------|-------|
| **Streamable HTTP Transport** | **MUST** | ✅ Compliant | MCP SDK implementation |
| **Origin Header Validation** | **MUST** | ✅ Compliant | DNS rebinding protection |
| **Localhost Binding** | **SHOULD** | ✅ Compliant | Binds to 127.0.0.1 only |
| **Protocol Version Header** | **MUST** | ✅ Compliant | Supports 2025-06-18 + 2025-03-26 |
| **Session Management** | **MUST** | ✅ Compliant | MCP SDK session handling |
| **Cryptographically Secure IDs** | **SHOULD** | ✅ Compliant | `crypto.randomUUID()` |
| **Session Hijacking Prevention** | **MUST** | ✅ Compliant | Non-deterministic session IDs |
| **JSON-RPC UTF-8** | **MUST** | ✅ Compliant | Automatic UTF-8 encoding |
| **HTTP Method Support** | **MUST** | ✅ Compliant | POST, GET, DELETE |
| **Proper Status Codes** | **MUST** | ✅ Compliant | 200, 202, 400, 403, 404, 405, 500 |

### OAuth-Specific Requirements

| Requirement | Priority | Status | Notes |
|------------|----------|--------|-------|
| **Confused Deputy Protection** | **MUST** (if proxy) | ⚪ N/A | Not a proxy server |
| **Token Passthrough Prevention** | **MUST** (if OAuth) | ⚪ N/A | No OAuth implementation |

### Optional Features

| Feature | Priority | Status | Rationale |
|---------|----------|--------|-----------|
| **Authentication** | **SHOULD** | ⚠️ Not Implemented | Local-only extension, origin validation sufficient |

**Overall Compliance:** ✅ **Fully Compliant** with MCP Specification 2025-06-18

---

## 📚 References

### MCP Specifications

- **[MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)** - Current transport specification
- **[MCP Security Best Practices 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/security_best_practices)** - Security guidelines
- **[MCP Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports)** - Legacy transport specification

### Related Standards

- **[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)** - Official SDK documentation
- **[JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)** - Message format standard

### Additional Documentation

- **[README.md](./README.md)** - Complete Debugssy documentation
- **[ALLOWLIST_GUIDE.md](./ALLOWLIST_GUIDE.md)** - Security configuration guide

---

<div align="center">

**Debugssy is fully compliant with MCP 2025-06-18 security standards** 🔒

</div>

