import { randomUUID } from "node:crypto";

/**
 * A single to-do item. The domain model is intentionally framework-free:
 * UI, persistence, and framework concerns live outside `src/`.
 */
export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
  readonly createdAt: Date;
}

/** Create an incomplete todo with the given title. */
export function createTodo(title: string): Todo {
  return {
    id: randomUUID(),
    title,
    completed: false,
    createdAt: new Date(),
  };
}

/** Return a copy of `todo` with its `completed` flag flipped. */
export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}
