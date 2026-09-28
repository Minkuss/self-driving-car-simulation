"""Check that the published model starts a long route by driving."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import onnxruntime as ort


ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "public" / "models" / "first-driving-policy.onnx"


def main() -> None:
    scores = ort.InferenceSession(str(MODEL_PATH)).run(
        None, {"observation": np.asarray([[500, 0, 400, 0, -1, -1, 0]], dtype=np.float32)},
    )[0]
    if int(scores.argmax(axis=1)[0]) != 0:
        raise AssertionError("The published model must drive when the red signal is still far away.")


if __name__ == "__main__":
    main()
