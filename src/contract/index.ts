export const CONTRACT_VERSION = "1" as const;

export const policyActions = ["drive", "cautious", "stop"] as const;
export type PolicyAction = (typeof policyActions)[number];

/** Ordered feature vector shared by the simulator, trainer, and published model. */
export interface Observation {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly values: readonly number[];
}

export interface TrainingExample {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly runId: string;
  readonly observation: readonly number[];
  readonly action: PolicyAction;
}

export interface ModelManifest {
  readonly contractVersion: typeof CONTRACT_VERSION;
  readonly modelVersion: string;
  readonly modelPath: string;
}
