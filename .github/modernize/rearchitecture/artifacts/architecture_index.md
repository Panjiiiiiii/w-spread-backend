# Implementation Guide

This index is not the full contract. Implementation agents must read the listed per-unit artifacts and apply the relevant global rows before changing code.

## Units

Each unit has `behavior.yaml`, `bindings.yaml`, and `unit_decomposition.yaml` under `units/<unit>/`.

- `health-check`: preserve the health response and no-database behavior.
- `user-list`: preserve descending creation order and selected public fields.
- `user-read`: preserve 404 behavior and selected public fields.
- `user-create`: preserve required email validation and duplicate-email rejection.
- `user-delete`: preserve existence validation and deletion semantics.

## Global filtering

- Read `unit_graph.yaml` for source anchors, signatures, dependencies, and shared references.
- Read only `shared_modules.yaml` rows whose names appear in a unit's `shared_refs`.
- Apply all `wire_contracts.yaml` rows for REST response and route-prefix stability.
- Apply `cross_unit_state.yaml` when changing database client lifecycle.

## Completion evidence

Report changed source locations, preserved response/error semantics, Prisma validation, and targeted build results.
