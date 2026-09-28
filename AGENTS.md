## Agent skills

### Issue tracker

Issues are local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a single-context domain-doc layout. See `docs/agents/domain.md`.

## Project rules

- Read `CONTEXT.md` and the relevant spec before changing behavior. Implement agreed requirements without redesigning them.
- Keep one web app and a separate offline training workflow. UI presents state; the TypeScript simulator owns world behavior; Python trains and exports the model. The simulator must not depend on browser APIs, UI, ONNX, or Python.
- Put each new feature in its owning layer. Prefer small cohesive modules, one source of truth for domain logic, and explicit data flow over speculative abstractions or global mutable state.
- Keep one versioned contract for model observations and actions. Generate training examples with the TypeScript simulator; do not duplicate simulation rules in Python.
- The public run must use the four hand-authored cyclic demonstration routes in the simulator, never random `runId` selection, random destinations, or runtime graph search. Each route owns its local event clock so red/green and pedestrian timing repeat after every cycle. When adding a road event or scenario, add its paired curated routes for both relevant directions or variants, plus simulator/model checks and generated training coverage.
- Use strict TypeScript and type hints at Python data boundaries. Name units, thresholds, and physical constants explicitly.
- Write code comments in English. Explain non-obvious formulas, invariants, coordinate systems, and reasons for decisions; do not narrate obvious code.
- Test non-trivial behavior at the highest useful seam and check the TypeScript/Python/ONNX contracts. Scale tests to risk; trivial UI changes need no new tests.
- Keep generated datasets, training logs, and temporary weights out of the repository. In particular, `training/examples.jsonl` is ignored. Preserve reproducible generation/training settings and commit the published ONNX model, manifest and required WASM runtime in `public/models/`.
- Explore the repository narrowly. Do not spawn subagents, commit, or push unless explicitly requested.
