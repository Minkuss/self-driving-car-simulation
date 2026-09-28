import { CONTRACT_VERSION, type PolicyAction, type TrainingExample } from "../contract/index.js";
import { createSimulator } from "./index.js";

declare const process: {
  readonly argv: readonly string[];
  readonly stdout: { write(value: string): void };
};

function expertAction(values: readonly number[]): PolicyAction {
  const [distanceToDestinationPixels, , distanceToStopLinePixels, trafficLightSignal] = values;
  if (trafficLightSignal === 0 && distanceToStopLinePixels >= 0) {
    return distanceToStopLinePixels > 160 ? "drive" : distanceToStopLinePixels > 45 ? "cautious" : "stop";
  }
  return distanceToDestinationPixels > 215 ? "drive" : distanceToDestinationPixels > 10 ? "cautious" : "stop";
}

export function createTrainingExamples(runCount = 8): readonly TrainingExample[] {
  const examples: TrainingExample[] = [];
  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    const simulator = createSimulator({
      runId: `training-${runIndex}`,
      ...(runIndex % 2 === 0 ? { scenario: "traffic-light-red" as const } : {}),
    });
    for (let step = 0; step < 3_000; step += 1) {
      const observation = simulator.getObservation();
      if (!observation.values.every(Number.isFinite)) {
        throw new Error("Training observations must be numeric.");
      }
      const action = expertAction(observation.values);
      examples.push({
        contractVersion: CONTRACT_VERSION,
        runId: `training-${runIndex}`,
        initialState: { runId: `training-${runIndex}` },
        observation: observation.values,
        action,
      });
      simulator.step(action);
      const snapshot = simulator.getSnapshot();
      if (snapshot.distanceToDestinationPixels === 0 && snapshot.egoCar.speedPixelsPerSecond === 0) break;
    }
  }
  return examples;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(createTrainingExamples().map((example) => JSON.stringify(example)).join("\n") + "\n");
}
