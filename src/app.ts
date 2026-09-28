import { type ModelManifest } from "./contract";
import { loadDrivingPolicy, type DrivingPolicy } from "./model";
import { SIMULATION_STEP_SECONDS, createSimulator } from "./simulator";
import { createAppView, type PolicyDisplay } from "./ui";

async function loadPublishedPolicy(): Promise<DrivingPolicy> {
  const response = await fetch("models/policy-manifest.json");
  if (!response.ok) throw new Error(`Model manifest could not be loaded (${response.status}).`);
  return loadDrivingPolicy(await response.json() as ModelManifest);
}

export async function startApp(container: HTMLElement): Promise<void> {
  const simulator = createSimulator({ runId: "public-demo" });
  const view = createAppView(container);
  let policyDisplay: PolicyDisplay = { status: "Loading driving policy", log: [] };
  let policy: DrivingPolicy;
  try {
    policy = await loadPublishedPolicy();
    policyDisplay = { status: "Driving policy", log: [] };
  } catch (error) {
    policyDisplay = { status: `Driving policy unavailable: ${error instanceof Error ? error.message : String(error)}`, log: [] };
    view.render(simulator.getSnapshot(), policyDisplay);
    return;
  }
  let previousFrameTime: number | undefined;
  let unprocessedSeconds = 0;
  let deciding = false;

  function decideAndStep(): void {
    deciding = true;
    const observation = simulator.getObservation();
    void policy.decide(observation).then((action) => {
      const snapshot = simulator.getSnapshot();
      const previousAction = policyDisplay.action;
      const events = simulator.step(action);
      const safetyEvent = events.find((event) => event.type === "safety-intervention");
      const safetyLog = safetyEvent !== undefined
        ? [`${snapshot.elapsedSeconds.toFixed(1)} s · safety intervention · ${safetyEvent.hazard === "red-signal" ? "red signal" : "pedestrian"}`]
        : [];
      policyDisplay = {
        status: "Driving policy",
        action,
        log: previousAction === action
          ? [...safetyLog, ...policyDisplay.log].slice(0, 6)
          : [`${snapshot.elapsedSeconds.toFixed(1)} s · ${action} · ${snapshot.pedestrian === undefined ? `signal ${snapshot.trafficLight.signal}` : "pedestrian crossing"}`, ...safetyLog, ...policyDisplay.log].slice(0, 6),
      };
      unprocessedSeconds -= SIMULATION_STEP_SECONDS;
      deciding = false;
    }).catch((error: unknown) => {
      policyDisplay = { ...policyDisplay, status: `Driving policy failed: ${error instanceof Error ? error.message : String(error)}` };
    });
  }

  function renderFrame(frameTime: number): void {
    if (previousFrameTime !== undefined) {
      unprocessedSeconds += Math.min((frameTime - previousFrameTime) / 1000, 0.25);
      if (unprocessedSeconds >= SIMULATION_STEP_SECONDS && !deciding) decideAndStep();
    }
    previousFrameTime = frameTime;
    view.render(simulator.getSnapshot(), policyDisplay);
    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}
