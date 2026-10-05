/**
 * Persistence for the versioned document.
 *
 * The pure serialize/deserialize pair is the seam storage and UI adapters sit
 * on: the same JSON text is what localStorage holds, what export writes, and
 * what import reads. This module stays free of browser globals — reading and
 * writing storage is the adapter's job, not the domain's.
 */

import type { Card, Document, Edge, Result, Task } from "./domain.js";

/** Reasons JSON text cannot be read back as a document. */
export type DocumentError = "invalid-json" | "unsupported-version" | "malformed-document";

const fail = (error: DocumentError): Result<Document, DocumentError> => ({ ok: false, error });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isArrayOf = <T>(value: unknown, is: (item: unknown) => item is T): value is readonly T[] =>
  Array.isArray(value) && value.every(is);

const isTask = (value: unknown): value is Task => {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string" &&
    typeof value["title"] === "string" &&
    typeof value["completed"] === "boolean" &&
    isArrayOf(value["subtasks"], isTask)
  );
};

const isCard = (value: unknown): value is Card => {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string" &&
    typeof value["title"] === "string" &&
    typeof value["order"] === "number" &&
    isArrayOf(value["tasks"], isTask)
  );
};

const isEdge = (value: unknown): value is Edge => {
  if (!isRecord(value)) return false;
  return typeof value["prerequisiteId"] === "string" && typeof value["dependentId"] === "string";
};

/** Serialize a document to the JSON text that persistence and export use. */
export function serializeDocument(doc: Document): string {
  return JSON.stringify(doc);
}

/**
 * Parse JSON text back into a document.
 *
 * Text that is not JSON, a document written by another version, and one whose
 * shape does not match the model are all rejected, so an import cannot put a
 * structure the board would render blindly on screen.
 *
 * Graph invariants are not re-checked here: the app's own export is written
 * from a valid document, and the queries stay total over a malformed one — a
 * prerequisite id that names no card already has a defined reading.
 */
export function deserializeDocument(text: string): Result<Document, DocumentError> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail("invalid-json");
  }

  if (!isRecord(value)) return fail("malformed-document");
  if (typeof value["version"] !== "number") return fail("malformed-document");
  if (value["version"] !== 1) return fail("unsupported-version");

  const { cards, edges } = value;
  if (!isArrayOf(cards, isCard)) return fail("malformed-document");
  if (!isArrayOf(edges, isEdge)) return fail("malformed-document");

  return { ok: true, value: { version: 1, cards, edges } };
}
