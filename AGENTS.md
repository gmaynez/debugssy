# Debugssy - LLM Context

VS Code extension: MCP server exposing DAP (Debug Adapter Protocol) for
AI-assisted debugging. Flow: AI Assistant → MCP Protocol → Debugssy → VS Code
Debug API → Debugger

## Architecture

```
extension.ts → MCPServer.ts → [ToolRouter, PromptHandler, CompletionProvider, ResourceProvider]
                    ↓
              security/ (McpRequestValidator, ExpressionValidator)
                    ↓
              tools/ (Breakpoints, Inspection, DebugControl)
                    ↓
              dap/Client.ts (DAP message interception, state tracking)
```

## File Map

| File                                  | Purpose                            | Modify When             |
| ------------------------------------- | ---------------------------------- | ----------------------- |
| `extension.ts`                        | Entry point, lifecycle, commands   | Adding VS Code commands |
| `MCPServer.ts`                        | HTTP server, MCP SDK, session mgmt | Adding MCP capabilities |
| `Config.ts`                           | Zod-validated settings             | Adding config options   |
| `constants.ts`                        | All magic numbers                  | Adding limits/defaults  |
| `routing/ToolRouter.ts`               | Tool routing, validation           | Adding/modifying tools  |
| `routing/PromptHandler.ts`            | MCP prompts                        | Adding prompts          |
| `routing/CompletionProvider.ts`       | Autocomplete                       | Adding completions      |
| `routing/schemas/*.ts`                | Tool JSON schemas                  | Adding tool parameters  |
| `routing/types/toolArguments.ts`      | Zod validators + TS types          | Adding tool arg types   |
| `security/ExpressionValidator.ts`     | Expression safety                  | Adding language support |
| `security/expression/validators/*.ts` | Per-language validators            | Language-specific rules |
| `tools/Breakpoints.ts`                | Breakpoint ops                     | Breakpoint features     |
| `tools/Inspection.ts`                 | Variable/stack inspection          | Inspection features     |
| `tools/DebugControl.ts`               | Start/stop/step                    | Execution control       |
| `dap/Client.ts`                       | DAP interception, state            | DAP event handling      |
| `errors/index.ts`                     | Custom error types with codes      | Adding new error types  |

## File Dependencies

When modifying, also update:

- `routing/schemas/*.ts` → `routing/types/toolArguments.ts` (add Zod validator)
- `routing/schemas/*.ts` → `routing/schemas/index.ts` (export)
- `tools/*.ts` → `routing/ToolRouter.ts` (register handler)
- `Config.ts` → `package.json` contributes.configuration (schema match)
- `constants.ts` → `Config.ts` (uses constants for validation)
- `security/expression/validators/*.ts` → `ExpressionValidator.ts` (import +
  routing)

## Key Concepts

**Automation Modes:**

- `assisted`: User controls execution (F5, step), AI sets breakpoints + inspects
- `full`: AI controls everything including start/stop/continue

**Tool availability:** `ToolRouter.getToolSchemas()` returns different tools
based on `automationLevel`.

**Expression validation levels:** strict > moderate > permissive > disabled

- Risk levels: critical (system ops) > high (mutations) > medium (unknown
  funcs) > low (getters)

**Expression validation checks (in order):**

1. Comment injection (block `/* */`, line `//`, `#`)
2. Critical operations (fs, process, network - language-specific)
3. Prototype chain (`__proto__`, `.constructor`, `setPrototypeOf`)
4. Global access (`globalThis`, `window`, `global`, `self`)
5. String obfuscation (`fromCharCode`, `atob`, `Buffer.from`)
6. Meta-programming (`Proxy`, `Reflect`, `defineProperty`)
7. Language-specific validation (mutations, eval, etc.)
8. Generic pattern validation (assignments, increments, etc.)

**DAP states:** `not_started` | `running` | `paused` | `terminated`

## Patterns

**Result pattern** - All tools return:

```typescript
{ success: boolean; message?: string; error?: string; data?: any }
```

**Disposable pattern** - Components with listeners:

```typescript
private disposables: vscode.Disposable[] = [];
dispose(): void { this.disposables.forEach(d => d.dispose()); }
```

**Error handling with custom errors:**

```typescript
import { DebugNotActiveError, isDebugssyError, getErrorCode } from '../errors';

// Throwing custom errors
if (!session) {
  throw new DebugNotActiveError('get_variables');
}

// Catching and handling
catch (error: unknown) {
  if (isDebugssyError(error)) {
    return { success: false, error: error.message, code: getErrorCode(error) };
  }
  const msg = error instanceof Error ? error.message : 'Unknown error';
  return { success: false, error: msg };
}
```

