# Change Log

All notable changes to the "Debugssy" extension will be documented in this file.

## [1.3.0] - 2025-11-02

### Added

**New Language Support**

- Expression validation now supports Go, Rust, Ruby, and PHP
- Language-specific safety checks for file operations, network calls, and system
  commands
- Comprehensive whitelists of safe functions for each new language

**Testing Infrastructure**

- Complete unit test suite with 210 tests covering all major components
- Test coverage reporting with quality thresholds
- New test commands: `npm test`, `npm run test:watch`, `npm run test:ui`,
  `npm run test:coverage`
- Automated coverage checks in CI/CD pipeline

**Code Quality Tools**

- Prettier integration for consistent code formatting across the project
- New format commands: `npm run format` and `npm run format:check`
- Automated formatting checks in all CI/CD workflows

**Monitoring & Diagnostics**

- Server metrics tracking for better diagnostics
- Health monitoring including initialization attempts, successes, and rejections
- Enhanced logging with VS Code's native Log Output Channel (better syntax
  highlighting and timestamps)

### Changed

**Compatibility Updates**

- Minimum VS Code version updated to 1.90.0 (from 1.85.0)
- Node.js 20 compatibility explicitly configured
- Updated all dependencies to latest stable versions

**Development Improvements**

- Enhanced CI/CD workflows with test coverage display
- Improved build configuration for Node 20 compatibility
- Better project organization with updated ignore files
- Standardized code formatting throughout the codebase

**Logging Enhancements**

- Improved logging system using VS Code's LogOutputChannel
- Automatic timestamp and level formatting
- Better readability with syntax highlighting

### Fixed

- Better request handling during server initialization
- Improved error handling and diagnostics
- More reliable cleanup of resources

## [1.2.4] - 2025-11-01

### Security

- Enhanced detection of obfuscated code attempts using bracket notation
- Added detection of character escape sequences (hex, unicode, octal) that could
  hide dangerous operations
- Improved detection of suspicious patterns like string concatenation and
  template literals in bracket notation
- Better validation across all supported languages (C++, C#, Go, Java,
  JavaScript, Python)

### Changed

- More consistent and clear error messages when code validation fails
- Improved security checks for bracket notation in function calls
- Enhanced whitelist checking logic for better security and clarity
- Better support for safe code patterns like lambdas and anonymous functions
  when using whitelisted operations

## [1.2.3] - 2025-11-01

### Added

- Enhanced security validation for safer debugging sessions
- Better handling of multiple simultaneous connection requests
- Support for validating expressions in JavaScript, Python, C#, Java, C++, and
  Go
- Improved code formatting for better maintainability

### Fixed

- Connection issues when multiple clients try to connect at the same time
- Better detection of potentially unsafe code operations
- Improved detection of code that modifies program state

### Changed

- Reorganized security validation code for easier maintenance
- Improved server initialization for more reliable connections
- Better resource cleanup when the server shuts down
- Streamlined how the extension checks for safe vs. unsafe code

## [1.2.2] - 2025-10-31

### Fixed

- Memory leaks that could slow down VS Code over time
- Proper cleanup of resources when stopping the debugger
- Event listeners now properly removed when no longer needed

### Changed

- Improved memory management throughout the extension
- Better cleanup process when shutting down the server

## [1.2.1] - 2025-10-31

### Added

- Centralized logging system for easier troubleshooting
- Extended expression validation to support C#, Java, C++, and Go
- Language-specific safety checks for multiple programming languages
- Safe function lists for each supported language

### Fixed

- Issue where debugger could miss events if starting very quickly
- Race conditions when debugging sessions start rapidly
- Improved reliability when switching between debug states

### Changed

- Standardized configuration values across the extension
- Better error messages throughout the extension
- Improved internal documentation for code validation

## [1.2.0] - 2025-10-30

### Added

**Expression Validation System**

- Smart validation when evaluating code during debugging sessions
- New setting: `debugssy.expressionValidationLevel` with four levels:
  - `strict` - Maximum security, asks permission for most operations
  - `moderate` - Balanced approach, allows safe operations (recommended)
  - `permissive` - Minimal interruptions, only blocks dangerous operations
  - `disabled` - No validation (not recommended)
- User approval prompts when potentially unsafe code is detected
- Whitelist of safe operations for multiple languages:
  - **JavaScript/TypeScript**: Array methods (map, filter, reduce), String
    methods, Object utilities, JSON, Math
  - **Python**: Built-in functions, json, math, datetime modules
  - **Other languages**: Pattern-based validation for Go, Java, C++, C#, Ruby,
    PHP, Rust
- Automatic detection of dangerous operations (file access, system commands,
  network calls)

**Security Enhancements**

- Multi-layered security approach to prevent unintended side effects
- Blocks dangerous operations like code evaluation, system calls, and file
  modifications
- Clear explanations when operations require approval
- Security checks happen before code execution

**Better Documentation**

- New `EXPRESSION_VALIDATION_GUIDE.md` with configuration examples
- Clear error messages explaining why validation failed
- Examples of allowed and blocked expressions for each security level

### Changed

- Improved security approach prioritizes validation before execution
- Enhanced server capabilities to support approval workflows
- Updated descriptions to better guide AI assistants

## [1.1.4] - 2025-10-26

### Security

- Added length limit for code expressions to prevent security issues
- New setting: `debugssy.maxExpressionLength` (default: 100 characters, range:
  20-400)
- Security measures work silently to avoid exposing vulnerabilities

## [1.1.3] - 2025-10-25

### Changed

- Minor maintenance updates

## [1.1.2] - 2025

### Changed

- Bug fixes and improvements

## [1.1.0] - 2025

### Added

**Console Output Capture**

- New tool to read console output (stdout, stderr, console.log) during debugging
- Tool to clear console output when needed
- Filter output by type, time, and limit (default: 50 entries)
- Automatically keeps track of the 1000 most recent messages

**MCP Resources Support**

- AI assistants can now discover your debug configurations automatically
- Exposes launch.json via special URL format
- No more guessing which debug configuration to use
- Foundation for accessing other workspace files in the future

**Better Performance**

- Call stacks limited to 20 frames by default (adjustable)
- Console output shows 50 entries by default (up to 1000)
- Clearer warnings about tools that return large amounts of data
- Indicators show when data has been truncated for performance

**Improved AI Assistant Guidance**

- Better instructions for AI assistants on how to use the tools
- Embedded best practices for efficient debugging
- Complete workflows for automated debugging
- Context-aware hints based on automation mode

### Fixed

- Variable scope filtering now works correctly
- Better matching for local variables by function name

### Changed

- Better resource management system
- Enhanced server capabilities
- Improved tool descriptions for AI assistants
- Consistent timeout settings

## [1.0.1] - 2024

### Fixed

- Extension packaging issue that prevented the MCP server from starting

## [1.0.0] - 2024

### Added

- Initial release
- MCP server for VS Code debugging
- Breakpoint management
- Debug control (start, stop, continue)
- Variable inspection
- Two automation modes: assisted (user controls) and full (AI controls)

---

**Full Changelog**: https://github.com/gmaynez/debugssy/releases
