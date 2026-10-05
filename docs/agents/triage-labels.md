# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Priority

A triaged issue carries exactly one priority label, set after category and state.

| Label | Meaning |
| ----- | ------- |
| `P0`  | Critical — data loss, security, crash loop |
| `P1`  | High — major feature broken, no workaround |
| `P2`  | Medium — degraded but a workaround exists |
| `P3`  | Low — cosmetic, nice to have |
| `P4`  | Best-effort — we will get to it when we get to it |

Priority is judged by impact on users, never from the reporter's tone. A `bug` without a reproduction stays `needs-info` and unprioritised. Enhancements take `P3` (planned) or `P4` (wish list).

## Area

A triaged issue may carry an `area/<name>` label identifying the affected part of the system, added as areas emerge. There are no `area/*` labels yet — create one only when two or more issues need it.

## Category

`bug` and `enhancement` are applied by the issue form or `/triage`.
