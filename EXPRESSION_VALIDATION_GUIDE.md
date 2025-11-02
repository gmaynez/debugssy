# Expression Validation Guide

> **Control which expressions your AI can evaluate automatically during
> debugging**

This guide explains how Debugssy validates expressions for security while
allowing flexibility through user approval.

---

## 📋 Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Examples](#examples)
- [FAQ](#frequently-asked-questions)
- [Quick Start](#quick-start)

---

## Overview

Debugssy validates expressions before executing them via the
`evaluate_expression` tool. This provides security to prevent unintended side
effects while maintaining flexibility through user approval when needed.

## How It Works

### 1. Automatic Validation

When an expression is submitted to `evaluate_expression`, it's automatically
validated using **whitelists of known-safe functions** combined with
pattern-based validation:

**✅ Allowed automatically (safe operations):**

**Basic Operations:**

- Variable access: `x`, `myVariable`
- Property access: `obj.prop`, `obj['key']`, `array[0]`
- Arithmetic: `x + y`, `count * 2`
- Comparisons: `x > 10`, `name === "test"`
- Logical operators: `x && y`, `!flag`
- Ternary: `x ? y : z`
- Literals: `123`, `"string"`, `true`, `null`

**JavaScript/TypeScript - Whitelisted Safe Functions:**

- **Array methods**: `filter()`, `map()`, `reduce()`, `find()`, `some()`,
  `every()`, `includes()`, `slice()`, `concat()`, `join()`, `flat()`,
  `flatMap()`, etc.
- **String methods**: `toLowerCase()`, `toUpperCase()`, `trim()`, `split()`,
  `charAt()`, `substring()`, `includes()`, `startsWith()`, `endsWith()`, etc.
- **Object utilities**: `Object.keys()`, `Object.values()`, `Object.entries()`,
  `Object.fromEntries()`, `Object.is()`, etc.
- **JSON methods**: `JSON.stringify()`, `JSON.parse()`
- **Math methods**: `Math.abs()`, `Math.max()`, `Math.min()`, `Math.floor()`,
  `Math.ceil()`, etc. (all Math methods)
- **Number methods**: `toFixed()`, `toPrecision()`, `toExponential()`
- **Date getters**: `getDate()`, `getHours()`, `getTime()`, `toISOString()`,
  etc.
- **Type checks**: `Array.isArray()`, `Number.isInteger()`, `Number.isNaN()`

**Python - Whitelisted Safe Functions:**

- **List methods**: `count()`, `index()`, `copy()`
- **String methods**: `lower()`, `upper()`, `strip()`, `split()`, `join()`,
  `replace()`, `find()`, `startswith()`, `endswith()`, etc.
- **Dict methods**: `get()`, `keys()`, `values()`, `items()`, `copy()`
- **Set methods**: `copy()`, `union()`, `intersection()`, `difference()`
- **Built-ins**: `len()`, `type()`, `str()`, `int()`, `float()`, `abs()`,
  `max()`, `min()`, `sum()`, `sorted()`, `filter()`, `map()`, etc.
- **JSON methods**: `json.dumps()`, `json.loads()`
- **Math methods**: `math.sqrt()`, `math.ceil()`, `math.floor()`, etc. (all math
  module functions)

**⚠️ Blocked (requires user approval):**

- 🔴 **HIGH RISK**:
  - **Mutation methods**: `push()`, `pop()`, `splice()`, `sort()`, `reverse()`
    (JS), `append()`, `extend()`, `remove()` (Python)
  - **Assignment operators**: `x = 5`, `obj.prop = value`
  - **Compound assignments**: `x += 1`, `count *= 2`
  - **Increment/decrement**: `x++`, `--count`
  - **Code generation**: `eval()`, `Function()` (JS), `eval()`, `exec()`
    (Python)
- 🟡 **MEDIUM RISK**:
  - **User-defined functions**: `myFunction()`, `obj.customMethod()` (not in
    whitelist)
  - **Bitwise operators**: `x & y`, `flags | mask`
  - **Anonymous functions**: `() => {}`, `lambda x: x`

### 2. Language Support

Debugssy automatically detects your programming language and applies appropriate
validation:

**JavaScript/TypeScript**

- Comprehensive whitelist of safe Array, String, Object, Math, and JSON methods
- Blocks mutation methods and code execution (`eval()`, `Function()`)

**Python**

- Comprehensive whitelist of safe built-ins and standard library functions
- Blocks mutation methods and code execution (`eval()`, `exec()`)

**Other Languages** (Go, Java, C++, C#, Ruby, PHP, Rust, etc.)

- Smart generic validation using common patterns
- Many safe functions work across languages (filtering, mapping, serialization)

### 3. MCP Elicitation (User Approval)

When validation fails, Debugssy uses MCP's elicitation feature to request user
approval:

```
🔴 HIGH RISK: Expression validation failed

Expression: `myArray.push(item)`

Reason: Potential side effect: push() modifies state

⚠️ This expression may have side effects or modify program state. Evaluating it could:
- Change variable values
- Execute functions with side effects
- Modify application state
- Cause unexpected behavior

Do you want to evaluate this expression anyway?

[ ] I understand the risks
[Approve] [Decline] [Cancel]
```

**User Actions:**

- **Approve**: Expression is executed with a warning in the result
- **Decline**: Expression is blocked with explanation
- **Cancel**: Operation is cancelled

---

## Configuration

### Settings

**`debugssy.expressionValidationLevel`** (default: `moderate`)

- Validation strictness level using threshold-based logic (like log levels)
- Options: `strict`, `moderate`, `permissive`, `disabled`

**`debugssy.maxExpressionLength`** (default: `100`, range: `20-400`)

- Maximum expression length (secondary defense against prompt injection)
- Validation happens first, then length check

### Validation Levels (Threshold-Based)

| Level           | CRITICAL  | HIGH      | MEDIUM    | LOW       | SAFE     | Use Case                        |
| --------------- | --------- | --------- | --------- | --------- | -------- | ------------------------------- |
| **strict**      | ⚠️ Elicit | ⚠️ Elicit | ⚠️ Elicit | ⚠️ Elicit | ✅ Allow | Maximum security, production    |
| **moderate** ⭐ | ⚠️ Elicit | ⚠️ Elicit | ⚠️ Elicit | ✅ Allow  | ✅ Allow | **Recommended balance**         |
| **permissive**  | ⚠️ Elicit | ⚠️ Elicit | ✅ Allow  | ✅ Allow  | ✅ Allow | Trusted env, active debugging   |
| **disabled**    | ✅ Allow  | ✅ Allow  | ✅ Allow  | ✅ Allow  | ✅ Allow | No protection (not recommended) |

### Risk Levels

**🔴 CRITICAL - System Operations**

- File system: `fs.unlinkSync()`, `fs.writeFile()`
- Process execution: `child_process.exec()`, `process.exit()`
- Network: `fetch()`, `axios.post()`
- Impact: Can damage system, delete files, run commands

**🟡 HIGH - State Mutations**

- Array mutations: `push()`, `splice()`, `sort()`
- Assignments: `x = 5`, `obj.prop = value`
- Code execution: `eval()`, `exec()`
- Impact: Changes application state

**🟠 MEDIUM - Unknown Functions**

- User-defined functions: `calculateTotal()`, `processData()`
- Custom methods: `obj.customMethod()`
- Impact: Uncertain, potentially side effects

**🟢 LOW - Getter Patterns**

- Getter methods: `getName()`, `isValid()`, `hasProperty()`
- Read-only operations: `getCompletionRate()`, `canAccess()`
- Impact: Likely safe, minimal side effects

**✅ SAFE - Whitelisted**

- Built-in functions: `filter()`, `map()`, `Object.keys()`
- Math operations: `Math.floor()`, `Math.max()`
- Impact: Proven safe, no side effects

### Recommended Configurations

**Strict (Maximum Security):**

```json
{
  "debugssy.expressionValidationLevel": "strict",
  "debugssy.maxExpressionLength": 100
}
```

Use for: Production debugging, untrusted AI workflows

**Moderate (Recommended Default):**

```json
{
  "debugssy.expressionValidationLevel": "moderate",
  "debugssy.maxExpressionLength": 100
}
```

Use for: Most debugging scenarios, balanced security/convenience

**Permissive (Minimal Security):**

```json
{
  "debugssy.expressionValidationLevel": "permissive",
  "debugssy.maxExpressionLength": 200
}
```

Use for: Trusted environments, rapid debugging sessions

**Disabled (No Security):**

```json
{
  "debugssy.expressionValidationLevel": "disabled",
  "debugssy.maxExpressionLength": 200
}
```

Use for: Fully trusted AI, maximum automation (⚠️ not recommended)

---

## Examples

### Example 1: Safe Property Access (Auto-Allowed)

**Input:**

```javascript
user.name;
```

**Result:** ✅ Executes immediately without user prompt

---

### Example 2: Safe Built-in Function (Auto-Allowed)

**Input:**

```javascript
items.filter((x) => x.active);
```

**Result:** ✅ Executes immediately - `filter()` is whitelisted as safe

---

### Example 3: Safe Object Utility (Auto-Allowed)

**Input:**

```javascript
Object.keys(user);
```

**Result:** ✅ Executes immediately - `Object.keys()` is whitelisted as safe

---

### Example 4: Safe JSON Serialization (Auto-Allowed)

**Input:**

```javascript
JSON.stringify(data);
```

**Result:** ✅ Executes immediately - `JSON.stringify()` is whitelisted as safe

---

### Example 5: Mutation Method (User Approval Required)

**Input:**

```javascript
items.push(newItem);
```

**Result:** ⚠️ Validation fails → User sees elicitation prompt → User decides

**If approved:**

```json
{
  "success": true,
  "data": {
    "expression": "items.push(newItem)",
    "result": "3",
    "type": "number"
  },
  "_warning": "Expression executed with user approval despite validation failure"
}
```

**If declined:**

```json
{
  "success": false,
  "error": "Expression validation failed: Potential side effect: push() modifies state. User declined to proceed."
}
```

---

### Example 6: Complex Safe Expression with Functions

**Input:**

```python
len([x for x in items if x > 10])
```

**Result:** ✅ Executes immediately - `len()` is whitelisted as safe

---

### Example 7: User-Defined Function (User Approval Required)

**Input:**

```javascript
calculateTotal();
```

**Result:** ⚠️ User approval required - not a whitelisted built-in function

---

### Example 8: Assignment (Blocked)

**Input:**

```javascript
count = 0;
```

**Result:** ⚠️ User approval required (assignment operator)

---

## Frequently Asked Questions

### What if my safe function isn't whitelisted?

User-defined functions aren't automatically allowed for security. You can:

1. **Approve via prompt**: Click "Approve" when the AI asks to use it
2. **Lower validation level**: Set to `permissive` in settings to allow more
   functions
3. **Disable validation**: Set to `disabled` for fully trusted environments (not
   recommended)

### Can I add my own functions to the whitelist?

Not currently. The built-in whitelist includes 70+ JavaScript methods and 50+
Python built-ins that are proven safe. For custom functions, use the approval
workflow or adjust validation levels.

### Does validation work with all programming languages?

Yes! Debugssy validates expressions for JavaScript, TypeScript, Python, Go,
Java, C++, C#, Ruby, PHP, Rust, and more. Common safe functions work across
languages.

---

## Quick Start

### Changing Validation Level

**VS Code Settings UI:**

1. Open Settings (`Ctrl+,` / `Cmd+,`)
2. Search for "debugssy expression"
3. Select your preferred validation level

**settings.json:**

```json
{
  "debugssy.expressionValidationLevel": "moderate" // strict, moderate, permissive, or disabled
}
```

### Testing Validation

Start a debug session and ask your AI to evaluate expressions:

| Expression          | Expected Behavior                          |
| ------------------- | ------------------------------------------ |
| `user.name`         | ✅ Runs immediately (safe property access) |
| `Object.keys(data)` | ✅ Runs immediately (whitelisted function) |
| `items.push(x)`     | ⚠️ Asks approval (mutation method)         |
| `x = 5`             | ⚠️ Asks approval (assignment operator)     |

---

## Related Documentation

- [ALLOWLIST_GUIDE.md](./ALLOWLIST_GUIDE.md) - MCP client allowlist
  configuration
- [MCP_COMPLIANCE.md](./MCP_COMPLIANCE.md) - Security implementation details
- [README.md](./README.md) - Complete tool documentation
