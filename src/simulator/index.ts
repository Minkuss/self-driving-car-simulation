import { CONTRACT_VERSION, type Observation, type PolicyAction } from "../contract/index.js";

export const SIMULATION_STEP_SECONDS = 1 / 60;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface EgoCarSnapshot extends Point {
  readonly headingRadians: number;
  readonly speedPixelsPerSecond: number;
}

export interface WorldSeed {
  readonly runId: string;
}

export interface WorldSnapshot {
  readonly runId: string;
  readonly elapsedSeconds: number;
  readonly egoCar: EgoCarSnapshot;
  readonly roadCenterline: readonly Point[];
}

export type WorldEvent = never;

export interface Simulator {
  getObservation(): Observation;
  step(action: PolicyAction): readonly WorldEvent[];
  getSnapshot(): WorldSnapshot;
}

const ROAD_CENTERLINE: readonly Point[] = [
  { x: 140, y: 360 }, { x: 620, y: 360 },
  { x: 660, y: 355 }, { x: 690, y: 340 }, { x: 710, y: 315 }, { x: 720, y: 280 },
  { x: 720, y: 170 }, { x: 715, y: 135 }, { x: 700, y: 105 }, { x: 675, y: 85 },
  { x: 640, y: 75 }, { x: 160, y: 75 },
  { x: 125, y: 80 }, { x: 95, y: 95 }, { x: 75, y: 120 }, { x: 65, y: 155 },
  { x: 65, y: 280 }, { x: 70, y: 315 }, { x: 85, y: 340 }, { x: 110, y: 355 },
  { x: 140, y: 360 },
];

const segmentLengths = ROAD_CENTERLINE.slice(1).map((point, index) =>
  Math.hypot(point.x - ROAD_CENTERLINE[index].x, point.y - ROAD_CENTERLINE[index].y),
);
const roadLength = segmentLengths.reduce((total, length) => total + length, 0);
const targetSpeeds: Record<PolicyAction, number> = { drive: 85, cautious: 42, stop: 0 };
const MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED = 90;

function positionOnRoad(distance: number): EgoCarSnapshot {
  let remaining = distance % roadLength;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index];
    if (remaining <= length) {
      const start = ROAD_CENTERLINE[index];
      const end = ROAD_CENTERLINE[index + 1];
      const progress = remaining / length;
      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
        headingRadians: Math.atan2(end.y - start.y, end.x - start.x),
        speedPixelsPerSecond: 0,
      };
    }
    remaining -= length;
  }

  throw new Error("Road centerline must contain a non-empty segment.");
}

export function createSimulator(seed: WorldSeed): Simulator {
  let elapsedSeconds = 0;
  let distanceAlongRoad = 0;
  let speedPixelsPerSecond = 0;

  return {
    getObservation: () => ({ contractVersion: CONTRACT_VERSION, values: [] }),
    step: (action) => {
      const targetSpeed = targetSpeeds[action];
      const speedChange = MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * SIMULATION_STEP_SECONDS;
      speedPixelsPerSecond += Math.max(-speedChange, Math.min(speedChange, targetSpeed - speedPixelsPerSecond));
      distanceAlongRoad = (distanceAlongRoad + speedPixelsPerSecond * SIMULATION_STEP_SECONDS) % roadLength;
      elapsedSeconds += SIMULATION_STEP_SECONDS;
      return [];
    },
    getSnapshot: () => ({
      runId: seed.runId,
      elapsedSeconds,
      egoCar: { ...positionOnRoad(distanceAlongRoad), speedPixelsPerSecond },
      roadCenterline: ROAD_CENTERLINE,
    }),
  };
}
