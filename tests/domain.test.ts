import { describe, expect, it } from "vitest";

import {
  addCard,
  addTask,
  createDocument,
  deleteCard,
  deleteTask,
  hasDuplicateSibling,
  isCardComplete,
  isTaskComplete,
  normalizeTitle,
  renameCard,
  renameTask,
  reorderTasks,
  toggleTaskComplete,
  type Document,
  type Result,
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
