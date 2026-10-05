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
  | "invalid-reorder";

/** A command result: the new document, or a reason the command was rejected. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: DomainError };

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
  const cards = doc.cards.slice();
  cards[index] = { ...doc.cards[index]!, title };
  return ok({ ...doc, cards });
}

export function deleteCard(doc: Document, cardId: string): Result<Document> {
  if (!doc.cards.some((c) => c.id === cardId)) return fail("card-not-found");
  return ok({ ...doc, cards: doc.cards.filter((c) => c.id !== cardId) });
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
    if (hasDuplicateSibling(located.siblings, title, taskId)) return fail("duplicate-title");
    const tasks = updateTask(card.tasks, taskId, (t) => ({ ...t, title }));
    return ok(replaceCard(doc, i, { ...card, tasks: tasks ?? card.tasks }));
  }
  return fail("task-not-found");
}

export function deleteTask(doc: Document, taskId: string): Result<Document> {
  for (let i = 0; i < doc.cards.length; i++) {
    const card = doc.cards[i]!;
    const tasks = updateTask(card.tasks, taskId, () => null);
    if (tasks === null) continue;
    return ok(replaceCard(doc, i, { ...card, tasks }));
  }
  return fail("task-not-found");
}

export function toggleTaskComplete(doc: Document, taskId: string): Result<Document> {
  for (let i = 0; i < doc.cards.length; i++) {
    const card = doc.cards[i]!;
    const located = locateTask(card.tasks, taskId);
    if (located === null) continue;
    if (located.task.subtasks.length > 0) return fail("not-leaf-task");
    const tasks = updateTask(card.tasks, taskId, (t) => ({ ...t, completed: !t.completed }));
    return ok(replaceCard(doc, i, { ...card, tasks: tasks ?? card.tasks }));
  }
  return fail("task-not-found");
}

export function reorderTasks(doc: Document, cardId: string, orderedIds: readonly string[]): Result<Document> {
  const cardIndex = doc.cards.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return fail("card-not-found");
  const card = doc.cards[cardIndex]!;

  const byId = new Map(card.tasks.map((t) => [t.id, t]));
  if (
    orderedIds.length !== card.tasks.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !byId.has(id))
  ) {
    return fail("invalid-reorder");
  }
  const tasks = orderedIds.map((id) => byId.get(id)!);
  return ok(replaceCard(doc, cardIndex, { ...card, tasks }));
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

// ---------------------------------------------------------------------------
// Helpers

/** True when a sibling already uses this normalized title (optionally excluding one id). */
export function hasDuplicateSibling(siblings: readonly Task[], title: string, excludeId?: string): boolean {
  const norm = normalizeTitle(title);
  return siblings.some((s) => s.id !== excludeId && normalizeTitle(s.title) === norm);
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
