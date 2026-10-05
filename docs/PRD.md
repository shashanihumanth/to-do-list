# PRD — Card-Based To-Do App

**Author:** Humanth Shashani · **Date:** 2026-10-05 · **Status:** Draft v1

## Description

A premium, card-based to-do web app. Each card is a container of related tasks; tasks support nested sub-tasks; cards can be linked into a dependency graph. A parent cannot be marked complete until everything beneath it is done. Personal, local-only (browser storage), with JSON export/import, and light and dark themes built entirely from a pastel palette.

## Problem

People with multi-step, interdependent work can't tell what's actually finished, because a flat list lets them complete a parent before its sub-tasks are done and can't express that one task blocks another. The result is premature "done" states and duplicate entries that go unnoticed until they have to be reconciled by hand.

Not solving: collaboration, scheduling, or cross-device sync.

## Why this matters

- Real work is a graph (sub-tasks and prerequisites), but a flat list models it as an independent sequence.
- Completing a parent before its children is a false "done" that hides remaining work.
- Duplicates creep in without a guard and are later reconciled by hand — pure friction.
- It's a personal tool being built from a clean foundation, so a small, shippable v1 is the right first step.

## Success — how we'll know it's solved

1. **Completion integrity** — a task or card can never be marked complete while any sub-task or upstream card is incomplete (enforced by the model, not a soft warning).
2. **No duplicates** — no two tasks in a card share a normalized title; adding a duplicate is rejected or surfaced, never silently created.
3. **Fast entry** — a new task can be added in ≤ 2 seconds (single field + Enter), with no modal or extra confirmation.
4. **Feels premium, always legible** — every state is legible in light and dark mode using only the pastel palette, and interactions animate smoothly with no layout jump or theme flash.

## Audience

A single user (Humanth) on desktop web, reasonably usable on mobile. No accounts, no sharing.

## What it looks like

The core model in eight moving pieces:

1. **Card** — a titled container of tasks; create, edit, delete.
2. **Task** — an item in a card; add, edit, delete, complete. Titles are normalized (trim + case) to catch duplicates.
3. **Sub-task** — tasks nest into a tree (not just one level).
4. **Completion rule** — a task is completable only when its sub-tasks are complete; a card only when its tasks are.
5. **Dependency graph** — cards link with directed edges; a card can't complete until its upstream cards complete.
6. **Graph view** — cards and edges rendered as a flow chart, readable at a glance.
7. **Theme toggle** — light/dark, persisted, pastel-only, no flash on load.
8. **Animation** — add, complete, move, and theme-switch are animated and interruptible.

## Non-goals (v1)

- Accounts, login, collaboration, sharing.
- Native mobile apps.
- Reminders, notifications, calendar/due-date integration.
- Real-time sync or multi-device (local-only by design).
- Recurring tasks, free-form tags, search.

## Decisions & risks

- **Sub-task depth** — unlimited nesting, rendered with indentation.
- **Dependency cycles** — detected and rejected on connect; a card that transitively depends on itself can never complete.
- **Data durability** — JSON export/import included in v1 as the backup/move escape hatch (localStorage stays the source of truth).
