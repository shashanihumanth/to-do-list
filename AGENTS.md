# To-Do List — Development Guide

A personal to-do list application. Owned and run by Humanth Shashani (@shashanihumanth).

## Invariants

- Types are the contract: every domain concept is a typed value in `src/`, never an ad-hoc object literal.
- Tests mirror the source tree and run through one entrypoint (`scripts/run_tests.sh`); CI runs nothing else.
- One logical change per PR; Conventional Commit title.

## What we want / don't want

- Want: small, pure, typed functions for the domain model.
- Want: tests that assert behaviour, not implementation text.
- Want: deterministic, credential-free test runs.
- Don't want: framework lock-in in the core model — `src/` stays free of UI and framework concerns.
- Don't want: change-detector tests (hard-coded version numbers, model lists, or source text).
- Don't want: god files — split past ~2,000 lines.

## Conventions no config states

- The filesystem is canonical: directory layout, scripts, and counts come from the tree, not from prose.
- Moving a symbol fixes its docs and `AGENTS.md` references in the same PR.
- `.env` holds secrets only; behaviour settings live in config files.

## Routing — working in X → read X/AGENTS.md

| Area | Read | Covers |
| ---- | ---- | ------ |
| (none yet — single package) | — | — |

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings; priority (`P0`–`P4`) and `area/<name>` axes also apply. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
