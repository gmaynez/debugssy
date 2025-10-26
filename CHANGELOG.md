# Change Log

All notable changes to the "Debugssy" extension will be documented in this file.

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
- Bug fixes and stability improvements

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

