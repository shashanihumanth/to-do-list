/**
 * The domain model for the card-based to-do app.
 *
 * This is the single pure seam: versioned types, a reducer surface (commands
 * that map a `Document` to a new `Document` or a rejection), and derived
 * queries. UI and storage are thin adapters over this module; it stays free of
 * framework and browser concerns.
 */

/** Reasons a command can be rejected. */
export type DomainError =
  | "card-not-found"
  | "task-not-found"
  | "duplicate-title"
  | "not-leaf-task"
  | "invalid-reorder"
  | "cycle"
  | "duplicate-edge"
  | "edge-not-found"
  | "card-blocked"
  | "card-has-dependents";

/** A result: a value, or the reason it could not be produced. */
export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** The versioned document: cards plus the (future) dependency edges between them. */
export interface Document {
  readonly version: 1;
  readonly cards: readonly Card[];
  readonly edges: readonly Edge[];
}

/** A top-level container of tasks, participating in the dependency graph. */
export interface Card {
  readonly id: string;
  readonly title: string;
  readonly tasks: readonly Task[];
  readonly order: number;
}

/** A single to-do item; sub-tasks nest to unlimited depth. */
export interface Task {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly subtasks: readonly Task[];
}

/** A directed start-gate edge between two cards (A → B: A first, then B). */
export interface Edge {
  readonly prerequisiteId: string;
  readonly dependentId: string;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: DomainError): { ok: false; error: DomainError } => ({ ok: false, error });

const newId = (): string => globalThis.crypto.randomUUID();

/** The empty version-1 document. */
export function createDocument(): Document {
  return { version: 1, cards: [], edges: [] };
}

/**
 * The canonical form of a title: trimmed, case-folded, Unicode NFC.
 *
 * The fold is the simple one JS exposes (`toLowerCase`); full-fold
 * equivalences such as "ß" ⇄ "ss" are deliberately out of scope.
 */
export function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().normalize("NFC");
}

// ---------------------------------------------------------------------------
// Card commands

export function addCard(doc: Document, title: string): Result<Document> {
  const card: Card = { id: newId(), title, tasks: [], order: doc.cards.length };
  return ok({ ...doc, cards: [...doc.cards, card] });
}

export function renameCard(doc: Document, cardId: string, title: string): Result<Document> {
  const index = doc.cards.findIndex((c) => c.id === cardId);
  if (index === -1) return fail("card-not-found");
  if (isCardBlocked(doc, cardId)) return fail("card-blocked");
  const cards = doc.cards.slice();
  cards[index] = { ...doc.cards[index]!, title };
  return ok({ ...doc, cards });
}

export function deleteCard(doc: Document, cardId: string): Result<Document> {
  if (!doc.cards.some((c) => c.id === cardId)) return fail("card-not-found");
  if (isCardBlocked(doc, cardId)) return fail("card-blocked");
  // A card other cards wait on cannot leave the graph, or they would lose a
  // prerequisite; edges into a card that leaves go with it.
  if (doc.edges.some((e) => e.prerequisiteId === cardId)) return fail("card-has-dependents");
  return ok({
    ...doc,
    cards: doc.cards.filter((c) => c.id !== cardId),
    edges: doc.edges.filter((e) => e.dependentId !== cardId),
  });
}

// ---------------------------------------------------------------------------
// Edge commands

/**
 * Link `prerequisiteId` → `dependentId` (the prerequisite first, then the
 * dependent). Rejects an edge between unknown cards, a self-loop, a duplicate,
 * or one that would close a cycle.
 */
export function addEdge(doc: Document, prerequisiteId: string, dependentId: string): Result<Document> {
  const known = (id: string) => doc.cards.some((c) => c.id === id);
  if (!known(prerequisiteId) || !known(dependentId)) return fail("card-not-found");
  if (prerequisiteId === dependentId) return fail("cycle");
  const exists = doc.edges.some(
    (e) => e.prerequisiteId === prerequisiteId && e.dependentId === dependentId,
  );
  if (exists) return fail("duplicate-edge");
  // The new edge closes a cycle when the dependent already reaches the
  // prerequisite, since that path plus the new edge loops back on itself.
  if (reaches(doc, dependentId, prerequisiteId)) return fail("cycle");
  return ok({ ...doc, edges: [...doc.edges, { prerequisiteId, dependentId }] });
}

