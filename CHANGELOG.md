# Change Log

All notable changes to the "Debugssy" extension will be documented in this file.

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
