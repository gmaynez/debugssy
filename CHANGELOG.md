# Change Log

All notable changes to the "Debugssy" extension will be documented in this file.

## [1.2.1] - 2025-10-31

### Added
- Centralized logging system with structured output channel for better debugging and error tracking
- Multi-language support for expression validation extended to C#, Java, C++, and Go
- Language-specific critical operation detection across JavaScript, Python, C++, C#, and Java
- Whitelisting of safe functions and methods for each supported language

### Fixed
- Race condition in DebugControl when extension loads after a debug session has already started
- Race condition in Inspection tool's state checking mechanism by ensuring event listeners are set up before checking execution state
- Improved state transitions to prevent missed events during debugging

### Changed
- Refactored configuration constants for port, timeout, and expression length validation for better maintainability
- Standardized configuration values across the extension using centralized constants
- Replaced console logging with Logger utility across all components (ConfigManager, MCPServer, DAPClient, etc.)
- Enhanced error handling with clearer messages and consistent logging practices
- Improved documentation within ExpressionValidator for detection methods and risk assessment

## [1.2.0] - 2025-10-30

### Added

**Expression Validation System**
- Intelligent expression validation for `evaluate_expression` tool with multi-language support
- New setting: `debugssy.expressionValidationLevel` with four strictness levels:
  - `strict` - Maximum security, only whitelisted functions allowed automatically
  - `moderate` - Recommended balance, whitelisted + common getters allowed (default)
  - `permissive` - Minimal interruptions, only dangerous system operations require approval
  - `disabled` - No validation (not recommended, use only in fully trusted environments)
- MCP elicitation integration for user approval when validation fails
- Comprehensive whitelist of safe built-in functions:
  - **JavaScript/TypeScript**: Array methods (`map`, `filter`, `reduce`), String methods, Object utilities, JSON, Math, Number methods
  - **Python**: Built-in functions, json module, math module, re module, datetime module
  - **Generic validation**: Smart pattern-based validation for Go, Java, C++, C#, Ruby, PHP, Rust, and other languages
- Language-specific detection and validation using debug session context
- Cross-language CRITICAL operation detection (file system, process execution, network operations)

**Security Enhancements**
- Layered defense-in-depth approach to prevent unintended side effects
- Blocks dangerous operations: mutations, assignments, eval/exec, system calls
- User approval workflow with clear risk communication and explanations
- Validation happens before length checks for more precise security

**Developer Experience**
- New comprehensive guide:
  - `EXPRESSION_VALIDATION_GUIDE.md` - User-facing configuration and usage guide
- Clear validation failure messages with specific reasons and risk levels
- Example expressions and patterns for each validation level

### Changed
- Improved security model: validation-first approach (validate → length check → execute)
- Enhanced MCP server capabilities to support expression validation workflows
- Updated tool schemas with validation-aware descriptions
- Configuration schema now includes expression validation level validation


## [1.1.4] - 2025-10-26

### Security
- Added configurable expression length limit for `evaluate_expression` tool to prevent prompt injection attacks
- New setting: `debugssy.maxExpressionLength` (default: 100 characters, range: 20-400)
- Security constraints are enforced but not advertised in tool schemas to avoid giving attackers a blueprint

## [1.1.3] - 2025-10-25

### Changed
- Minor version bump for maintenance updates

## [1.1.2] - 2025

### Changed
- Bug fixes and improvements

## [1.1.0] - 2025

### Added

**Console Output Capture**
- New `get_console_output` tool to read stdout, stderr, and console.log messages during debugging
- New `clear_console_output` tool to clear the console buffer
- Smart filtering by category, timestamp, and limit (default: 50 entries)
- Automatic buffering up to 1000 most recent entries

**MCP Resources Support**
- Exposes debug configurations via `debugssy:///{workspaceName}/launch.json`
- AI assistants can now discover and read launch.json before starting debug sessions
- Eliminates guesswork when calling `start_debugging`
- Foundation for future workspace resources (tasks.json, settings.json)

**Context Usage Optimization**
- Call stack limited to 20 frames by default (configurable via `maxDepth`)
- Console output returns 50 entries by default (max: 1000)
- All verbose tools now include WARNING labels and efficiency hints
- Truncation indicators: `truncated: true`, `totalFrames`, `count` fields

**Enhanced Debugging Prompts**
- All workflows now guide LLMs to check MCP resources first
- Embedded best practices for context efficiency
- `auto-debug-session` includes complete resource discovery workflow
- Mode-aware hints (assisted vs full automation)

### Fixed
- Fixed `get_variables` scope filtering to use prefix matching instead of exact match
- `scope: "Local"` now correctly matches `"Local: functionName"` with case-insensitive filtering

### Changed
- New `ResourceProvider` class for resource management
- MCP server capabilities updated to include resources
- Improved tool schemas with better LLM guidance
- Consistent 3-second timeout for `wait_for_breakpoint`

## [1.0.1] - 2024

### Fixed
- Extension was not properly packaged and MCP server won't start.

## [1.0.0] - 2024

### Added
- Initial release
- MCP server for VS Code debugging
- Breakpoint management tools
- Debug control operations
- Variable inspection capabilities
- Support for assisted and full automation modes

---

**Full Changelog**: https://github.com/gmaynez/debugssy/releases