/** Remove the `prerequisiteId` → `dependentId` edge. */
export function removeEdge(doc: Document, prerequisiteId: string, dependentId: string): Result<Document> {
  const edges = doc.edges.filter(
    (e) => !(e.prerequisiteId === prerequisiteId && e.dependentId === dependentId),
  );
  if (edges.length === doc.edges.length) return fail("edge-not-found");
  return ok({ ...doc, edges });
}

// ---------------------------------------------------------------------------
// Task commands

export function addTask(
  doc: Document,
  cardId: string,
  title: string,
  parentId?: string,
): Result<Document> {
  const cardIndex = doc.cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return fail("card-not-found");
  if (isCardBlocked(doc, cardId)) return fail("card-blocked");
  const card = doc.cards[cardIndex]!;

  if (parentId === undefined) {
    if (hasDuplicateSibling(card.tasks, title)) return fail("duplicate-title");
    const task: Task = { id: newId(), title, completed: false, subtasks: [] };
    return ok(replaceCard(doc, cardIndex, { ...card, tasks: [...card.tasks, task] }));
  }

  const located = locateTask(card.tasks, parentId);
  if (located === null) return fail("task-not-found");
  if (hasDuplicateSibling(located.task.subtasks, title)) return fail("duplicate-title");
  const task: Task = { id: newId(), title, completed: false, subtasks: [] };
  const tasks = updateTask(card.tasks, parentId, (t) => ({ ...t, subtasks: [...t.subtasks, task] }));
  return ok(replaceCard(doc, cardIndex, { ...card, tasks: tasks ?? card.tasks }));
}

export function renameTask(doc: Document, taskId: string, title: string): Result<Document> {
  for (let i = 0; i < doc.cards.length; i++) {
    const card = doc.cards[i]!;
    const located = locateTask(card.tasks, taskId);
    if (located === null) continue;
    if (isCardBlocked(doc, card.id)) return fail("card-blocked");
    if (hasDuplicateSibling(located.siblings, title, taskId)) return fail("duplicate-title");
    const tasks = updateTask(card.tasks, taskId, (t) => ({ ...t, title }));
    return ok(replaceCard(doc, i, { ...card, tasks: tasks ?? card.tasks }));
  }
  return fail("task-not-found");
}

export function deleteTask(doc: Document, taskId: string): Result<Document> {
  for (let i = 0; i < doc.cards.length; i++) {
    const card = doc.cards[i]!;
    if (locateTask(card.tasks, taskId) === null) continue;
    if (isCardBlocked(doc, card.id)) return fail("card-blocked");
    const tasks = updateTask(card.tasks, taskId, () => null)!;
    return ok(replaceCard(doc, i, { ...card, tasks }));
  }
  return fail("task-not-found");
}

export function toggleTaskComplete(doc: Document, taskId: string): Result<Document> {
  for (let i = 0; i < doc.cards.length; i++) {
    const card = doc.cards[i]!;
    const located = locateTask(card.tasks, taskId);
    if (located === null) continue;
    if (isCardBlocked(doc, card.id)) return fail("card-blocked");
    if (located.task.subtasks.length > 0) return fail("not-leaf-task");
    const tasks = updateTask(card.tasks, taskId, (t) => ({ ...t, completed: !t.completed }));
    return ok(replaceCard(doc, i, { ...card, tasks: tasks ?? card.tasks }));
  }
  return fail("task-not-found");
}

export function reorderTasks(doc: Document, cardId: string, orderedIds: readonly string[]): Result<Document> {
  const cardIndex = doc.cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return fail("card-not-found");
  if (isCardBlocked(doc, cardId)) return fail("card-blocked");
  const card = doc.cards[cardIndex]!;
  const tasks = reorderById(card.tasks, orderedIds);
  if (tasks === null) return fail("invalid-reorder");
  return ok(replaceCard(doc, cardIndex, { ...card, tasks }));
}

