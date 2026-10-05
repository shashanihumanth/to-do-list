import { describe, expect, it } from "vitest";

import {
  addCard,
  addEdge,
  addTask,
  createDocument,
  toggleTaskComplete,
  type Document,
  type Result,
} from "../src/domain.js";
import { deserializeDocument, serializeDocument } from "../src/storage.js";

/** Unwrap a successful result, failing the test on a rejection. */
function valueOf<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`expected ok, got error "${result.error}"`);
  return result.value;
}

/**
 * A document exercising every part of the shape: two cards, nested sub-tasks,
 * a completed leaf, and an edge — the whole version-1 structure.
 */
function sampleDocument(): Document {
  let doc = valueOf(addCard(createDocument(), "Build the model"));
  const model = doc.cards[0]!.id;
  doc = valueOf(addCard(doc, "Ship the app"));
  const app = doc.cards[1]!.id;

  doc = valueOf(addTask(doc, model, "Draft types"));
  doc = valueOf(addTask(doc, model, "Name the sub-task"));
  const named = doc.cards[0]!.tasks[1]!.id;
  doc = valueOf(addTask(doc, model, "Go one deeper", named));
  doc = valueOf(addTask(doc, model, "Write the reducer"));
  const reducer = doc.cards[0]!.tasks[2]!.id;
  doc = valueOf(toggleTaskComplete(doc, reducer));

  doc = valueOf(addTask(doc, app, "Open the PR"));
  return valueOf(addEdge(doc, model, app));
}

describe("serializeDocument / deserializeDocument", () => {
  it("round-trips a document losslessly", () => {
    const doc = sampleDocument();
    expect(valueOf(deserializeDocument(serializeDocument(doc)))).toEqual(doc);
  });

  it("rejects text that is not JSON", () => {
    expect(deserializeDocument("not json")).toEqual({ ok: false, error: "invalid-json" });
  });

  it("rejects a document from a version it does not understand", () => {
    const foreign = JSON.stringify({ version: 2, cards: [], edges: [] });
    expect(deserializeDocument(foreign)).toEqual({ ok: false, error: "unsupported-version" });
  });

  it("rejects a document whose version is not a number", () => {
    const foreign = JSON.stringify({ version: "1", cards: [], edges: [] });
    expect(deserializeDocument(foreign)).toEqual({ ok: false, error: "malformed-document" });
  });
});

describe("deserializeDocument rejects a malformed document", () => {
  const task = { id: "t", title: "Task", completed: false, subtasks: [] };
  const card = { id: "c", title: "Card", tasks: [task], order: 0 };

  const malformed: ReadonlyArray<readonly [string, unknown]> = [
    ["JSON that is not an object", 42],
    ["a document with no cards", { version: 1, edges: [] }],
    ["a card that is not an object", { version: 1, cards: ["nope"], edges: [] }],
    ["a card missing its order", { version: 1, cards: [{ ...card, order: undefined }], edges: [] }],
    ["a task whose completed is not a boolean", { version: 1, cards: [{ ...card, tasks: [{ ...task, completed: "no" }] }], edges: [] }],
    ["a task whose subtasks is not an array", { version: 1, cards: [{ ...card, tasks: [{ ...task, subtasks: {} }] }], edges: [] }],
    ["an edge missing its dependent", { version: 1, cards: [card], edges: [{ prerequisiteId: "c" }] }],
  ];

  for (const [name, value] of malformed) {
    it(`rejects ${name}`, () => {
      expect(deserializeDocument(JSON.stringify(value))).toEqual({
        ok: false,
        error: "malformed-document",
      });
    });
  }
});
