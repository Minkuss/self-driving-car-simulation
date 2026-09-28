import type { PolicyAction } from "../contract";
import type { WorldSnapshot } from "../simulator";

export interface AppView {
  render(snapshot: WorldSnapshot, policy: PolicyDisplay): void;
}

export interface PolicyDisplay {
  readonly status: string;
  readonly action?: PolicyAction;
  readonly log: readonly string[];
}

export function createAppView(container: HTMLElement): AppView {
  const title = document.createElement("h1");
  title.textContent = "Autonomous City";
  const status = document.createElement("p");
  const decisionLog = document.createElement("ol");
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 480;
  canvas.setAttribute("aria-label", "Simulation canvas");
  container.replaceChildren(title, status, canvas, decisionLog);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("Canvas 2D is unavailable.");

  return {
    render(snapshot, policy) {
      status.textContent = `Run ${snapshot.runId} · ${snapshot.elapsedSeconds.toFixed(1)} s · trips: ${snapshot.completedTrips} · destination: ${snapshot.destination.x}, ${snapshot.destination.y} · ${policy.status}${policy.action ? `: ${policy.action}` : ""}`;
      decisionLog.replaceChildren(...policy.log.map((entry) => {
        const item = document.createElement("li");
        item.textContent = entry;
        return item;
      }));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#4c566a";
      context.lineWidth = 50;
      context.beginPath();
      for (const road of snapshot.roadCenterlines) {
        road.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
      }
      context.stroke();
      context.strokeStyle = "#f6d365";
      context.lineWidth = 4;
      context.setLineDash([10, 12]);
      context.beginPath();
      snapshot.route.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#f6d365";
      context.beginPath();
      context.arc(snapshot.destination.x, snapshot.destination.y, 10, 0, Math.PI * 2);
      context.fill();
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
