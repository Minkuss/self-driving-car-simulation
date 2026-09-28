# Autonomous City

Static TypeScript web shell and separate offline Python training workflow for
the Autonomous City MVP. The current milestone provides project boundaries;
it deliberately contains no road behavior.

## Supported versions

- Node.js `20.19.3` (see `.nvmrc`), npm `11.4.2`
- Python `3.11.9` (see `.python-version`)

## Web application

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm run build
```

The web shell uses native Canvas 2D. `src/simulator` owns world behavior,
`src/model` isolates ONNX Runtime Web, `src/contract` owns the versioned
TypeScript/Python contract, and `src/ui` only renders snapshots.

## Training

Follow [the training setup](training/README.md). Generated datasets, logs,
temporary weights and browser build output are ignored. Future published model
and manifest files belong in `public/models/`.
