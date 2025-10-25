# Change Log

All notable changes to the "Debugssy" extension will be documented in this file.

## [1.1.3] - 2025-10-25

### Changed
- Minor version bump for maintenance updates

## [1.1.2] - 2025

### Changed
- Bug fixes and improvements

## [1.1.0] - 2025

## 🎉 New Features

### Console Output Capture
- **`get_console_output`** - Read stdout, stderr, and console.log messages during debugging
- **`clear_console_output`** - Clear the console buffer
- Smart filtering by category, timestamp, and limit (default: 50 entries)
- Automatic buffering up to 1000 most recent entries

### MCP Resources Support
- Exposes debug configurations via `debugssy:///{workspaceName}/launch.json`
- AI assistants can now discover and read launch.json before starting debug sessions
- Eliminates guesswork when calling `start_debugging`
- Foundation for future workspace resources (tasks.json, settings.json)

### Context Usage Optimization
- **Call Stack**: Limited to 20 frames by default (configurable via `maxDepth`)
- **Console Output**: Returns 50 entries by default (max: 1000)
- **Variables**: Fixed scope filtering to use prefix matching
- All verbose tools now include WARNING labels and efficiency hints
- Truncation indicators: `truncated: true`, `totalFrames`, `count` fields

### Enhanced Debugging Prompts
- All workflows now guide LLMs to check MCP resources first
- Embedded best practices for context efficiency
- `auto-debug-session` includes complete resource discovery workflow
- Mode-aware hints (assisted vs full automation)

## 🐛 Bug Fixes

- **Fixed `get_variables` scope filtering**: Now uses prefix matching instead of exact match
  - `scope: "Local"` correctly matches `"Local: functionName"`
  - Case-insensitive filtering

## 📚 Documentation

- Added "Available Resources" section with usage examples
- New "Performance & Context Usage" guide
- Updated all tool examples with optimized defaults
- Enhanced prompt descriptions

## 🔧 Technical Improvements

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

