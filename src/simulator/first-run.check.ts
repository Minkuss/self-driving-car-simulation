import { createSimulator } from "./index.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function driveForEightSeconds() {
  const simulator = createSimulator({ runId: "fixed-first-run" });
  const start = simulator.getSnapshot().egoCar;
  for (let step = 0; step < 480; step += 1) {
    simulator.step("drive");
  }
  return { start, end: simulator.getSnapshot() };
}

const firstRun = driveForEightSeconds();
const secondRun = driveForEightSeconds();

assert(firstRun.end.egoCar.x !== firstRun.start.x || firstRun.end.egoCar.y !== firstRun.start.y, "The car must move.");
assert(firstRun.end.egoCar.headingRadians !== firstRun.start.headingRadians, "The car must pass a turn.");
assert(JSON.stringify(firstRun.end) === JSON.stringify(secondRun.end), "A fixed run must be deterministic.");
