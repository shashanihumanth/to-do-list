import { describe, expect, it } from "vitest";

import { createTodo, toggleTodo } from "../src/todo.js";

describe("createTodo", () => {
  it("creates an incomplete todo with the given title", () => {
    const todo = createTodo("Buy milk");

    expect(todo.title).toBe("Buy milk");
    expect(todo.completed).toBe(false);
    expect(todo.id).toBeTruthy();
    expect(todo.createdAt).toBeInstanceOf(Date);
  });

  it("assigns a unique id per todo", () => {
    expect(createTodo("a").id).not.toBe(createTodo("b").id);
  });
});

describe("toggleTodo", () => {
  it("flips completed without mutating the original", () => {
    const todo = createTodo("Buy milk");

    const toggled = toggleTodo(todo);

    expect(toggled.completed).toBe(true);
    expect(todo.completed).toBe(false);
  });
});
