import type { WorldSnapshot } from "../simulator";

export interface AppView {
  render(snapshot: WorldSnapshot): void;
}

export function createAppView(container: HTMLElement): AppView {
  const title = document.createElement("h1");
  title.textContent = "Autonomous City";
  const status = document.createElement("p");
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 480;
  canvas.setAttribute("aria-label", "Simulation canvas");
  container.replaceChildren(title, status, canvas);

  return {
    render(snapshot) {
      status.textContent = `Run ${snapshot.runId} · ${snapshot.elapsedSeconds.toFixed(0)} s`;
    },
  };
}
