# Card and Task are two distinct types

The domain models work as two separate entity types: a **Card** is a top-level container that participates in the dependency graph, and a **Task** is a recursive item nested inside a card. We chose two types over a single recursive "item" type because edges and nesting live at different layers — edges connect cards only, nesting is tasks only — and keeping them distinct stops "card" and "task" from collapsing into ambiguity in both the model and the UI.
