## Summary
<!-- Brief: What changed and why? -->

Fixes #

## What changed
<!-- Key changes - keep it scannable -->

- 

## Type
<!-- Pick one -->
- [ ] 🐛 Bug fix
- [ ] ✨ Feature
- [ ] 💥 Breaking change
- [ ] 🔧 Maintenance (refactor, deps, docs, config)

## Verification
<!-- Check what applies -->

- [ ] `npm run package` builds without errors
- [ ] Tested in VS Code Extension Development Host
- [ ] Tested with MCP client (if functionality changed)

<details>
<summary>📋 Additional checks (expand if needed)</summary>

### For tool/schema changes
- [ ] Schema exported from `routing/schemas/index.ts`
- [ ] Zod validator added to `Validators` object
- [ ] Handler registered in `ToolRouter`

### For config changes
- [ ] `package.json` contributes.configuration updated
- [ ] `constants.ts` limits match `Config.ts` validation

### For code with event listeners
- [ ] Added to `disposables` array for cleanup

### For user-facing changes
- [ ] CHANGELOG.md updated
- [ ] README updated (if settings/behavior changed)

</details>

## Notes for reviewers
<!-- Optional: anything reviewers should know -->