/** Reorder the sub-tasks under a task, with the same permutation rules as `reorderTasks`. */
export function reorderSubTasks(doc: Document, taskId: string, orderedIds: readonly string[]): Result<Document> {
  for (let i = 0; i < doc.cards.length; i++) {
    const card = doc.cards[i]!;
    const located = locateTask(card.tasks, taskId);
    if (located === null) continue;
    if (isCardBlocked(doc, card.id)) return fail("card-blocked");
    const subtasks = reorderById(located.task.subtasks, orderedIds);
    if (subtasks === null) return fail("invalid-reorder");
    const tasks = updateTask(card.tasks, taskId, (t) => ({ ...t, subtasks }));
    return ok(replaceCard(doc, i, { ...card, tasks: tasks ?? card.tasks }));
  }
  return fail("task-not-found");
}

// ---------------------------------------------------------------------------
// Derived queries

/** A task is complete when it is a completed leaf, or all its sub-tasks are. */
export function isTaskComplete(task: Task): boolean {
  if (task.subtasks.length === 0) return task.completed;
  return task.subtasks.every(isTaskComplete);
}

/** A card is complete only when it has tasks and every one is complete. */
export function isCardComplete(card: Card): boolean {
  return card.tasks.length > 0 && card.tasks.every(isTaskComplete);
}

/**
 * A card is blocked while any of its prerequisites — directly or transitively —
 * is incomplete. A card with no prerequisites is never blocked, and an unknown
 * card id is treated as not blocked.
 */
