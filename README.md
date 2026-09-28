# Autonomous City

TypeScript city simulation with an ONNX driving policy in the browser and a
separate offline Python training workflow. The autonomous car follows visible
routes between reachable destinations and begins a new trip after arrival.

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
