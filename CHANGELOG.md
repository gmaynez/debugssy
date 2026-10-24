# Change Log

All notable changes to the "Debugssy" extension will be documented in this file.

## [Unreleased]

### Security

- Closed expression-validation bypasses involving parenthesized, optional, and
  spaced-bracket invocation syntax, Ruby/PHP command execution, synchronous Node
  filesystem calls, and ordinary Node HTTP requests.
- Persistent breakpoint expressions now retain conservative language-specific
  danger checks in every validation mode. Mutating Go helpers, Ruby block-form
  mutations, and C# `Clear()` require approval.
- Updated `body-parser` to 2.4.0 to resolve the compressed-body
  denial-of-service advisory.

### Fixed

- Invalid settings now fall back individually instead of resetting valid
  settings, including an explicitly disabled MCP server. Server startup,
  shutdown, restart, and rapid configuration changes clean up and converge
  reliably.
- DAP inspection rejects stale execution-generation results, reports adapter
  failures accurately, marks cached stacks as stale, isolates breakpoint hit
  history by session, and avoids unnecessary stack lookup for explicit frames.
- MCP HTTP errors now use valid JSON-RPC error objects. Tool failures preserve
  error codes and `isError`, and cancellation cleans up breakpoint waits.
- `start_debugging` rejects unknown workspaces and malformed configuration
  fields. Console output is bounded by entry size as well as entry count.
- Completion watchers no longer accumulate listeners or retain removed roots.

### Changed

- File path completions now return absolute paths accepted directly by
  breakpoint tools.
- Coverage includes every production source file, with global and critical
  per-file thresholds. Release verification includes production audits,
  tag/package/changelog consistency checks, Node 24, and mutation testing.
- Updated Stryker to 10.1.1 for Vitest 5-compatible mutation runs.

## [1.7.0] - 2026-10-22

### Changed

- **Requires VS Code 1.128.0 or later**, up from 1.105.0.
- Clearer setup instructions for each AI client, including Claude Code, with
  updated privacy and security guidance.

### Added

- Approve an expression once or for the current debug session. Session approvals
  expire when the session ends.
- Clearer tool labels and approval information in compatible AI clients.

### Security

- Stronger expression checks, including breakpoint conditions and logpoints.
  Some expressions now require approval even in permissive mode.
- Breakpoint approvals cover repeated use across debug sessions. Evaluation
  approvals stay within their original session and do not approve breakpoints.

### Fixed

- More reliable inspection after manual steps and when using multiple threads or
  debug sessions. Breakpoint waits now end promptly when a session stops.
- Invalid connection requests no longer interrupt the active AI client.

## [1.6.1] - 2026-05-31

### Security

- Resolved all `npm audit` advisories (`fast-uri`, `ip-address`, `qs`,
  `brace-expansion`, `tmp`, `uuid`). Pinned `qs` via `overrides` to `^6.15.2` to
  work around Stryker's nested `typed-rest-client@2.3.1` hard-pin.

### Fixed

- ToolRouter silently dropped validated arguments in 12 of 20 tool handlers;
  routing now consistently forwards all validated arguments.

### Changed

- Updated direct dependencies to latest (TypeScript 6.0.3, ESLint 10.4.1, Vitest
  4.1.7, Zod 4.4.3, Hono 4.12.23, MCP SDK 1.29.0, and others). `@types/vscode`
  and `@types/node` remain pinned to the minimum supported VS Code version.
- Added `ignoreDeprecations: "6.0"` to `tsconfig.json` for TypeScript 6.0
  compatibility.
- Strengthened test assertions for better mutation-test resilience.

## [1.6.0] - 2026-03-31

### Added

- **Zero-config MCP registration for VS Code and Cursor.** The extension now
  registers its MCP server automatically — no manual `mcp.json` or
  `settings.json` edits required. VS Code discovers the server via the
  `McpHttpServerDefinition` provider API; Cursor discovers it via
  `vscode.cursor.mcp.registerServer`. Other clients (Claude Desktop, Claude
  Code, OpenCode, etc.) still use manual config as before.
- Server definitions update dynamically when the port changes or the server is
  stopped/restarted — the host IDE reconnects automatically.

### Changed

- Minimum VS Code version bumped from 1.101.0 to **1.105.0** to enable the MCP
  server definition provider API, autostart, and `when` clause support on the
  `mcpServerDefinitionProviders` contribution point.

### Breaking

- **Duplicate MCP server entries.** If you previously added a manual
  `"debugssy"` entry in your VS Code `settings.json`
  (`github.copilot.chat.mcp.servers`) or Cursor `mcp.json`, the extension will
  now also register one automatically. This may result in two "debugssy" servers
  appearing in your MCP tool list. **Fix:** Remove the manual entry and let the
  extension handle registration.

## [1.5.3] - 2026-02-26

### Security

- `eval` and `Function` blocking now covers all indirect invocation forms: comma
  operator `(0, eval)()`, array extraction `[eval][0]()`, and tagged template
  syntax `` eval`code` ``
- Unicode normalization (NFKC) applied before expression validation to
  neutralize fullwidth and compatibility look-alike character attacks

### Changed

- Updated direct dependencies: MCP SDK to 1.27.1, hono to 4.12.2, and tooling
  updates (`@types/vscode`, `@types/node`, eslint, esbuild, ovsx)

## [1.5.2] - 2026-02-03

### Security

- Pin patched transitive dependencies via npm overrides to address recent
  advisories.

### Changed

