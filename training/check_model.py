"""Check that the published model starts every new long route by driving."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import onnxruntime as ort


ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_PATH = Path(__file__).with_name("examples.jsonl")
MODEL_PATH = ROOT / "public" / "models" / "first-driving-policy.onnx"


def main() -> None:
    route_starts = [
        example["observation"]
        for line in EXAMPLES_PATH.read_text().splitlines()
        if (example := json.loads(line))["action"] == "drive"
        and example["observation"][0] > 215
        and example["observation"][1] == 0
    ]
    scores = ort.InferenceSession(str(MODEL_PATH)).run(
        None, {"observation": np.asarray(route_starts, dtype=np.float32)},
    )[0]
    if not np.all(scores.argmax(axis=1) == 0):
        raise AssertionError("The published model must drive when a new long route begins.")


if __name__ == "__main__":
    main()
