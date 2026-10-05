import { describe, expect, it } from "vitest";

import {
  addCard,
  addEdge,
  addTask,
  blockedSet,
  createDocument,
  deleteCard,
  deleteTask,
  hasDuplicateSibling,
  isCardBlocked,
  isCardComplete,
  isTaskComplete,
  normalizeTitle,
  removeEdge,
  renameCard,
  renameTask,
  reorderTasks,
  toggleTaskComplete,
  topologicalOrder,
  type Card,
  type Document,
  type Result,
  type Task,
} from "../src/domain.js";

/** Unwrap a successful result, failing the test on a rejection. */
function valueOf<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got error "${result.error}"`);
  return result.value;
}

/** Build a document with one card; returns the document and the card id. */
function docWithCard(title = "Groceries"): { doc: Document; cardId: string } {
  const doc = valueOf(addCard(createDocument(), title));
  return { doc, cardId: doc.cards[0]!.id };
}

describe("createDocument", () => {
  it("returns an empty document", () => {
    const doc = createDocument();
    expect(doc.cards).toEqual([]);
    expect(doc.edges).toEqual([]);
  });
});

describe("normalizeTitle", () => {
  it("trims, case-folds, and NFC-normalizes", () => {
    expect(normalizeTitle("  Buy milk  ")).toBe("buy milk");
    expect(normalizeTitle("Buy Milk")).toBe("buy milk");
    expect(normalizeTitle("café")).toBe(normalizeTitle("cafe\u0301"));
  });

  it("trims outer whitespace and normalizes Unicode, but treats inner whitespace as significant", () => {
    expect(normalizeTitle("\tÅ\n")).toBe(normalizeTitle("A\u030a"));
    expect(normalizeTitle("buy  milk")).not.toBe(normalizeTitle("buy milk"));
  });
});

describe("hasDuplicateSibling", () => {
  const siblings = [
    { id: "a", title: "Buy milk", completed: false, subtasks: [] },
    { id: "b", title: "Buy eggs", completed: false, subtasks: [] },
  ];

  it("detects a sibling sharing the normalized title", () => {
    expect(hasDuplicateSibling(siblings, " buy MILK ")).toBe(true);
    expect(hasDuplicateSibling(siblings, "Buy bread")).toBe(false);
  });

  it("ignores the excluded id", () => {
    expect(hasDuplicateSibling(siblings, "Buy milk", "a")).toBe(false);
  });
});

describe("addCard", () => {
  it("adds an empty card with a unique id", () => {
    const doc = createDocument();
    const result = addCard(doc, "Groceries");
    const card = valueOf(result).cards[0]!;
    expect(card.title).toBe("Groceries");
    expect(card.tasks).toEqual([]);
    expect(card.id).toBeTruthy();
  });

  it("assigns distinct ids and increasing order", () => {
    let doc = addCard(createDocument(), "A");
    doc = addCard(valueOf(doc), "B");
    const cards = valueOf(doc).cards;
    expect(cards).toHaveLength(2);
    expect(cards[0]!.id).not.toBe(cards[1]!.id);
    expect(cards.map((c) => c.order)).toEqual([0, 1]);
  });
});

describe("renameCard", () => {
  it("renames an existing card", () => {
    const { doc, cardId } = docWithCard();
    const renamed = valueOf(renameCard(doc, cardId, "Chores"));
    expect(renamed.cards[0]!.title).toBe("Chores");
  });

  it("rejects an unknown card id", () => {
    const { doc } = docWithCard();
    expect(renameCard(doc, "missing", "X")).toEqual({ ok: false, error: "card-not-found" });
  });
});

describe("deleteCard", () => {
  it("removes the card", () => {
    const { doc, cardId } = docWithCard();
    expect(valueOf(deleteCard(doc, cardId)).cards).toEqual([]);
  });

  it("cascades the card's tasks", () => {
    let { doc, cardId } = docWithCard();
    doc = valueOf(addTask(doc, cardId, "Buy milk"));
    const deleted = valueOf(deleteCard(doc, cardId));
    expect(deleted.cards).toEqual([]);
  });

  it("rejects an unknown card id", () => {
    expect(deleteCard(createDocument(), "missing")).toEqual({ ok: false, error: "card-not-found" });
  });
});

describe("addTask", () => {
  it("adds a top-level task to a card", () => {
    const { doc, cardId } = docWithCard();
    const result = valueOf(addTask(doc, cardId, "Buy milk"));
    const task = result.cards[0]!.tasks[0]!;
    expect(task.title).toBe("Buy milk");
    expect(task.completed).toBe(false);
    expect(task.subtasks).toEqual([]);
  });

  it("rejects a duplicate sibling title (case/whitespace-insensitive)", () => {
    const { doc, cardId } = docWithCard();
    const added = valueOf(addTask(doc, cardId, "Buy milk"));
    expect(addTask(added, cardId, "  BUY MILK  ")).toEqual({ ok: false, error: "duplicate-title" });
  });

  it("rejects a duplicate sub-task title among its siblings", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "Parent"));
    const parentId = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Buy milk", parentId));
    expect(addTask(d, cardId, " BUY MILK ", parentId)).toEqual({ ok: false, error: "duplicate-title" });
  });

  it("allows the same title under different parents", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "Milk"));
    const parentId = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Milk", parentId));
    expect(d.cards[0]!.tasks).toHaveLength(1);
    expect(d.cards[0]!.tasks[0]!.subtasks[0]!.title).toBe("Milk");
  });

  it("allows the same sub-task title under different parents", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "One"));
    const oneId = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Two"));
    const twoId = d.cards[0]!.tasks[1]!.id;
    d = valueOf(addTask(d, cardId, "Child", oneId));
    d = valueOf(addTask(d, cardId, "Child", twoId));
    expect(d.cards[0]!.tasks[0]!.subtasks[0]!.title).toBe("Child");
    expect(d.cards[0]!.tasks[1]!.subtasks[0]!.title).toBe("Child");
  });

  it("nests a sub-task under a parent", () => {
    const { doc, cardId } = docWithCard();
    const added = valueOf(addTask(doc, cardId, "Parent"));
    const parentId = added.cards[0]!.tasks[0]!.id;
    const nested = valueOf(addTask(added, cardId, "Child", parentId));
    expect(nested.cards[0]!.tasks[0]!.subtasks[0]!.title).toBe("Child");
  });

  it("rejects when the parent task is missing", () => {
    const { doc, cardId } = docWithCard();
    expect(addTask(doc, cardId, "Child", "missing")).toEqual({ ok: false, error: "task-not-found" });
  });
});

describe("renameTask", () => {
  it("renames a task", () => {
    const { doc, cardId } = docWithCard();
    const added = valueOf(addTask(doc, cardId, "Old"));
    const taskId = added.cards[0]!.tasks[0]!.id;
    const renamed = valueOf(renameTask(added, taskId, "New"));
    expect(renamed.cards[0]!.tasks[0]!.title).toBe("New");
  });

  it("rejects renaming onto a sibling's title", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "One"));
    const first = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Two"));
    expect(renameTask(d, first, "two")).toEqual({ ok: false, error: "duplicate-title" });
  });

  it("rejects renaming onto a sibling's title that differs only by Unicode composition", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "café"));
    d = valueOf(addTask(d, cardId, "Tea"));
    const tea = d.cards[0]!.tasks[1]!.id;
    expect(renameTask(d, tea, "cafe\u0301")).toEqual({ ok: false, error: "duplicate-title" });
  });

  it("rejects renaming a sub-task onto a sibling sub-task's title", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "Parent"));
    const parentId = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "One", parentId));
    const one = d.cards[0]!.tasks[0]!.subtasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Two", parentId));
    expect(renameTask(d, one, "two")).toEqual({ ok: false, error: "duplicate-title" });
  });

  it("allows renaming a task to its own title in another form, keeping the raw title", () => {
    const { doc, cardId } = docWithCard();
    const added = valueOf(addTask(doc, cardId, "Buy milk"));
    const taskId = added.cards[0]!.tasks[0]!.id;
    const renamed = valueOf(renameTask(added, taskId, "  BUY MILK  "));
    expect(renamed.cards[0]!.tasks[0]!.title).toBe("  BUY MILK  ");
  });

  it("allows renaming to a title used by a task under a different parent", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "Milk"));
    const parentId = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Child", parentId));
    const childId = d.cards[0]!.tasks[0]!.subtasks[0]!.id;
    const renamed = valueOf(renameTask(d, childId, "Milk"));
    expect(renamed.cards[0]!.tasks[0]!.subtasks[0]!.title).toBe("Milk");
  });

  it("rejects an unknown task id", () => {
    const { doc } = docWithCard();
    expect(renameTask(doc, "missing", "X")).toEqual({ ok: false, error: "task-not-found" });
  });
});

describe("deleteTask", () => {
  it("removes a task", () => {
    const { doc, cardId } = docWithCard();
    const added = valueOf(addTask(doc, cardId, "Buy milk"));
    const taskId = added.cards[0]!.tasks[0]!.id;
    expect(valueOf(deleteTask(added, taskId)).cards[0]!.tasks).toEqual([]);
  });

  it("cascades a task's sub-tasks", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "Parent"));
    const parentId = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Child", parentId));
    const deleted = valueOf(deleteTask(d, parentId));
    expect(deleted.cards[0]!.tasks).toEqual([]);
  });

  it("rejects an unknown task id", () => {
    const { doc } = docWithCard();
    expect(deleteTask(doc, "missing")).toEqual({ ok: false, error: "task-not-found" });
  });
});

describe("toggleTaskComplete", () => {
  it("toggles a leaf task's completed flag", () => {
    const { doc, cardId } = docWithCard();
    const added = valueOf(addTask(doc, cardId, "Buy milk"));
    const taskId = added.cards[0]!.tasks[0]!.id;
    const done = valueOf(toggleTaskComplete(added, taskId));
    expect(done.cards[0]!.tasks[0]!.completed).toBe(true);
    const undone = valueOf(toggleTaskComplete(done, taskId));
    expect(undone.cards[0]!.tasks[0]!.completed).toBe(false);
  });

  it("rejects a parent task (completion is derived, not manual)", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "Parent"));
    const parentId = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Child", parentId));
    expect(toggleTaskComplete(d, parentId)).toEqual({ ok: false, error: "not-leaf-task" });
  });
});

describe("reorderTasks", () => {
  it("reorders the card's top-level tasks", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "One"));
    const one = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Two"));
    const two = d.cards[0]!.tasks[1]!.id;
    const reordered = valueOf(reorderTasks(d, cardId, [two, one]));
    expect(reordered.cards[0]!.tasks.map((t) => t.id)).toEqual([two, one]);
  });

  it("rejects when ids don't match the card's tasks", () => {
    const { doc, cardId } = docWithCard();
    expect(reorderTasks(doc, cardId, ["missing"])).toEqual({ ok: false, error: "invalid-reorder" });
  });

  it("rejects duplicate ids (order must be a permutation)", () => {
    const { doc, cardId } = docWithCard();
    let d = valueOf(addTask(doc, cardId, "One"));
    const one = d.cards[0]!.tasks[0]!.id;
    d = valueOf(addTask(d, cardId, "Two"));
    expect(reorderTasks(d, cardId, [one, one])).toEqual({ ok: false, error: "invalid-reorder" });
  });
});

describe("completion derivation", () => {
  it("a leaf task is complete only when its flag is set", () => {
    const task = { id: "1", title: "t", completed: false, subtasks: [] };
    expect(isTaskComplete(task)).toBe(false);
    expect(isTaskComplete({ ...task, completed: true })).toBe(true);
  });

  it("a parent task is complete only when all sub-tasks are complete", () => {
    const parent = {
      id: "p",
      title: "p",
      completed: false,
      subtasks: [
        { id: "a", title: "a", completed: false, subtasks: [] },
        { id: "b", title: "b", completed: true, subtasks: [] },
      ],
    };
    expect(isTaskComplete(parent)).toBe(false);
    expect(isTaskComplete({ ...parent, subtasks: parent.subtasks.map((s) => ({ ...s, completed: true })) })).toBe(true);
  });

  it("a card is complete only when it has tasks and all are complete", () => {
    expect(isCardComplete({ id: "c", title: "c", tasks: [], order: 0 })).toBe(false);

    const withTask = {
      id: "c",
      title: "c",
      order: 0,
      tasks: [{ id: "t", title: "t", completed: true, subtasks: [] }],
    };
    expect(isCardComplete(withTask)).toBe(true);
    expect(isCardComplete({ ...withTask, tasks: [{ ...withTask.tasks[0]!, completed: false }] })).toBe(false);
  });
});

describe("sub-tasks & recursive completion", () => {
  /** Find a task by title anywhere in a card's task tree. */
  function taskByTitle(tasks: readonly Task[], title: string): Task | undefined {
    for (const task of tasks) {
      if (task.title === title) return task;
      const found = taskByTitle(task.subtasks, title);
      if (found) return found;
    }
    return undefined;
  }

  /** Build `R → [A → [A1], B]` and return every task id. */
  function buildTree(doc: Document, cardId: string) {
    let d = valueOf(addTask(doc, cardId, "R"));
    const rId = taskByTitle(d.cards[0]!.tasks, "R")!.id;
    d = valueOf(addTask(d, cardId, "A", rId));
    const aId = taskByTitle(d.cards[0]!.tasks, "A")!.id;
    d = valueOf(addTask(d, cardId, "A1", aId));
    const a1Id = taskByTitle(d.cards[0]!.tasks, "A1")!.id;
    d = valueOf(addTask(d, cardId, "B", rId));
    const bId = taskByTitle(d.cards[0]!.tasks, "B")!.id;
    return { doc: d, rId, aId, a1Id, bId };
  }

  /** Build a single chain of `depth` nested tasks; returns the doc and the deepest leaf id. */
  function buildChain(doc: Document, cardId: string, depth: number): { doc: Document; leafId: string } {
    let d = doc;
    let parentId: string | undefined;
    let leafId = "";
    for (let i = 0; i < depth; i++) {
      d = valueOf(addTask(d, cardId, `level-${i}`, parentId));
      leafId = taskByTitle(d.cards[0]!.tasks, `level-${i}`)!.id;
      parentId = leafId;
    }
    return { doc: d, leafId };
  }

  it("nests sub-tasks to unlimited depth", () => {
    const { doc, cardId } = docWithCard();
    const { doc: built } = buildChain(doc, cardId, 5);
    // Walk the single chain down: each task nests exactly one sub-task until the leaf.
    let tasks = built.cards[0]!.tasks;
    for (let depth = 0; depth < 5; depth++) {
      expect(tasks[0]!.title).toBe(`level-${depth}`);
      tasks = tasks[0]!.subtasks;
    }
    expect(tasks).toEqual([]);
  });

  it("completion derives up a chain of arbitrary depth", () => {
    const { doc, cardId } = docWithCard();
    const { doc: built, leafId } = buildChain(doc, cardId, 5);

    // The whole chain — and the card — is incomplete until the single leaf is toggled.
    expect(isTaskComplete(taskByTitle(built.cards[0]!.tasks, "level-0")!)).toBe(false);
    expect(isCardComplete(built.cards[0]!)).toBe(false);

    // Toggle the deepest leaf: completion propagates up all five levels to the card.
    const done = valueOf(toggleTaskComplete(built, leafId));
    expect(isTaskComplete(taskByTitle(done.cards[0]!.tasks, "level-0")!)).toBe(true);
    expect(isCardComplete(done.cards[0]!)).toBe(true);

    // Un-toggle it: the entire chain un-completes.
    const undone = valueOf(toggleTaskComplete(done, leafId));
    expect(isTaskComplete(taskByTitle(undone.cards[0]!.tasks, "level-0")!)).toBe(false);
    expect(isCardComplete(undone.cards[0]!)).toBe(false);
  });

  it("a task is complete only when all its sub-tasks, recursively, are complete", () => {
    const { doc, cardId } = docWithCard();
    const tree = buildTree(doc, cardId);
    // Complete A1 only: A derives complete, but B is not, so R stays incomplete.
    let d = valueOf(toggleTaskComplete(tree.doc, tree.a1Id));
    expect(isTaskComplete(taskByTitle(d.cards[0]!.tasks, "A")!)).toBe(true);
    expect(isTaskComplete(taskByTitle(d.cards[0]!.tasks, "R")!)).toBe(false);
    // Complete B: now every leaf is done, so R derives complete.
    d = valueOf(toggleTaskComplete(d, tree.bId));
    expect(isTaskComplete(taskByTitle(d.cards[0]!.tasks, "R")!)).toBe(true);
  });

  it("a card completes only when its whole tree is complete, and un-completes when a deep leaf is un-toggled", () => {
    const { doc, cardId } = docWithCard();
    const tree = buildTree(doc, cardId);
    let d = valueOf(toggleTaskComplete(tree.doc, tree.a1Id));
    d = valueOf(toggleTaskComplete(d, tree.bId));
    expect(isCardComplete(d.cards[0]!)).toBe(true);

    // Un-toggle the deep leaf A1: A, then R, then the card all un-complete.
    d = valueOf(toggleTaskComplete(d, tree.a1Id));
    expect(isTaskComplete(taskByTitle(d.cards[0]!.tasks, "A")!)).toBe(false);
    expect(isTaskComplete(taskByTitle(d.cards[0]!.tasks, "R")!)).toBe(false);
    expect(isCardComplete(d.cards[0]!)).toBe(false);
  });

  it("rejects toggling a parent even when its sub-tasks are complete (completion is derived)", () => {
    const { doc, cardId } = docWithCard();
    const tree = buildTree(doc, cardId);
    const d = valueOf(toggleTaskComplete(tree.doc, tree.a1Id));
    // A is derived-complete, but still has no manual toggle.
    expect(toggleTaskComplete(d, tree.aId)).toEqual({ ok: false, error: "not-leaf-task" });
    expect(isTaskComplete(taskByTitle(d.cards[0]!.tasks, "A")!)).toBe(true);
  });
});

describe("addEdge / removeEdge", () => {
  /** Build a document with two empty cards; returns the document and both ids. */
  function twoCards(): { doc: Document; a: string; b: string } {
    let doc = valueOf(addCard(createDocument(), "A"));
    doc = valueOf(addCard(doc, "B"));
    return { doc, a: doc.cards[0]!.id, b: doc.cards[1]!.id };
  }

  it("links a prerequisite to a dependent in flow order", () => {
    const { doc, a, b } = twoCards();
    const linked = valueOf(addEdge(doc, a, b));
    expect(linked.edges).toEqual([{ prerequisiteId: a, dependentId: b }]);
  });

  it("rejects an unknown prerequisite or dependent", () => {
    const { doc, a } = twoCards();
    expect(addEdge(doc, "missing", a)).toEqual({ ok: false, error: "card-not-found" });
    expect(addEdge(doc, a, "missing")).toEqual({ ok: false, error: "card-not-found" });
  });

  it("rejects a self-loop", () => {
    const { doc, a } = twoCards();
    expect(addEdge(doc, a, a)).toEqual({ ok: false, error: "cycle" });
  });

  it("rejects a duplicate edge", () => {
    const { doc, a, b } = twoCards();
    const linked = valueOf(addEdge(doc, a, b));
    expect(addEdge(linked, a, b)).toEqual({ ok: false, error: "duplicate-edge" });
  });

  it("removeEdge undoes the link", () => {
    const { doc, a, b } = twoCards();
    const linked = valueOf(addEdge(doc, a, b));
    expect(valueOf(removeEdge(linked, a, b)).edges).toEqual([]);
  });

  it("rejects removing an edge that isn't there", () => {
    const { doc, a, b } = twoCards();
    expect(removeEdge(doc, a, b)).toEqual({ ok: false, error: "edge-not-found" });
  });
});

describe("cycle rejection", () => {
  /** Build three empty cards; returns the document and their ids. */
  function threeCards(): { doc: Document; a: string; b: string; c: string } {
    let doc = createDocument();
    for (const title of ["A", "B", "C"]) doc = valueOf(addCard(doc, title));
    return { doc, a: doc.cards[0]!.id, b: doc.cards[1]!.id, c: doc.cards[2]!.id };
  }

  it("rejects an edge that closes a two-card cycle", () => {
    const { doc, a, b } = threeCards();
    const linked = valueOf(addEdge(doc, a, b));
    expect(addEdge(linked, b, a)).toEqual({ ok: false, error: "cycle" });
  });

  it("rejects an edge that closes a longer cycle", () => {
    const { doc, a, b, c } = threeCards();
    let d = valueOf(addEdge(doc, a, b));
    d = valueOf(addEdge(d, b, c));
    expect(addEdge(d, c, a)).toEqual({ ok: false, error: "cycle" });
  });

  it("allows a diamond — a shared prerequisite is not a cycle", () => {
    const { doc, a, b, c } = threeCards();
    let d = valueOf(addEdge(doc, a, b));
    d = valueOf(addEdge(d, a, c));
    d = valueOf(addCard(d, "D"));
    const last = d.cards[3]!.id;
    d = valueOf(addEdge(d, b, last));
    d = valueOf(addEdge(d, c, last));
    expect(d.edges).toHaveLength(4);
  });
});

describe("isCardBlocked", () => {
  /** Append a card with one incomplete task; returns the new document and both ids. */
  function cardWithTask(doc: Document, title: string): { doc: Document; cardId: string; taskId: string } {
    const added = valueOf(addCard(doc, title));
    const cardId = added.cards[added.cards.length - 1]!.id;
    const withTask = valueOf(addTask(added, cardId, `${title} task`));
    const tasks = withTask.cards[withTask.cards.length - 1]!.tasks;
    return { doc: withTask, cardId, taskId: tasks[0]!.id };
  }

  it("an unlinked card is not blocked", () => {
    const { doc, cardId } = cardWithTask(createDocument(), "A");
    expect(isCardBlocked(doc, cardId)).toBe(false);
  });

  it("a card is blocked while its prerequisite is incomplete", () => {
    const first = cardWithTask(createDocument(), "A");
    const second = cardWithTask(first.doc, "B");
    const doc = valueOf(addEdge(second.doc, first.cardId, second.cardId));
    expect(isCardBlocked(doc, second.cardId)).toBe(true);
    expect(isCardBlocked(doc, first.cardId)).toBe(false);
  });

  it("an empty prerequisite blocks — an empty card is never complete", () => {
    let doc = valueOf(addCard(createDocument(), "A"));
    const a = doc.cards[0]!.id;
    doc = valueOf(addCard(doc, "B"));
    const b = doc.cards[1]!.id;
    doc = valueOf(addEdge(doc, a, b));
    expect(isCardBlocked(doc, b)).toBe(true);
  });

  it("unblocks once the prerequisite completes", () => {
    const first = cardWithTask(createDocument(), "A");
    const second = cardWithTask(first.doc, "B");
    let doc = valueOf(addEdge(second.doc, first.cardId, second.cardId));
    doc = valueOf(toggleTaskComplete(doc, first.taskId));
    expect(isCardBlocked(doc, second.cardId)).toBe(false);
  });

  it("blocking is transitive down a chain", () => {
    const a = cardWithTask(createDocument(), "A");
    const b = cardWithTask(a.doc, "B");
    const c = cardWithTask(b.doc, "C");
    let doc = valueOf(addEdge(c.doc, a.cardId, b.cardId));
    doc = valueOf(addEdge(doc, b.cardId, c.cardId));

    expect(isCardBlocked(doc, c.cardId)).toBe(true); // A is incomplete
    doc = valueOf(toggleTaskComplete(doc, a.taskId)); // A completes
    expect(isCardBlocked(doc, b.cardId)).toBe(false);
    expect(isCardBlocked(doc, c.cardId)).toBe(true); // B is still incomplete
    doc = valueOf(toggleTaskComplete(doc, b.taskId)); // B completes
    expect(isCardBlocked(doc, c.cardId)).toBe(false);
  });

  it("a complete card does not hide an incomplete ancestor", () => {
    const task = (id: string, completed: boolean): Task => ({ id, title: id, completed, subtasks: [] });
    const card = (id: string, tasks: readonly Task[]): Card => ({ id, title: id, tasks, order: 0 });
    const doc: Document = {
      version: 1,
      cards: [card("A", [task("a", false)]), card("B", [task("b", true)]), card("C", [task("c", false)])],
      edges: [
        { prerequisiteId: "A", dependentId: "B" },
        { prerequisiteId: "B", dependentId: "C" },
      ],
    };
    expect(isCardBlocked(doc, "B")).toBe(true); // its prerequisite A is incomplete
    expect(isCardBlocked(doc, "C")).toBe(true); // A is transitively incomplete
  });

  it("an unknown card is not blocked", () => {
    expect(isCardBlocked(createDocument(), "missing")).toBe(false);
  });
});

describe("full lock on a blocked card", () => {
  /** A blocked pair: A (one incomplete task) → B (a leaf task and a parent task). */
  function blockedPair(): {
    doc: Document;
    a: string;
    aTask: string;
    b: string;
    bTask: string;
    bParent: string;
  } {
    let doc = valueOf(addCard(createDocument(), "A"));
    const a = doc.cards[0]!.id;
    doc = valueOf(addTask(doc, a, "a-task"));
    const aTask = doc.cards[0]!.tasks[0]!.id;

    doc = valueOf(addCard(doc, "B"));
    const b = doc.cards[1]!.id;
    doc = valueOf(addTask(doc, b, "b-task"));
    const bTask = doc.cards[1]!.tasks[0]!.id;
    doc = valueOf(addTask(doc, b, "b-parent"));
    const bParent = doc.cards[1]!.tasks[1]!.id;

    doc = valueOf(addEdge(doc, a, b));
    return { doc, a, aTask, b, bTask, bParent };
  }

  it("rejects every mutating command on the card's tasks", () => {
    const { doc, b, bTask, bParent } = blockedPair();
    expect(addTask(doc, b, "new")).toEqual({ ok: false, error: "card-blocked" });
    expect(addTask(doc, b, "new", bParent)).toEqual({ ok: false, error: "card-blocked" });
    expect(renameTask(doc, bTask, "renamed")).toEqual({ ok: false, error: "card-blocked" });
    expect(deleteTask(doc, bTask)).toEqual({ ok: false, error: "card-blocked" });
    expect(toggleTaskComplete(doc, bTask)).toEqual({ ok: false, error: "card-blocked" });
    expect(reorderTasks(doc, b, [bParent, bTask])).toEqual({ ok: false, error: "card-blocked" });
  });

  it("rejects card-level mutations while blocked", () => {
    const { doc, b } = blockedPair();
    expect(renameCard(doc, b, "B2")).toEqual({ ok: false, error: "card-blocked" });
    expect(deleteCard(doc, b)).toEqual({ ok: false, error: "card-blocked" });
  });

  it("leaves the unblocked prerequisite workable", () => {
    const { doc, a, aTask } = blockedPair();
    expect(addTask(doc, a, "another").ok).toBe(true);
    expect(renameTask(doc, aTask, "renamed").ok).toBe(true);
    expect(toggleTaskComplete(doc, aTask).ok).toBe(true);
    expect(reorderTasks(doc, a, [aTask]).ok).toBe(true);
    expect(renameCard(doc, a, "A2").ok).toBe(true);
  });

  it("mutations succeed again once the prerequisite completes", () => {
    const { doc, aTask, b, bTask } = blockedPair();
    const unblocked = valueOf(toggleTaskComplete(doc, aTask));
    expect(toggleTaskComplete(unblocked, bTask).ok).toBe(true);
  });

  it("keeps the graph editable so the block can be lifted", () => {
    const { doc, a, b, bTask } = blockedPair();
    const withC = valueOf(addCard(doc, "C"));
    const c = withC.cards[2]!.id;
    // Only the blocked card's contents are read-only; it can still gain dependents.
    const chained = valueOf(addEdge(withC, b, c));
    expect(isCardBlocked(chained, c)).toBe(true);

    const unlinked = valueOf(removeEdge(chained, a, b));
    expect(isCardBlocked(unlinked, b)).toBe(false);
    expect(toggleTaskComplete(unlinked, bTask).ok).toBe(true);
  });
});

describe("deleteCard and the graph", () => {
  /** A (one complete task) → B; returns the document and both card ids. */
  function completedPrerequisite(): { doc: Document; a: string; b: string } {
    let doc = valueOf(addCard(createDocument(), "A"));
    const a = doc.cards[0]!.id;
    doc = valueOf(addTask(doc, a, "a-task"));
    const aTask = doc.cards[0]!.tasks[0]!.id;
    doc = valueOf(toggleTaskComplete(doc, aTask));

    doc = valueOf(addCard(doc, "B"));
    const b = doc.cards[1]!.id;
    doc = valueOf(addEdge(doc, a, b));
    return { doc, a, b };
  }

  it("rejects deleting a card other cards depend on", () => {
    const { doc, a } = completedPrerequisite();
    expect(deleteCard(doc, a)).toEqual({ ok: false, error: "card-has-dependents" });
  });

  it("allows deleting the prerequisite once the edge is removed", () => {
    const { doc, a, b } = completedPrerequisite();
    const unlinked = valueOf(removeEdge(doc, a, b));
    expect(deleteCard(unlinked, a).ok).toBe(true);
  });

  it("removes edges that point at a deleted dependent", () => {
    const { doc, b } = completedPrerequisite();
    const deleted = valueOf(deleteCard(doc, b));
    expect(deleted.edges).toEqual([]);
    expect(deleted.cards).toHaveLength(1);
  });
});

describe("topologicalOrder", () => {
  /**
   * Build a document from card titles, in creation order, plus edges given as
   * `[prerequisite index, dependent index]` pairs. Each card id is `card-<n>`.
   */
  function graph(
    titles: readonly string[],
    links: readonly (readonly [number, number])[] = [],
  ): { doc: Document; ids: readonly string[] } {
    const ids = titles.map((_, index) => `card-${index}`);
    const doc: Document = {
      ...createDocument(),
      cards: titles.map((title, order) => ({ id: ids[order]!, title, tasks: [], order })),
      edges: links.map(([from, to]) => ({ prerequisiteId: ids[from]!, dependentId: ids[to]! })),
    };
    return { doc, ids };
  }

  it("lists a prerequisite before its dependent, even when created later", () => {
    // "Build" is created second but must come first: Build → Ship.
    const { doc, ids } = graph(["Ship", "Build"], [[1, 0]]);
    expect(topologicalOrder(doc)).toEqual([ids[1], ids[0]]);
  });

  it("keeps cards nothing forces apart in document order", () => {
    // A → C; B is independent, so A, then C (earlier in the document), then B.
    const { doc, ids } = graph(["A", "C", "B"], [[0, 1]]);
    expect(topologicalOrder(doc)).toEqual([ids[0], ids[1], ids[2]]);
  });

  it("orders a chain built back to front, and a diamond in one pass", () => {
    // Created as C, B, A but linked A → B → C.
    const chain = graph(["C", "B", "A"], [[2, 1], [1, 0]]);
    expect(topologicalOrder(chain.doc)).toEqual([chain.ids[2], chain.ids[1], chain.ids[0]]);

    // A → B, A → C, B → D, C → D: D waits on both middle cards.
    const diamond = graph(["A", "B", "C", "D"], [[0, 1], [0, 2], [1, 3], [2, 3]]);
    const order = topologicalOrder(diamond.doc);
    expect(order).toHaveLength(4);
    expect(order).toEqual([diamond.ids[0], diamond.ids[1], diamond.ids[2], diamond.ids[3]]);
  });

  it("returns nothing for an empty document", () => {
    expect(topologicalOrder(createDocument())).toEqual([]);
  });
});

describe("blockedSet", () => {
  /** A card with one task; `done` finishes it, so the card reads complete. */
  function card(id: string, done: boolean, order: number): Card {
    const task: Task = { id: `${id}-t`, title: `${id}-t`, completed: done, subtasks: [] };
    return { id, title: id, order, tasks: [task] };
  }

  /** A document of the given cards, linked by `[prerequisite id, dependent id]`. */
  function board(cards: readonly Card[], links: readonly (readonly [string, string])[]): Document {
    return {
      ...createDocument(),
      cards,
      edges: links.map(([prerequisiteId, dependentId]) => ({ prerequisiteId, dependentId })),
    };
  }

  it("is empty when nothing is linked", () => {
    const doc = board([card("A", false, 0), card("B", false, 1)], []);
    expect(blockedSet(doc).size).toBe(0);
  });

  it("holds a card whose prerequisite is incomplete, but not the prerequisite", () => {
    const doc = board([card("A", false, 0), card("B", false, 1)], [["A", "B"]]);
    expect(blockedSet(doc)).toEqual(new Set(["B"]));
  });

  it("blocks transitively, even through a complete card", () => {
    // A is incomplete, B is complete, C waits on B — and so on A.
    const doc = board(
      [card("A", false, 0), card("B", true, 1), card("C", false, 2)],
      [["A", "B"], ["B", "C"]],
    );
    expect(blockedSet(doc)).toEqual(new Set(["B", "C"]));
  });

  it("leaves a card out once its prerequisite completes", () => {
    const doc = board([card("A", true, 0), card("B", false, 1)], [["A", "B"]]);
    expect(blockedSet(doc).size).toBe(0);
  });

  it("agrees with isCardBlocked for every card", () => {
    // A incomplete → B (complete) → C; D complete → E; F unlinked. B is
    // complete yet still blocked, and C is blocked through B.
    const doc = board(
      [card("A", false, 0), card("B", true, 1), card("C", false, 2), card("D", true, 3), card("E", false, 4), card("F", false, 5)],
      [["A", "B"], ["B", "C"], ["D", "E"]],
    );
    const blocked = blockedSet(doc);
    expect(blocked).toEqual(new Set(["B", "C"]));
    for (const c of doc.cards) {
      expect(blocked.has(c.id)).toBe(isCardBlocked(doc, c.id));
    }
  });

  it("agrees with isCardBlocked when a prerequisite names no card", () => {
    // A malformed document (an imported file could carry one): ghost → A → B.
    const doc: Document = {
      ...createDocument(),
      cards: [card("A", false, 0), card("B", false, 1)],
      edges: [
        { prerequisiteId: "ghost", dependentId: "A" },
        { prerequisiteId: "A", dependentId: "B" },
      ],
    };
    const blocked = blockedSet(doc);
    expect(blocked).toEqual(new Set(["A", "B"]));
    for (const c of doc.cards) {
      expect(blocked.has(c.id)).toBe(isCardBlocked(doc, c.id));
    }
  });
});
