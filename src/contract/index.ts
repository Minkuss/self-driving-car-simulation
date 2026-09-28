import policyContract from "./policy-contract.json" with { type: "json" };

export const CONTRACT_VERSION = policyContract.version;

export type PolicyAction = "drive" | "cautious" | "stop";
export const policyActions: readonly PolicyAction[] = policyContract.actions as PolicyAction[];
export const observationSize = policyContract.observations.length;

/** Ordered feature vector shared by the simulator, trainer, and published model. */
export interface Observation {
  readonly contractVersion: string;
  readonly values: readonly number[];
}

export interface TrainingExample {
  readonly contractVersion: string;
  readonly runId: string;
  readonly initialState: { readonly runId: string; readonly scenario?: string };
  readonly observation: readonly number[];
  readonly action: PolicyAction;
}

export interface ModelManifest {
  readonly contractVersion: string;
  readonly modelVersion: string;
  readonly modelPath: string;
}
