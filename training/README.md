# Offline training

This directory is intentionally separate from the browser application. It
reads JSON Lines examples exported by the TypeScript simulator and exports the
published ONNX model plus its manifest to `public/models/`.

`requirements.txt` pins the complete dependency closure resolved for Python
3.11.9; regenerate it deliberately when changing training dependencies.

Create a reproducible local environment from the repository root:

```sh
python3.11 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r training/requirements.txt
python training/check_imports.py
npm run generate:training
python training/train.py
python training/check_model.py
```

`training/examples.jsonl` is generated for the training run and ignored by
Git. Commit the resulting ONNX model, manifest and required WASM runtime in
`public/models/`.
