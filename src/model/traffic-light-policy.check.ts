import { CONTRACT_VERSION } from "../contract/index.js";
import { createSimulator } from "../simulator/index.js";
import * as ort from "onnxruntime-web";
import { loadDrivingPolicy } from "./index.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

ort.env.wasm.wasmPaths = new URL("../../node_modules/onnxruntime-web/dist/", import.meta.url).pathname;
const policy = await loadDrivingPolicy({
  contractVersion: CONTRACT_VERSION,
  modelVersion: "traffic-light-policy-v2",
  modelPath: "public/models/first-driving-policy.onnx",
});
const simulator = createSimulator({ runId: "published-traffic-light", scenario: "traffic-light-red" });
let stoppedOnRed = false;
let resumedOnGreen = false;
for (let step = 0; step < 2_000; step += 1) {
  const before = simulator.getSnapshot();
  const action = await policy.decide(simulator.getObservation());
  const events = simulator.step(action);
  const after = simulator.getSnapshot();
  assert(!events.some((event) => event.type === "safety-intervention"), `The published model must not need safety at the red signal (${action}, ${before.trafficLight.distanceToStopLinePixels}).`);
  stoppedOnRed ||= before.trafficLight.signal === "red" && before.trafficLight.distanceToStopLinePixels <= 45 && after.egoCar.speedPixelsPerSecond === 0;
  resumedOnGreen ||= stoppedOnRed && after.trafficLight.signal === "green" && after.egoCar.speedPixelsPerSecond > 0;
  if (resumedOnGreen) break;
}
assert(stoppedOnRed && resumedOnGreen, "The published model must stop on red then resume on green.");
