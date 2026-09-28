import { CONTRACT_VERSION } from "../contract/index.js";
import { createSimulator, type CuratedRouteId } from "../simulator/index.js";
import * as ort from "onnxruntime-web";
import { loadDrivingPolicy } from "./index.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

ort.env.wasm.wasmPaths = new URL("../../node_modules/onnxruntime-web/dist/", import.meta.url).pathname;
const policy = await loadDrivingPolicy({
  contractVersion: CONTRACT_VERSION,
  modelVersion: "curated-routes-policy-v4",
  modelPath: "public/models/first-driving-policy.onnx",
});
async function checkPedestrianRoute(scenario: CuratedRouteId): Promise<void> {
  const simulator = createSimulator({ runId: `held-out-${scenario}`, scenario });
  let stoppedForPedestrian = false;
  let resumedAfterCrossing = false;
  for (let step = 0; step < 2_000; step += 1) {
    const before = simulator.getSnapshot();
    const action = await policy.decide(simulator.getObservation());
    const events = simulator.step(action);
    const after = simulator.getSnapshot();
    assert(!events.some((event) => event.type === "safety-intervention"), `The published model must not need pedestrian safety (${action}).`);
    stoppedForPedestrian ||= before.pedestrian !== undefined && after.egoCar.speedPixelsPerSecond === 0;
    resumedAfterCrossing ||= stoppedForPedestrian && before.pedestrian === undefined && after.egoCar.speedPixelsPerSecond > 0;
    if (resumedAfterCrossing) break;
  }
  assert(stoppedForPedestrian && resumedAfterCrossing, `The published model must yield then resume on ${scenario}.`);
}

await checkPedestrianRoute("pedestrian-crossing-eastbound");
await checkPedestrianRoute("pedestrian-crossing-westbound");
