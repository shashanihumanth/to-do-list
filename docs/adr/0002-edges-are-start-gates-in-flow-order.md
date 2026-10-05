# Edges are start-gates in flow order, not completion dependencies

A dependency edge "A → B" points in flow order and means A is B's prerequisite: B cannot *start* (and is read-only) until A completes, transitively. We chose start-gate/predecessor semantics over the more conventional completion-gate ("B can't be marked done until A is done") because the product is a flowchart-style pipeline where one step literally cannot begin until the previous step finishes. This inverts the direction and meaning a reader would assume from the word "dependency", so it is recorded here deliberately.
