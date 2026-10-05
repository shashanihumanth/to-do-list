# Deferred (Tier 2)

Items intentionally not built on day one. Adopt each deliberately when its trigger fires.

| Item | Trigger |
| ---- | ------- |
| Path-lane CI classifier | CI exceeds ~5 minutes |
| Label-gated e2e lanes | A slow, separate e2e suite becomes necessary |
| Supply-chain scan | First third-party runtime dependency beyond dev tooling |
| Lockfile-diff PR comment | Dependency updates become frequent or contentious |
| Contributor-attribution check | First external (non-owner) PR |
| Live CI review comment | CI feedback on PRs needs to be richer than a check mark |
| Release orchestrator | Releases need automation beyond manual tag + notes |
| Dependency quarantine windows (`exclude-newer` / min-release-age) | Supply-chain risk becomes a concern |
| Triage bot | Issue volume exceeds manual triage capacity |

## Deferred items needing a human

| Item | Note |
| ---- | ---- |
| GitHub ruleset (code-owner review, required checks, force-push block) | Applied via `/wizard` or `gh api`; solo repos add the owner as a bypass actor since authors cannot self-approve |
| Private vulnerability reporting + secret scanning (push protection) + Dependabot security updates | Repository security settings, on by policy |