- Updated direct dependencies (including MCP SDK + tooling) to latest compatible
  versions and refreshed lockfile.

## [1.5.1] - 2026-01-25

### Fixed

- MCP reconnection now works automatically after config changes or extension
  toggles. Previously required manually running "Debugssy: Restart Server".

### Changed

- Session replacement: new MCP client connections now take over from stale
  sessions (single client at a time by design)

## [1.5.0] - 2026-01-16

### Added

- New setting `debugssy.mcp.minifyResponses` to reduce JSON payload sizes
  (enabled by default)

### Changed

- Enhanced MCP request handling with better error responses
- Improved type safety in DAP message handling
- Updated MCP SDK to 1.25.2 and other dependencies

### Fixed

- Memory leak from configuration change listener

## [1.4.6] - 2025-12-05

### Changed

- Lazy initialization for file system watchers for better performance
- Updated MCP protocol version support and enhanced request validation
- Updated MCP SDK to 1.24.3 and Express to 5.2.1
- Improved documentation with reorganized guides

## [1.4.5] - 2025-11-25

### Security

- Enhanced protection against prompt injection attacks
- Improved detection of dangerous operations in C#, Java, and C++
- Added checks for prototype chain manipulation, global object access, and
  string obfuscation
- Removed potentially dangerous string functions from safe lists
- Added SECURITY.md with vulnerability reporting guidelines and best practices

## [1.4.4] - 2025-11-25

### Changed

- Minimum VS Code version updated to 1.101.0 (from 1.90.0)
- Better error messages with specific error codes for easier troubleshooting
- Updated MCP SDK to 1.22.0 and other dependencies

### Fixed

- Improved error handling throughout the extension

## [1.4.3] - 2025-11-17

### Changed

- Stack trace retrieval now limited to essential frames for faster performance
- Variable completions optimized to query only necessary scopes
- Improved marketplace documentation for clarity

### Fixed

- Better timeout handling during breakpoint waits
- Memory leaks from event listeners now properly cleaned up
- More reliable resource cleanup during extension shutdown

## [1.4.2] - 2025-11-11

### Changed

- Updated support information with GitHub Sponsors link in package metadata
- Streamlined documentation for better privacy

## [1.4.1] - 2025-11-10

### Added

- Variable name completions now include runtime values from active debug
  sessions
- Static code analysis fallback when not debugging for better variable
  suggestions
- Smarter variable completion prioritizing symbols from the currently open file

### Fixed

- Memory leak in debug adapter tracker

## [1.4.0] - 2025-11-03

### Added

- File path completions now work in remote environments (SSH, WSL, Codespaces)
- Multi-root workspace support for better file navigation
- Validation messages now show the evaluated expression for better context

### Fixed

- Extension freezing when accessing files on slow or network filesystems

## [1.3.0] - 2025-11-02

### Added

- Expression validation now supports Go, Rust, Ruby, and PHP
- Complete unit test suite with 210 tests and coverage reporting
- Server metrics tracking for better diagnostics
- Enhanced logging with better syntax highlighting and timestamps

### Changed

- Minimum VS Code version updated to 1.90.0 (from 1.85.0)
- Node.js 20 compatibility

## [1.2.4] - 2025-11-01

### Security

- Enhanced detection of obfuscated code attempts using bracket notation
- Added detection of character escape sequences (hex, unicode, octal) that could
  hide dangerous operations

## [1.2.3] - 2025-11-01

### Added

- Support for validating expressions in JavaScript, Python, C#, Java, C++, and
  Go

### Fixed

- Connection issues when multiple clients try to connect at the same time

## [1.2.2] - 2025-10-31

### Fixed

- Memory leaks that could slow down VS Code over time
- Proper cleanup of resources when stopping the debugger

## [1.2.1] - 2025-10-31

### Added

- Extended expression validation to support C#, Java, C++, and Go
- Language-specific safety checks for multiple programming languages

### Fixed

- Race conditions when debugging sessions start rapidly

## [1.2.0] - 2025-10-29

### Added

- Smart validation when evaluating code during debugging sessions
- New setting: `debugssy.expressionValidationLevel` with four levels (strict,
  moderate, permissive, disabled)
- User approval prompts when potentially unsafe code is detected
- Whitelist of safe operations for JavaScript/TypeScript, Python, and other
  languages
- Automatic detection of dangerous operations (file access, system commands,
  network calls)

## [1.1.4] - 2025-10-26

### Security

- Added length limit for code expressions to prevent security issues
- New setting: `debugssy.maxExpressionLength` (default: 100 characters, range:
  20-400)

## [1.1.3] - 2025-10-25

### Changed

- Minor maintenance updates

## [1.1.2] - 2025-10-24

### Changed

- Bug fixes and improvements

## [1.1.0] - 2025-10-23

### Added

- Console output capture (stdout, stderr, console.log)
- AI assistants can now discover debug configurations automatically
- Call stacks limited to 20 frames by default for better performance
- Better instructions for AI assistants

### Fixed

- Variable scope filtering now works correctly

## [1.0.1] - 2025-10-23

### Fixed

- Extension packaging issue that prevented the MCP server from starting

## [1.0.0] - 2025-10-21

### Added

- Initial release
- MCP server for VS Code debugging
- Breakpoint management
- Debug control (start, stop, continue)
- Variable inspection
- Two automation modes: assisted (user controls) and full (AI controls)

---

**Full Changelog**: https://github.com/gmaynez/debugssy/releases
