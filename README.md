# To-Do List

A personal **card-based to-do app**. Cards group tasks, tasks nest into unlimited sub-tasks, and cards link into a flow-ordered dependency graph — a card cannot start until its prerequisites finish.

![CI](https://github.com/shashanihumanth/to-do-list/actions/workflows/ci.yaml/badge.svg)

## Features

- **Cards** group related tasks; **tasks** nest into unlimited **sub-tasks**.
- **Flow-ordered dependency graph** — connect cards with directed edges (`A → B` = finish A, then start B). A card whose prerequisite is incomplete is **blocked** (read-only) until it completes, transitively.
- **Honest completion** — a parent completes only when everything beneath it does; an empty card is never "done".
- **No duplicates** — a task matching a sibling (case- and whitespace-insensitively) is rejected.
- **Pastel light/dark theme** with a persisted toggle, and **frequency-gated, reduced-motion-aware animations**.
- **Local-only** — persists to the browser, with JSON export/import.

## The model in four invariants

The whole domain is a single pure reducer; these four rules are the contract, pinned by tests:

1. **Hierarchy completion** — a task completes only when its sub-tasks do; a card only when its tasks do.
2. **Transitive blocking + full lock** — a card is blocked while any prerequisite (directly or transitively) is incomplete, and a blocked card rejects every mutation.
3. **Sibling uniqueness** — no two tasks under the same parent share a normalized title.
4. **Acyclicity** — a dependency cycle (including a self-loop) is rejected.

## Run it

```bash
npm install
npx tsc                         # build dist/ — the demo imports the compiled domain
python3 -m http.server 8000     # serve the repo root
```

Open <http://127.0.0.1:8000/demo/>. Reset state with `localStorage.clear()` in the console.

## Develop

```bash
npm test          # vitest through scripts/run_tests.sh
npm run typecheck # tsc --noEmit
```

Tests mirror the source tree. `src/` is the pure domain seam; `demo/index.html` (the UI) and `src/storage.ts` (persistence) are thin adapters over it.

## Structure

```
src/domain.ts     the model: types, reducer commands, derived queries, invariants
src/storage.ts    serialize/deserialize + import validation
demo/index.html   the single-file UI (no framework)
tests/            mirrors src/
docs/             PRD, ADRs, verification
GLOSSARY.md       the canonical domain vocabulary
```

## Docs

- [GLOSSARY.md](GLOSSARY.md) — canonical domain terms.
- [docs/adr/](docs/adr/) — architecture decisions (two types; start-gate edges).
- [docs/PRD.md](docs/PRD.md) — the product requirements.
