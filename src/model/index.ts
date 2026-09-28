import * as ort from "onnxruntime-web";

import {
  CONTRACT_VERSION,
  policyActions,
  observationSize,
  type ModelManifest,
  type Observation,
  type PolicyAction,
} from "../contract/index.js";

ort.env.wasm.wasmPaths = "models/";

export interface DrivingPolicy {
  decide(observation: Observation): Promise<PolicyAction>;
}

export async function loadDrivingPolicy(manifest: ModelManifest): Promise<DrivingPolicy> {
  if (manifest.contractVersion !== CONTRACT_VERSION) {
    throw new Error("The model contract is incompatible with this simulator.");
  }

  const session = await ort.InferenceSession.create(manifest.modelPath);
  return {
    async decide(observation) {
      if (observation.contractVersion !== CONTRACT_VERSION) {
        throw new Error("The observation contract is incompatible with this model.");
      }

      if (observation.values.length !== observationSize || !observation.values.every(Number.isFinite)) {
        throw new Error("The observation does not match the model contract.");
      }

      const input = new ort.Tensor("float32", Float32Array.from(observation.values), [1, observation.values.length]);
      const output = await session.run({ [session.inputNames[0]]: input });
      const scores = output[session.outputNames[0]].data as Float32Array;
      const bestIndex = scores.reduce((best, score, index) => score > scores[best] ? index : best, 0);
      return policyActions[bestIndex] ?? "stop";
    },
  };
}
