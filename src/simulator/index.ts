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
  readonly roadCenterlines: readonly (readonly Point[])[];
  readonly route: readonly Point[];
  readonly destination: Point;
  readonly completedTrips: number;
  readonly distanceToDestinationPixels: number;
}

export type WorldEvent =
  | { readonly type: "arrived"; readonly destination: Point }
  | { readonly type: "route-selected"; readonly destination: Point };

export interface Simulator {
  getObservation(): Observation;
  step(action: PolicyAction): readonly WorldEvent[];
  getSnapshot(): WorldSnapshot;
}

interface MapNode extends Point {
  readonly id: string;
}

const MAP_NODES: readonly MapNode[] = [
  { id: "north-west", x: 140, y: 100 },
  { id: "north", x: 400, y: 100 },
  { id: "north-east", x: 660, y: 100 },
  { id: "south-west", x: 140, y: 360 },
  { id: "south", x: 400, y: 360 },
  { id: "south-east", x: 660, y: 360 },
];
const ROAD_CONNECTIONS: readonly (readonly [string, string])[] = [
  ["north-west", "north"], ["north", "north-east"], ["south-west", "south"], ["south", "south-east"],
  ["north-west", "south-west"], ["north", "south"], ["north-east", "south-east"],
];
const nodesById = new Map(MAP_NODES.map((node) => [node.id, node]));
const ROAD_CENTERLINES = ROAD_CONNECTIONS.map(([startId, endId]) => [nodesById.get(startId)!, nodesById.get(endId)!]);
const targetSpeeds: Record<PolicyAction, number> = { drive: 85, cautious: 42, stop: 0 };
const MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED = 90;
const TURN_RADIUS_PIXELS = 28;

function distance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function pathBetween(startId: string, destinationId: string): readonly MapNode[] {
  const previous = new Map<string, string>([[startId, ""]]);
  const pending = [startId];
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    if (current === destinationId) break;
    for (const [first, second] of ROAD_CONNECTIONS) {
      const neighbour = first === current ? second : second === current ? first : undefined;
      if (neighbour !== undefined && !previous.has(neighbour)) {
        previous.set(neighbour, current);
        pending.push(neighbour);
      }
    }
  }
  if (!previous.has(destinationId)) throw new Error("Destination must be reachable by road.");
  const route: MapNode[] = [];
  for (let current = destinationId; current !== ""; current = previous.get(current)!) {
    route.unshift(nodesById.get(current)!);
  }
  return route;
}

function smoothRoute(nodes: readonly Point[]): readonly Point[] {
  if (nodes.length < 3) return nodes;
  const route: Point[] = [nodes[0]];
  for (let index = 1; index < nodes.length - 1; index += 1) {
    const previous = nodes[index - 1];
    const corner = nodes[index];
    const next = nodes[index + 1];
    const before = Math.min(TURN_RADIUS_PIXELS, distance(previous, corner) / 2);
    const after = Math.min(TURN_RADIUS_PIXELS, distance(corner, next) / 2);
    const entry = {
      x: corner.x + (previous.x - corner.x) * (before / distance(previous, corner)),
      y: corner.y + (previous.y - corner.y) * (before / distance(previous, corner)),
    };
    const exit = {
      x: corner.x + (next.x - corner.x) * (after / distance(corner, next)),
      y: corner.y + (next.y - corner.y) * (after / distance(corner, next)),
    };
    route.push(entry, { x: (entry.x + corner.x * 2 + exit.x) / 4, y: (entry.y + corner.y * 2 + exit.y) / 4 }, exit);
  }
  route.push(nodes[nodes.length - 1]);
  return route;
}

function routeLength(route: readonly Point[]): number {
  return route.slice(1).reduce((total, point, index) => total + distance(route[index], point), 0);
}

function positionOnRoute(route: readonly Point[], routeDistance: number): EgoCarSnapshot {
  let remaining = Math.min(routeDistance, routeLength(route));
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const length = distance(start, end);
    if (remaining <= length) {
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
  const destination = route[route.length - 1];
  const previous = route[route.length - 2];
  return {
    ...destination,
    headingRadians: Math.atan2(destination.y - previous.y, destination.x - previous.x),
    speedPixelsPerSecond: 0,
  };
}

function seededIndex(seed: string, selection: number, count: number): number {
  let value = selection + 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    value = Math.imul(value ^ seed.charCodeAt(index), 0x01000193);
  }
  return (value >>> 0) % count;
}

export function createSimulator(seed: WorldSeed): Simulator {
  let elapsedSeconds = 0;
  let speedPixelsPerSecond = 0;
  let completedTrips = 0;
  let selection = 0;
  let currentNodeId = "south-west";
  let destinationId = MAP_NODES[seededIndex(seed.runId, selection, MAP_NODES.length)].id;
  if (destinationId === currentNodeId) destinationId = "north-east";
  let route = smoothRoute(pathBetween(currentNodeId, destinationId));
  let distanceAlongRoute = 0;

  function selectNextRoute(): void {
    currentNodeId = destinationId;
    selection += 1;
    const candidates = MAP_NODES.filter((node) => node.id !== currentNodeId);
    destinationId = candidates[seededIndex(seed.runId, selection, candidates.length)].id;
    route = smoothRoute(pathBetween(currentNodeId, destinationId));
    distanceAlongRoute = 0;
  }

  return {
    getObservation: () => ({
      contractVersion: CONTRACT_VERSION,
      values: [Math.max(0, routeLength(route) - distanceAlongRoute), speedPixelsPerSecond],
    }),
    step: (action) => {
      const remainingDistance = Math.max(0, routeLength(route) - distanceAlongRoute);
      const targetSpeed = Math.min(
        targetSpeeds[action],
        Math.sqrt(2 * MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * remainingDistance),
      );
      const speedChange = MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * SIMULATION_STEP_SECONDS;
      speedPixelsPerSecond += Math.max(-speedChange, Math.min(speedChange, targetSpeed - speedPixelsPerSecond));
      distanceAlongRoute = Math.min(routeLength(route), distanceAlongRoute + speedPixelsPerSecond * SIMULATION_STEP_SECONDS);
      elapsedSeconds += SIMULATION_STEP_SECONDS;
      const distanceToDestination = routeLength(route) - distanceAlongRoute;
      if (distanceToDestination > 1 || speedPixelsPerSecond !== 0) return [];
      distanceAlongRoute = routeLength(route);
      const arrivedAt = nodesById.get(destinationId)!;
      completedTrips += 1;
      selectNextRoute();
      return [
        { type: "arrived", destination: arrivedAt },
        { type: "route-selected", destination: nodesById.get(destinationId)! },
      ];
    },
    getSnapshot: () => ({
      runId: seed.runId,
      elapsedSeconds,
      egoCar: { ...positionOnRoute(route, distanceAlongRoute), speedPixelsPerSecond },
      roadCenterlines: ROAD_CENTERLINES,
      route,
      destination: nodesById.get(destinationId)!,
      completedTrips,
      distanceToDestinationPixels: Math.max(0, routeLength(route) - distanceAlongRoute),
    }),
  };
}
