import { CONTRACT_VERSION, type Observation, type PolicyAction } from "../contract";

export interface WorldSeed {
  readonly runId: string;
}

export interface WorldSnapshot {
  readonly runId: string;
  readonly elapsedSeconds: number;
}

export type WorldEvent = never;

export interface Simulator {
  getObservation(): Observation;
  step(action: PolicyAction): readonly WorldEvent[];
  getSnapshot(): WorldSnapshot;
}

export function createSimulator(seed: WorldSeed): Simulator {
  let elapsedSeconds = 0;

  return {
    getObservation: () => ({ contractVersion: CONTRACT_VERSION, values: [] }),
    step: () => {
      elapsedSeconds += 0;
      return [];
    },
    getSnapshot: () => ({ runId: seed.runId, elapsedSeconds }),
  };
}
