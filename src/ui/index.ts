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
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Canvas 2D is unavailable.");
  }

  return {
    render(snapshot) {
      status.textContent = `Run ${snapshot.runId} · ${snapshot.elapsedSeconds.toFixed(1)} s · fixed action: drive`;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#4c566a";
      context.lineWidth = 50;
      context.beginPath();
      snapshot.roadCenterline.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
      context.strokeStyle = "#f6d365";
      context.lineWidth = 3;
      context.setLineDash([10, 12]);
      context.stroke();
      context.setLineDash([]);
      context.save();
      context.translate(snapshot.egoCar.x, snapshot.egoCar.y);
      context.rotate(snapshot.egoCar.headingRadians);
      context.fillStyle = "#4f8cff";
      context.fillRect(-16, -9, 32, 18);
      context.fillStyle = "#d9efff";
      context.fillRect(2, -6, 9, 12);
      context.restore();
    },
  };
}
