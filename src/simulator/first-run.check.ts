import { createSimulator, curatedRouteIds } from "./index.js";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expertAction(values: readonly number[]): "drive" | "cautious" | "stop" {
  const [distanceToDestinationPixels, , distanceToStopLinePixels, trafficLightSignal, distanceToCrosswalkPixels, pedestrianCrosswalkPosition] = values;
  if (pedestrianCrosswalkPosition >= 0 && distanceToCrosswalkPixels >= 0) {
    return distanceToCrosswalkPixels > 160 ? "drive" : distanceToCrosswalkPixels > 45 ? "cautious" : "stop";
  }
  if (trafficLightSignal === 0 && distanceToStopLinePixels >= 0) {
    return distanceToStopLinePixels > 160 ? "drive" : distanceToStopLinePixels > 45 ? "cautious" : "stop";
  }
  return distanceToDestinationPixels > 215 ? "drive" : distanceToDestinationPixels > 10 ? "cautious" : "stop";
}

function driveForThreeMinutes() {
  const simulator = createSimulator({ runId: "fixed-continuous-routes" });
  const routeChanges: string[] = [];
  const routeStarts: string[] = [];
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
      if (event.type !== "route-selected") continue;
      routeChanges.push(event.routeId);
      const routeStart = simulator.getSnapshot();
      routeStarts.push(`${event.routeId}:${routeStart.trafficLight.signal}:${routeStart.pedestrian?.crossing[0].x ?? "none"}`);
    }
  }
  return { snapshot: simulator.getSnapshot(), routeChanges, routeStarts, travelled, largestStep };
}

function followFirstRouteWithExpert() {
  const simulator = createSimulator({ runId: "fixed-policy-run" });
  const actions = new Set<string>();
  let arrived = false;
  for (let step = 0; step < 3_000 && !arrived; step += 1) {
    const action = expertAction(simulator.getObservation().values);
    actions.add(action);
    arrived = simulator.step(action).some((event) => event.type === "arrived");
  }
  return { actions, arrived };
}

function followTrafficLightWithoutSafety() {
  const simulator = createSimulator({ runId: "deferred-traffic-light", scenario: "traffic-light-red" });
  let stoppedOnRed = false;
  let resumedOnGreen = false;
  for (let step = 0; step < 2_000; step += 1) {
    const before = simulator.getSnapshot();
    const events = simulator.step(expertAction(simulator.getObservation().values));
    const after = simulator.getSnapshot();
    assert(!events.some((event) => event.type === "safety-intervention"), "The policy must handle the deferred red signal without safety.");
    stoppedOnRed ||= before.trafficLight.signal === "red" && before.trafficLight.distanceToStopLinePixels <= 45 && after.egoCar.speedPixelsPerSecond === 0;
    resumedOnGreen ||= stoppedOnRed && after.trafficLight.signal === "green" && after.egoCar.speedPixelsPerSecond > 0;
    if (resumedOnGreen) return { stoppedOnRed, resumedOnGreen };
  }
  return { stoppedOnRed, resumedOnGreen };
}

function stopWrongPolicyAtRed() {
  const simulator = createSimulator({ runId: "wrong-policy-red", scenario: "traffic-light-red" });
  let intervention = false;
  for (let step = 0; step < 1_000; step += 1) {
    intervention ||= simulator.step("drive").some((event) => event.type === "safety-intervention");
    const snapshot = simulator.getSnapshot();
    if (snapshot.trafficLight.signal === "red") {
      assert(snapshot.trafficLight.distanceToStopLinePixels >= 0, "Safety must not permit a red stop-line crossing.");
    }
    if (intervention) return simulator.getSnapshot();
  }
  throw new Error("Safety must intervene for a wrong policy at a red signal.");
}

function followPedestrianWithoutSafety() {
  const simulator = createSimulator({ runId: "deferred-pedestrian", scenario: "pedestrian-crossing-eastbound" });
  let stoppedForPedestrian = false;
  let resumedAfterCrossing = false;
  for (let step = 0; step < 2_000; step += 1) {
    const before = simulator.getSnapshot();
    const events = simulator.step(expertAction(simulator.getObservation().values));
    const after = simulator.getSnapshot();
    assert(!events.some((event) => event.type === "safety-intervention"), "The policy must yield to the pedestrian without safety.");
    stoppedForPedestrian ||= before.pedestrian !== undefined && after.egoCar.speedPixelsPerSecond === 0;
    resumedAfterCrossing ||= stoppedForPedestrian && before.pedestrian === undefined && after.egoCar.speedPixelsPerSecond > 0;
    if (resumedAfterCrossing) return { stoppedForPedestrian, resumedAfterCrossing };
  }
  return { stoppedForPedestrian, resumedAfterCrossing };
}

