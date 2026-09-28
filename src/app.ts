import { SIMULATION_STEP_SECONDS, createSimulator } from "./simulator";
import { createAppView } from "./ui";

export function startApp(container: HTMLElement): void {
  const simulator = createSimulator({ runId: crypto.randomUUID() });
  const view = createAppView(container);
  const fixedAction = () => "drive" as const;
  let previousFrameTime: number | undefined;
  let unprocessedSeconds = 0;

  function renderFrame(frameTime: number): void {
    if (previousFrameTime !== undefined) {
      unprocessedSeconds += Math.min((frameTime - previousFrameTime) / 1000, 0.25);
      while (unprocessedSeconds >= SIMULATION_STEP_SECONDS) {
        simulator.step(fixedAction());
        unprocessedSeconds -= SIMULATION_STEP_SECONDS;
      }
    }
    previousFrameTime = frameTime;
    view.render(simulator.getSnapshot());
    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}
