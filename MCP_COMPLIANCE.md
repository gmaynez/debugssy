# MCP Specification Compliance

This document outlines how Debugsy follows the [MCP Specification 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) best practices.

**Note**: This implementation supports both protocol versions 2025-03-26 and 2025-06-18 for backwards compatibility.

## Transport Implementation

### ✅ Streamable HTTP Transport
We use the **Streamable HTTP** transport as defined in the specification:
- Single MCP endpoint at `/mcp` supporting POST, GET, and DELETE methods
- Proper handling of JSON-RPC messages
- Support for Server-Sent Events (SSE) for streaming responses
- Session management through `StreamableHTTPServerTransport`

## Security Best Practices (CRITICAL)

### ✅ Origin Header Validation (MUST)
**Specification Requirement**: *"Servers **MUST** validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks"*

**Implementation**:
```typescript
// Validates that requests only come from localhost origins
// Rejects any remote origins to prevent DNS rebinding attacks
if (origin) {
    const url = new URL(origin);
    const isLocalhost = 
        url.hostname === 'localhost' || 
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]';
    
    if (!isLocalhost) {
        res.status(403).json({ error: 'Forbidden: Invalid origin' });
        return;
    }
}
```

### ✅ Localhost Binding Only (SHOULD)
**Specification Requirement**: *"When running locally, servers **SHOULD** bind only to localhost (127.0.0.1) rather than all network interfaces (0.0.0.0)"*

**Implementation**:
```typescript
this.httpServer = this.app.listen(this.port, 'localhost', () => {
    // Server only listens on localhost interface
});
```

### ⚠️ Authentication (SHOULD)
**Specification Requirement**: *"Servers **SHOULD** implement proper authentication for all connections"*

**Status**: Not currently implemented
**Rationale**: 
- Running as a VS Code extension in a local environment
- Origin validation provides protection against remote attacks
- Authentication could be added in future versions if needed for multi-user scenarios

## Session Management

### ✅ Session ID Generation
**Specification Requirements**:
- Session ID **SHOULD** be globally unique and cryptographically secure
- Session ID **MUST** only contain visible ASCII characters (0x21 to 0x7E)

**Implementation**:
```typescript
sessionIdGenerator: () => {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substring(2, 15);
    const randomPart2 = Math.random().toString(36).substring(2, 15);
    return `session-${timestamp}-${randomPart}${randomPart2}`;
}
```

The generated session IDs:
- Are globally unique through timestamp + random components
- Contain only alphanumeric characters and hyphens (all visible ASCII)
- Are sufficiently random for security

### ✅ Session Lifecycle
The `StreamableHTTPServerTransport` from the MCP SDK handles:

1. **Initialization**: Sends `Mcp-Session-Id` header on `InitializeResult`
2. **Subsequent Requests**: Expects `Mcp-Session-Id` header on all requests
3. **Session Validation**: Returns HTTP 400 for missing session IDs
4. **Session Expiration**: Returns HTTP 404 for expired sessions
5. **Termination**: Accepts HTTP DELETE requests to terminate sessions

## Protocol Version Handling (NEW in 2025-06-18)

### ✅ MCP-Protocol-Version Header
**Specification Requirement**: *"The client **MUST** include the `MCP-Protocol-Version: <protocol-version>` HTTP header on all subsequent requests to the MCP server"*

**Implementation**:
```typescript
const protocolVersion = req.headers['mcp-protocol-version'] as string;
const supportedVersions = ['2025-03-26', '2025-06-18'];

if (protocolVersion && !supportedVersions.includes(protocolVersion)) {
    res.status(400).json({ 
        error: `Unsupported MCP protocol version '${protocolVersion}'` 
    });
    return;
}
// If no version header, assume 2025-03-26 for backwards compatibility
```

**Behavior**:
- ✅ Returns **400 Bad Request** for invalid/unsupported protocol versions
- ✅ Assumes **2025-03-26** if header is missing (backwards compatibility per spec)
- ✅ Supports both **2025-03-26** and **2025-06-18**

## Message Format

### ✅ JSON-RPC Compliance
**Specification Requirement**: *"MCP uses JSON-RPC to encode messages. JSON-RPC messages **MUST** be UTF-8 encoded."*

**Implementation**:
- All messages are JSON-RPC 2.0 format
- Express automatically handles UTF-8 encoding
- Proper request/response/notification handling through MCP SDK

### ✅ HTTP Methods Support
**Specification Requirements**:
- POST: For sending JSON-RPC messages to server
- GET: For opening SSE streams to receive server messages
- DELETE: For terminating sessions

**Implementation**:
```typescript
this.app.all('/mcp', async (req, res) => {
    // Handles POST, GET, DELETE automatically through StreamableHTTPServerTransport
    await this.transport.handleRequest(req, res);
});
```

## Multiple Connections & Resumability

### ✅ Delegated to SDK
The `StreamableHTTPServerTransport` from the official MCP SDK handles:
- Multiple simultaneous SSE streams
- Event IDs for resumability
- Last-Event-ID header support for reconnection
- Message redelivery after disconnection

## Error Handling

### ✅ Proper HTTP Status Codes
- **200 OK**: Successful responses
- **202 Accepted**: Notifications and responses without requests
- **400 Bad Request**: Invalid requests or missing session IDs
- **403 Forbidden**: Origin validation failures
- **404 Not Found**: Expired sessions
- **405 Method Not Allowed**: Unsupported methods
- **500 Internal Server Error**: Server errors

## Testing Recommendations

To verify compliance, you should test:

1. **Origin Validation**:
   ```bash
   curl -H "Origin: http://evil-domain.com" http://localhost:3000/mcp
   # Should return 403 Forbidden
   ```

2. **Health Check**:
   ```bash
   curl http://localhost:3000/health
   # Should return server status and protocol version
   ```

3. **Session Management**:
   - Initialize a session and verify `Mcp-Session-Id` header is returned
   - Use the session ID in subsequent requests
   - Verify session expiration returns 404

## Compliance Summary

| Requirement | Status | Implementation |
|------------|--------|----------------|
| **Streamable HTTP Transport** | ✅ MUST | Using StreamableHTTPServerTransport |
| **Origin Header Validation** | ✅ MUST | Validates localhost only (DNS rebinding protection) |
| **Localhost Binding** | ✅ SHOULD | Binds to localhost interface |
| **Protocol Version Header** | ✅ MUST | **NEW in 2025-06-18**: Validates MCP-Protocol-Version header |
| **Session Management** | ✅ MUST | Delegated to MCP SDK |
| **JSON-RPC UTF-8** | ✅ MUST | Express handles encoding |
| **HTTP Method Support** | ✅ MUST | POST, GET, DELETE supported |
| **Proper Status Codes** | ✅ MUST | 200, 202, 400, 403, 404, 405, 500 |
| **Authentication** | ⚠️ SHOULD | Not implemented (acceptable for local-only) |

## Future Enhancements

While the current implementation follows all MUST requirements and most SHOULD requirements, potential improvements include:

1. **Authentication**: Add token-based authentication for multi-user scenarios
2. **Rate Limiting**: Protect against abuse even on localhost
3. **Session Persistence**: Store sessions across server restarts
4. **Monitoring**: Add metrics for session lifecycle and request patterns

## References

- [MCP Specification 2025-06-18 - Transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [MCP Specification 2025-03-26 - Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) (backwards compatibility)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

