# Manual verification — spec #3 (Card-Based To-Do App)

How to verify the app by hand, without the CDP harness.

## Run it

```bash
npx tsc                       # build dist/ (the demo imports domain.js + storage.js)
python3 -m http.server 8000   # serve the repo root
```

Open <http://127.0.0.1:8000/demo/>.

Reset state any time with `localStorage.clear()` in the DevTools console, then reload.

## What to check

- **Cards** — add, rename (the "rename" control), and delete a card. Deleting a card that another card depends on is blocked.
- **Tasks** — add (type + Enter, no modal), edit, delete, complete/uncomplete a task.
- **Sub-tasks** — "+ sub" nests; nesting is unlimited and indented. A parent task can't be ticked until its sub-tasks are; the checkbox is disabled on parents. Reorder sub-tasks with ↑/↓ (shown when a parent has more than one).
- **Duplicates** — adding a task whose title (case/whitespace-insensitively) matches a sibling is rejected inline.
- **Dependency graph** — connect two cards with an edge; the arrow points in flow order (A → B = finish A, then start B). A card whose prerequisite is incomplete is blocked (read-only).
- **Blocking** — while a card is blocked, every control on it (and its tasks) is disabled; it unlocks when the prerequisite completes.
- **Views** — the graph shows cards as nodes and edges as arrows left→right; the outline is the list; a control toggles between them.
- **Theme** — Auto/Light/Dark control; Auto follows the system, Light/Dark persist. Pastel colours only.
- **Animation** — complete/add/delete are quick (~140ms); connect-edge, unlock, and theme toggle are standard (~220ms); the view toggle crossfades.
- **Persistence** — changes survive a reload. Export downloads `to-do-list.json`; import replaces the board (and is rejected if the file is malformed, the wrong version, cyclic, or has duplicate sibling titles).

## Theme & reduced motion via DevTools

- **Theme**: DevTools → Rendering → "Emulate CSS media feature `prefers-color-scheme`" → `light`/`dark`, with the control on Auto.
- **Reduced motion**: same panel → "Emulate CSS media feature `prefers-reduced-motion`" → `reduce`; movement should drop while fades remain.
