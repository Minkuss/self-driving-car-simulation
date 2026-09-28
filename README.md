# Autonomous City

TypeScript city simulation with an ONNX driving policy in the browser and a
separate offline Python training workflow. The autonomous car continuously
cycles four visible, hand-authored routes: red-stop-then-green, green
permission, and pedestrian crossings in both directions. Routes are validated
against the map but are never randomly selected or searched at runtime. Add a
new road event only with paired route variants, focused checks, and
TypeScript-generated training examples.

## Supported versions

- Node.js `20.19.3` (see `.nvmrc`), npm `11.4.2`
- Python `3.11.9` (see `.python-version`)

## Web application

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm run check:simulator
npm run build
```

The app uses native Canvas 2D. `src/simulator` owns world behavior,
`src/model` runs the published ONNX policy through ONNX Runtime Web,
`src/contract` owns the versioned TypeScript/Python contract, and `src/ui`
only renders snapshots.

## Training

Follow [the training setup](training/README.md). Generated datasets, logs,
temporary weights and browser build output are ignored. The published ONNX
model, manifest and required WASM runtime in `public/models/` are source
artifacts and must be committed.