export function isCardBlocked(doc: Document, cardId: string): boolean {
  const byId = new Map(doc.cards.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const stack = [cardId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of doc.edges) {
      if (edge.dependentId !== id) continue;
      const prerequisite = byId.get(edge.prerequisiteId);
      if (prerequisite === undefined || !isCardComplete(prerequisite)) return true;
      stack.push(edge.prerequisiteId);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// View helpers

/**
 * The card ids in flow order: every prerequisite before the card that waits on
 * it.
 *
 * Among cards that are ready at the same time, the one earliest in the document
 * comes first, so an unlinked document keeps its own order. Cycle rejection
 * makes a loop impossible; should one somehow arrive anyway, its cards still
 * appear — after the acyclic ones, in document order — so no node can vanish
 * from a view.
 */
export function topologicalOrder(doc: Document): readonly string[] {
  const byOrder = [...doc.cards].sort((a, b) => a.order - b.order);
  const waitingOn = new Map<string, number>(doc.cards.map((c) => [c.id, 0]));
  const dependents = new Map<string, string[]>(doc.cards.map((c) => [c.id, []]));
  for (const edge of doc.edges) {
    if (!waitingOn.has(edge.prerequisiteId) || !waitingOn.has(edge.dependentId)) continue;
    waitingOn.set(edge.dependentId, waitingOn.get(edge.dependentId)! + 1);
    dependents.get(edge.prerequisiteId)!.push(edge.dependentId);
  }

  const order: string[] = [];
  const placed = new Set<string>();
  while (placed.size < doc.cards.length) {
    const ready = byOrder.find((c) => !placed.has(c.id) && waitingOn.get(c.id) === 0);
    // Only a cycle can leave nothing ready; fall back to document order so the
    // function stays total.
    const next = ready ?? byOrder.find((c) => !placed.has(c.id));
    if (next === undefined) break;
    placed.add(next.id);
    order.push(next.id);
    for (const dependent of dependents.get(next.id)!) {
      waitingOn.set(dependent, waitingOn.get(dependent)! - 1);
    }
  }
  return order;
}

/**
 * The ids of every blocked card: exactly the cards an incomplete card can reach
 * along edges, in one pass over the graph.
 *
 * This is the batch form of `isCardBlocked` for a whole view — same answer,
 * without asking per card. That includes a prerequisite id that names no card
 * (a malformed document, which an imported file could carry): it can never
 * complete, so it blocks, exactly as `isCardBlocked` reads it.
 */
export function blockedSet(doc: Document): ReadonlySet<string> {
  const known = new Set(doc.cards.map((c) => c.id));
  const dependents = new Map<string, string[]>(doc.cards.map((c) => [c.id, []]));
  const blocked = new Set<string>();
  const queue = doc.cards.filter((c) => !isCardComplete(c)).map((c) => c.id);

  for (const edge of doc.edges) {
    if (!known.has(edge.dependentId)) continue;
    if (!known.has(edge.prerequisiteId)) {
      if (blocked.has(edge.dependentId)) continue;
      blocked.add(edge.dependentId);
      queue.push(edge.dependentId);
      continue;
    }
    dependents.get(edge.prerequisiteId)!.push(edge.dependentId);
  }

  while (queue.length > 0) {
    for (const dependent of dependents.get(queue.pop()!) ?? []) {
      if (blocked.has(dependent)) continue;
      blocked.add(dependent);
      queue.push(dependent);
    }
  }
  return blocked;
}

// ---------------------------------------------------------------------------
// Invariant checks (storage re-validates an imported document against these)

/** True when any two siblings under the same parent share a normalized title. */
export function hasDuplicateSiblings(doc: Document): boolean {
  const check = (tasks: readonly Task[]): boolean => {
    const seen = new Set<string>();
    for (const task of tasks) {
      const norm = normalizeTitle(task.title);
      if (seen.has(norm)) return true;
      seen.add(norm);
      if (check(task.subtasks)) return true;
    }
    return false;
  };
  return doc.cards.some((card) => check(card.tasks));
}

/** True when the edge set contains a cycle, including a self-loop. */
export function hasCycle(doc: Document): boolean {
  const ids = new Set(doc.cards.map((c) => c.id));
  for (const edge of doc.edges) {
    if (edge.prerequisiteId === edge.dependentId) return true;
    if (!ids.has(edge.prerequisiteId) || !ids.has(edge.dependentId)) continue;
    if (reaches(doc, edge.dependentId, edge.prerequisiteId)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers

/** True when a sibling already uses this normalized title (optionally excluding one id). */
export function hasDuplicateSibling(siblings: readonly Task[], title: string, excludeId?: string): boolean {
  const norm = normalizeTitle(title);
  return siblings.some((s) => s.id !== excludeId && normalizeTitle(s.title) === norm);
}

/** Reorder items to match `orderedIds` — a permutation of their ids — or null if not. */
function reorderById<T extends { readonly id: string }>(items: readonly T[], orderedIds: readonly string[]): T[] | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (
    orderedIds.length !== items.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !byId.has(id))
  ) {
    return null;
  }
  return orderedIds.map((id) => byId.get(id)!);
}

interface Located {
  task: Task;
  siblings: readonly Task[];
}

/** Find a task in a card's tree, returning it and the array that contains it. */
function locateTask(tasks: readonly Task[], taskId: string): Located | null {
  for (const task of tasks) {
    if (task.id === taskId) return { task, siblings: tasks };
    const nested = locateTask(task.subtasks, taskId);
    if (nested !== null) return nested;
  }
  return null;
}

/** Return a new tree with the task at `taskId` updated — or removed when `update` returns null — or null if not found. */
function updateTask(
  tasks: readonly Task[],
  taskId: string,
  update: (task: Task) => Task | null,
): Task[] | null {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    if (task.id === taskId) {
      const next = update(task);
      if (next === null) return tasks.filter((_, idx) => idx !== i);
      const result = tasks.slice();
      result[i] = next;
      return result;
    }
    const subtasks = updateTask(task.subtasks, taskId, update);
    if (subtasks !== null) {
      const result = tasks.slice();
      result[i] = { ...task, subtasks };
      return result;
    }
  }
  return null;
}

/** Return the document with `cards[index]` replaced by `card`. */
function replaceCard(doc: Document, index: number, card: Card): Document {
  const cards = doc.cards.slice();
  cards[index] = card;
  return { ...doc, cards };
}

/** True when a directed path of edges leads from `fromId` to `toId`. */
function reaches(doc: Document, fromId: string, toId: string): boolean {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === toId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of doc.edges) {
      if (edge.prerequisiteId === id) stack.push(edge.dependentId);
    }
  }
  return false;
}