function stopWrongPolicyAtPedestrian() {
  const simulator = createSimulator({ runId: "wrong-policy-pedestrian", scenario: "pedestrian-crossing-eastbound" });
  for (let step = 0; step < 2_000; step += 1) {
    const events = simulator.step("drive");
    if (events.some((event) => event.type === "safety-intervention" && event.hazard === "pedestrian")) return simulator.getSnapshot();
  }
  throw new Error("Safety must intervene for a wrong policy at an occupied crosswalk.");
}

function showsPedestrianInPublicRun() {
  const simulator = createSimulator({ runId: "public-pedestrian", scenario: "pedestrian-crossing-westbound" });
  return simulator.getSnapshot().pedestrian;
}

const firstRun = driveForThreeMinutes();
const secondRun = driveForThreeMinutes();
const policyRun = followFirstRouteWithExpert();
const trafficLightRun = followTrafficLightWithoutSafety();
const safetyRun = stopWrongPolicyAtRed();
const pedestrianRun = followPedestrianWithoutSafety();
const pedestrianSafetyRun = stopWrongPolicyAtPedestrian();
const publicPedestrian = showsPedestrianInPublicRun();
const eastboundPedestrian = createSimulator({ runId: "eastbound-pedestrian", scenario: "pedestrian-crossing-eastbound" }).getSnapshot().pedestrian;
const anotherPublicStart = createSimulator({ runId: "another-public-run" }).getSnapshot();

assert(firstRun.snapshot.roadCenterlines.length > 4, "The map must contain connected roads.");
assert(curatedRouteIds.length === 4, "The public loop must contain exactly four curated routes.");
assert(curatedRouteIds.join(",") === "traffic-light-red,traffic-light-green,pedestrian-crossing-westbound,pedestrian-crossing-eastbound", "The curated loop must cover the two traffic-light routes and both pedestrian directions.");
assert(firstRun.snapshot.routeId === "traffic-light-red" || firstRun.snapshot.routeId === "traffic-light-green" || firstRun.snapshot.routeId.startsWith("pedestrian-crossing-"), "The simulator must only select curated routes.");
assert(anotherPublicStart.routeId === "traffic-light-red", "A run ID must not select a public route.");
assert(firstRun.snapshot.completedTrips >= 3, "The car must complete multiple trips without a reset.");
assert(firstRun.routeChanges.length === firstRun.snapshot.completedTrips, "Every arrival must select a new route.");
assert(firstRun.routeChanges.slice(0, 4).join(",") === `${curatedRouteIds.slice(1).join(",")},${curatedRouteIds[0]}`, "The public run must cycle the four hand-authored routes in order.");
assert(firstRun.routeStarts.slice(0, 4).join(",") === "traffic-light-green:green:none,pedestrian-crossing-westbound:red:430,pedestrian-crossing-eastbound:red:370,traffic-light-red:red:none", "Each curated route must restart its local signal or pedestrian clock.");
assert(firstRun.travelled > 0, "The car must travel continuously rather than teleporting.");
assert(firstRun.largestStep <= 1.5, "Route changes must not teleport the car.");
assert(JSON.stringify(firstRun) === JSON.stringify(secondRun), "A fixed continuous run must be deterministic.");
assert(policyRun.actions.has("drive") && policyRun.actions.has("cautious") && policyRun.actions.has("stop"), "The policy run must change actions.");
assert(policyRun.arrived, "The policy run must arrive after stopping at the destination.");
assert(trafficLightRun.stoppedOnRed && trafficLightRun.resumedOnGreen, "The deferred scenario must stop on red then resume on green.");
assert(safetyRun.safetyInterventions > 0, "Safety interventions must be counted separately.");
assert(pedestrianRun.stoppedForPedestrian && pedestrianRun.resumedAfterCrossing, "The deferred scenario must yield then resume after the pedestrian clears the crosswalk.");
assert(pedestrianSafetyRun.safetyInterventions > 0, "Pedestrian safety interventions must be counted separately.");
assert(publicPedestrian !== undefined, "The public run must show a crossing pedestrian.");
assert(eastboundPedestrian !== undefined && publicPedestrian.crossing[0].x !== eastboundPedestrian.crossing[0].x, "The curated routes must cover pedestrian crossings in opposite directions.");
