"""Train and export the small browser driving-policy model."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import onnx
import onnxruntime as ort
import torch
from torch import Tensor, nn


ROOT = Path(__file__).resolve().parent.parent
CONTRACT_PATH = ROOT / "src" / "contract" / "policy-contract.json"
EXAMPLES_PATH = Path(__file__).with_name("examples.jsonl")
MODELS_PATH = ROOT / "public" / "models"
ACTION_INDEX = {"drive": 0, "cautious": 1, "stop": 2}


class Policy(nn.Module):
    def __init__(self, mean: Tensor, scale: Tensor) -> None:
        super().__init__()
        self.register_buffer("mean", mean)
        self.register_buffer("scale", scale)
        self.network = nn.Sequential(nn.Linear(7, 8), nn.ReLU(), nn.Linear(8, 3))

    def forward(self, observation: Tensor) -> Tensor:
        return self.network((observation - self.mean) / self.scale)


def read_examples(contract: dict[str, Any]) -> tuple[Tensor, Tensor]:
    observations: list[list[float]] = []
    actions: list[int] = []
    for line in EXAMPLES_PATH.read_text().splitlines():
        example = json.loads(line)
        values = example.get("observation")
        if (
            example.get("contractVersion") != contract["version"]
            or not isinstance(example.get("initialState"), dict)
            or example["initialState"].get("runId") != example.get("runId")
            or not isinstance(values, list)
            or len(values) != len(contract["observations"])
            or not all(isinstance(value, (int, float)) and not isinstance(value, bool) and float("-inf") < value < float("inf") for value in values)
            or example.get("action") not in ACTION_INDEX
        ):
            raise ValueError("Invalid training example.")
        observations.append([float(value) for value in values])
        actions.append(ACTION_INDEX[example["action"]])
    return torch.tensor(observations), torch.tensor(actions)


def main() -> None:
    contract = json.loads(CONTRACT_PATH.read_text())
    observations, actions = read_examples(contract)
    torch.manual_seed(0)
    mean = observations.mean(dim=0)
    scale = observations.std(dim=0).clamp_min(1)
    model = Policy(mean, scale)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.03)
    # Yielding and red-light stopping are less frequent than driving, so balance labels instead of teaching a drive-only policy.
    class_weights = actions.bincount(minlength=3).sum() / (3 * actions.bincount(minlength=3).clamp_min(1))
    for _ in range(5_000):
        optimizer.zero_grad()
        loss = nn.functional.cross_entropy(model(observations), actions, weight=class_weights)
        loss.backward()
        optimizer.step()

    MODELS_PATH.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_PATH / "first-driving-policy.onnx"
    torch.onnx.export(
        model,
        torch.zeros(1, observations.shape[1]),
        model_path,
        input_names=["observation"],
        output_names=["actionScores"],
        dynamic_axes={"observation": {0: "batch"}, "actionScores": {0: "batch"}},
        opset_version=17,
    )
    onnx.checker.check_model(model_path)
    held_out_observations = observations[-32:]
    with torch.no_grad():
        pytorch_actions = model(held_out_observations).argmax(dim=1)
    onnx_scores = ort.InferenceSession(str(model_path)).run(None, {"observation": held_out_observations.numpy()})[0]
    if not torch.equal(pytorch_actions, torch.tensor(onnx_scores).argmax(dim=1)):
        raise RuntimeError("PyTorch and ONNX selected different actions.")
    (MODELS_PATH / "policy-manifest.json").write_text(json.dumps({
        "contractVersion": contract["version"],
        "modelVersion": "curated-routes-policy-v4",
        "modelPath": "models/first-driving-policy.onnx",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
