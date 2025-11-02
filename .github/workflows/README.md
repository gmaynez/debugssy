# GitHub Actions Workflows

Quick reference for Debugssy's CI/CD workflows.

---

## 📦 `publish.yml` - Publish Extension

**Triggers:**
- Version tags `v*` (e.g., `v1.0.0`) **on main branch only**
- Manual dispatch from GitHub Actions UI

**What it does:**
1. Verifies tag is on `main` branch
2. Runs linting and type checking
3. **Runs full test suite (210 tests) - Publishing blocked if tests fail!**
4. **Verifies test coverage meets requirements**
5. Builds and packages extension
6. Publishes to **VS Code Marketplace**
7. Publishes to **Open VSX Registry**
8. Creates **GitHub Release** with `.vsix` file attached

**Quality gates:**
- ✅ All tests must pass (210/210)
- ✅ No linting errors
- ✅ Type checking passes
- ✅ Build succeeds

**Required secrets:**
- `VSCE_PAT` - VS Code Marketplace token
- `OVSX_PAT` - Open VSX token
  (GitHub token permissions are requested via `permissions: contents: write` in the workflow.)

**Setup guide:** See [PUBLISHING.md](../../PUBLISHING.md)

---

## 🔄 `ci.yml` - Continuous Integration

**Triggers:**
- Push to `main`, `develop`, `feature/*`, `fix/*`
- Pull requests to `main` or `develop`

**What it does:**
- **Runs 210 unit tests** across all platforms
- Tests on Ubuntu, Windows, macOS
- Tests with Node.js 18 and 20
- Runs linting and type checking
- **Generates test coverage reports** (84%+ coverage)
- Security audit with `npm audit`
- Packages extension

**Test coverage includes:**
- ✅ Security validators (ExpressionValidator, McpRequestValidator)
- ✅ Core business logic (Breakpoints, DebugControl, Inspection)
- ✅ DAP Client (state management, event handling)
- ✅ Configuration management

**No setup needed** - runs automatically on every push/PR

---

## ✅ `pr-validation.yml` - Pull Request Validation

**Triggers:**
- Pull requests opened/updated

**What it does:**
- Validates `package.json`
- Checks version bumps (for PRs to main)
- Detects breaking changes
- **Runs full test suite (210 tests)**
- **Generates and displays coverage report**
- Runs build and lint
- Auto-comments on PR with results

**No setup needed** - runs automatically on PRs

---

## 🚀 Quick Commands

### Run Tests Locally

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Publish a New Version

```bash
# 1. Bump version (creates tag)
npm version patch  # or: minor, major

# 2. Push with tags
git push origin main --tags

# 3. GitHub Actions automatically publishes!
```

### Build Locally (No Publishing)

```bash
# Regular push - NO publishing
git push origin main

# Build and test locally
npm run compile
npm run package
code --install-extension debugssy-X.X.X.vsix
```

---

## 🌿 Branch Strategy

**Current:** Working on `main` branch

**Future (when ready):**
- `main` - Production releases only (tagged)
- `develop` - Active development
- `feature/*` - Feature branches

**Workflow:**
1. Work in `develop`
2. Merge to `main` when ready to release
3. Tag on `main` to publish

---

## 📋 What Gets Published

When you push a tag to `main`:

| Destination | URL |
|-------------|-----|
| VS Code Marketplace | `marketplace.visualstudio.com/items?itemName=gamag.debugssy` |
| Open VSX Registry | `open-vsx.org/extension/gamag/debugssy` |
| GitHub Releases | Includes `.vsix` file for direct download |

---

## 📚 Documentation

- **[PUBLISHING.md](../../PUBLISHING.md)** - Complete setup guide (tokens, publisher accounts)
- **[GITHUB_RELEASE_GUIDE.md](../../GITHUB_RELEASE_GUIDE.md)** - How GitHub Releases work
- **[BUILD_GUIDE.md](../../BUILD_GUIDE.md)** - Build locally without publishing
- **[CI_CD_SETUP_SUMMARY.md](../../CI_CD_SETUP_SUMMARY.md)** - Overview of CI/CD setup

---

## 🔧 Version Numbering

Follow [Semantic Versioning](https://semver.org/):

```bash
npm version patch   # 1.0.0 → 1.0.1 (bug fixes)
npm version minor   # 1.0.0 → 1.1.0 (new features)
npm version major   # 1.0.0 → 2.0.0 (breaking changes)
```

---

## ⚠️ Important Notes

- ✅ **Tags must be on `main` branch** - workflow will fail if tag is from `develop` or feature branches
- ✅ **Regular pushes don't publish** - only tags trigger publishing
- ✅ **Can't publish same version twice** - bump version for each release
- ✅ **CI runs on every push** - testing happens automatically

---

## 🐛 Troubleshooting

**"VSCE_PAT is not valid"**  
→ Check token hasn't expired, regenerate if needed

**"Publisher not found"**  
→ Create publisher account, update `package.json`

**"Tag must be created from main branch"**  
→ Merge to `main` first, then create tag

**"Version already exists"**  
→ Bump version with `npm version patch/minor/major`

**"GitHub release failed with status: 403"**  
→ Ensure the workflow includes `permissions: contents: write` and uses `softprops/action-gh-release@v2`.

For more troubleshooting, see [PUBLISHING.md](../../PUBLISHING.md)

---

## 📊 Workflow Status

View workflow runs: [Actions Tab](../../actions)

Add badges to README:
```markdown
[![CI](https://github.com/yourusername/debugssy/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/debugssy/actions/workflows/ci.yml)
[![Publish](https://github.com/yourusername/debugssy/actions/workflows/publish.yml/badge.svg)](https://github.com/yourusername/debugssy/actions/workflows/publish.yml)
```
