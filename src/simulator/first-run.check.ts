import { createSimulator } from "./index.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expertAction(distanceToDestinationPixels: number): "drive" | "cautious" | "stop" {
  return distanceToDestinationPixels > 215 ? "drive" : distanceToDestinationPixels > 10 ? "cautious" : "stop";
}

function driveForThreeMinutes() {
  const simulator = createSimulator({ runId: "fixed-continuous-routes" });
  const routeChanges: string[] = [];
  let travelled = 0;
  let largestStep = 0;
  for (let step = 0; step < 180 * 60; step += 1) {
    const before = simulator.getSnapshot();
    const events = simulator.step("drive");
    const after = simulator.getSnapshot();
    const stepDistance = Math.hypot(after.egoCar.x - before.egoCar.x, after.egoCar.y - before.egoCar.y);
    travelled += stepDistance;
    largestStep = Math.max(largestStep, stepDistance);
    for (const event of events) {
      if (event.type === "route-selected") routeChanges.push(`${event.destination.x}:${event.destination.y}`);
    }
  }
  return { snapshot: simulator.getSnapshot(), routeChanges, travelled, largestStep };
}

function followFirstRouteWithExpert() {
  const simulator = createSimulator({ runId: "fixed-policy-run" });
  const actions = new Set<string>();
  let arrived = false;
  for (let step = 0; step < 3_000 && !arrived; step += 1) {
    const [distance] = simulator.getObservation().values;
    const action = expertAction(distance);
    actions.add(action);
    arrived = simulator.step(action).some((event) => event.type === "arrived");
  }
  return { actions, arrived };
}

const firstRun = driveForThreeMinutes();
const secondRun = driveForThreeMinutes();
const policyRun = followFirstRouteWithExpert();

assert(firstRun.snapshot.roadCenterlines.length > 4, "The map must contain connected roads.");
assert(firstRun.snapshot.completedTrips >= 3, "The car must complete multiple trips without a reset.");
assert(firstRun.routeChanges.length === firstRun.snapshot.completedTrips, "Every arrival must select a new route.");
assert(firstRun.travelled > 0, "The car must travel continuously rather than teleporting.");
assert(firstRun.largestStep <= 1.5, "Route changes must not teleport the car.");
assert(JSON.stringify(firstRun) === JSON.stringify(secondRun), "A fixed continuous run must be deterministic.");
assert(policyRun.actions.has("drive") && policyRun.actions.has("cautious") && policyRun.actions.has("stop"), "The policy run must change actions.");
assert(policyRun.arrived, "The policy run must arrive after stopping at the destination.");
