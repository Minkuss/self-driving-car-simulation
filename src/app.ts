import { createSimulator } from "./simulator";
import { createAppView } from "./ui";

export function startApp(container: HTMLElement): void {
  const simulator = createSimulator({ runId: crypto.randomUUID() });
  const view = createAppView(container);
  view.render(simulator.getSnapshot());
}
