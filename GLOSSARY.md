# To-Do List

A card-based to-do app: cards group tasks and link into a dependency graph; a parent completes only when its children do.

## Language

**Document**
The versioned whole — every card and edge together — that is persisted, exported, and imported. User-facing copy calls it the "board".
_Avoid_: state, store, model

**Card**
A top-level container that groups related tasks and links to other cards in the dependency graph.
_Avoid_: list, board, note

**Task**
A single to-do item within a card. A task may nest sub-tasks to unlimited depth.
_Avoid_: item, entry, todo

**Sub-task**
A task nested under another task. "Sub-task" names the relationship, not a distinct type — a sub-task is still a task.
_Avoid_: child task, check item

**Leaf task**
A task with no sub-tasks. A leaf task is completed directly; a task with sub-tasks completes only when they all do.
_Avoid_: terminal task, atomic task

**Complete**
The sole completion state of a task or card. A task is complete only when its sub-tasks are; a card is complete only when its tasks are.
_Avoid_: done, finished, resolved

**Normalized title**
The canonical form of a task title — whitespace trimmed, case folded, Unicode NFC — used as the duplicate key among sibling tasks (tasks under the same parent).
_Avoid_: canonical title, slug

**Edge**
A directed link between two cards, pointing in flow order. In "A → B", A is the prerequisite and B is the dependent: B cannot start until A is complete. Blocking is transitive.
_Avoid_: connection, arrow, link

**Prerequisite**
The card an edge points from — it must complete before the edge's target can start.
_Avoid_: blocker, predecessor, upstream

**Dependent**
The card an edge points to — it waits on its prerequisite and cannot start until the prerequisite completes.
_Avoid_: downstream, successor, child

**Blocked**
The derived state of a card that cannot start because one of its prerequisites (directly or transitively) is incomplete. Not a stored state — it follows from the edges.
_Avoid_: locked, pending, on-hold
