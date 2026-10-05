# Security Policy

## Scope

This is a personal to-do list application. Security issues that fall in scope are
those that affect the application's own behaviour, its users, or the integrity of
data it manages.

## Trust boundaries

- The domain model in `src/` treats all external input (titles, IDs, persisted
  state) as untrusted.
- No secrets belong in the repository. `.env` holds secrets only and is gitignored.
- CI runs with `contents: read` and receives no secrets on PR-triggered runs.

## Reporting a vulnerability

Report suspected vulnerabilities privately via GitHub's private vulnerability
reporting:

<https://github.com/shashanihumanth/to-do-list/security/advisories/new>

Do not open a public issue or pull request describing an undisclosed vulnerability,
and do not include reproduction detail in public commits or comments. A report
should describe the affected area, the impact, and (if available) reproduction
steps. Maintainers will acknowledge and coordinate a fix and disclosure.