**Config access:** Always via `this.configManager.getConfig()`

**Logging:** `Logger.getInstance().info/warn/error/debug()`

## Adding a Tool

1. Schema in `routing/schemas/[category]Schemas.ts`:

```typescript
export const myToolSchema = {
  name: 'my_tool',
  description: '...',
  inputSchema: { type: 'object', properties: {...}, required: [...] }
};
```

2. Zod validator in `routing/types/toolArguments.ts`:

```typescript
export const MyToolArgsSchema = z.object({...});
export type MyToolArgs = z.infer<typeof MyToolArgsSchema>;
// Add to Validators object
```

3. Implementation in `tools/[Category].ts`

4. Register in `ToolRouter.initializeToolHandlers()`:

```typescript
['my_tool', (args) => this.toolRegistry.category.myTool(args)];
```

5. Export from `routing/schemas/index.ts`

## Adding a Language Validator

1. Create `security/expression/validators/[lang].ts`:

```typescript
export function detect[Lang]Critical(expr: string): ValidationResult | null
export function validate[Lang](expr, checkMutations, checkWhitelists, extractCalls): ValidationResult | null
```

2. Add to `ExpressionValidator.ts`:
   - Import functions
   - Add to `detectLanguage()` switch
   - Add to `validateByLanguage()` switch
   - Add to `detectCriticalOperations()` switch

## Constraints (DO NOT BREAK)

1. **Localhost only** - Server binds to localhost, never expose remotely
2. **Origin validation** - McpRequestValidator checks Origin header (DNS
   rebinding protection)
3. **Expression validation** - Never bypass without user's explicit `disabled`
   setting
4. **Zod validation** - All tool inputs validated before processing
5. **Disposable cleanup** - All event listeners must be disposed
6. **Session security** - UUIDs from crypto.randomUUID()
7. **Type version alignment** - Keep `@types/vscode` and `@types/node` aligned
   with minimum supported VS Code version (see `engines.vscode` in package.json)

## Dependency Updates

When updating npm dependencies, these packages are version-locked:

| Package         | Constraint                                                  |
| --------------- | ----------------------------------------------------------- |
| `@types/vscode` | Must match `engines.vscode` (currently ^1.101.0)            |
| `@types/node`   | Must match Node.js bundled in min VS Code (1.101 → Node 22) |

VS Code bundles Electron which includes a specific Node.js version. To find the
Node.js version for a VS Code release:

1. Check VS Code release notes for Electron version
2. Check what Node.js that Electron version bundles
3. Or search: "VS Code [version] Electron Node.js version"

Reference: VS Code 1.101 uses Electron 35.5.1 with Node.js 22.15.1

## Common Mistakes

- Forgetting to export schema from `routing/schemas/index.ts`
- Not adding Zod validator to `Validators` object
- Missing dispose() for event listeners
- Using `any` instead of proper types
- Not handling `error: unknown` properly
- Forgetting to update tool list in both schema and handler

## Config Keys

```
debugssy.mcp.enabled: boolean (default: true)
debugssy.mcp.port: number (default: 3000, range: 1024-65535)
debugssy.automationLevel: "assisted" | "full" (default: "assisted")
debugssy.waitForBreakpointTimeout: number (default: 5000, range: 1000-300000)
debugssy.allowStepOperations: boolean (default: false)
debugssy.maxExpressionLength: number (default: 100, range: 20-400)
debugssy.expressionValidationLevel: "strict" | "moderate" | "permissive" | "disabled"
```

## Commands

```bash
npm run compile      # Build
npm run check-types  # Type check only
npm test             # Run tests
npm run lint         # Lint
npm run package      # Create .vsix
```

## Testing

- Framework: Vitest
- VS Code mocks: `src/__tests__/setup.ts`
- Mock pattern: `vi.fn()` for VS Code APIs

## MCP Endpoints

- `POST /mcp` - MCP protocol
- `GET /mcp` - SSE fallback
- `GET /health` - Server status

## Error Codes

Custom error codes in `errors/index.ts` for programmatic handling:

- `DEBUG_NOT_ACTIVE` - No active debug session
- `BREAKPOINT_NOT_FOUND` - Breakpoint doesn't exist at location
- `EXPRESSION_VALIDATION_FAILED` - Expression security check failed
- `UNKNOWN_TOOL` - Tool name not recognized
- `INVALID_ARGUMENTS` - Zod validation failed
