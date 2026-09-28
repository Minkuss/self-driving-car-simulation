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

export type TrafficLightSignal = "red" | "green";

export interface StopLineSnapshot {
  readonly start: Point;
  readonly end: Point;
}

export interface TrafficLightSnapshot {
  readonly signal: TrafficLightSignal;
  readonly stopLine?: StopLineSnapshot;
  readonly distanceToStopLinePixels: number;
}

export interface WorldSeed {
  readonly runId: string;
  readonly scenario?: "traffic-light-red" | "traffic-light-green";
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
  readonly trafficLight: TrafficLightSnapshot;
  readonly safetyInterventions: number;
}

export type WorldEvent =
  | { readonly type: "arrived"; readonly destination: Point }
  | { readonly type: "route-selected"; readonly destination: Point }
  | { readonly type: "safety-intervention"; readonly signal: TrafficLightSignal };

export interface Simulator {
  getObservation(): Observation;
  step(action: PolicyAction): readonly WorldEvent[];
  getSnapshot(): WorldSnapshot;
}

interface MapNode extends Point {
  readonly id: string;
}

interface RouteData {
  readonly points: readonly Point[];
  readonly stopLine?: StopLineSnapshot;
  readonly stopLineDistance?: number;
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
const STOP_LINE_OFFSET_PIXELS = 42;
const TRAFFIC_LIGHT_PHASE_SECONDS = 7;

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

function distanceAlongRouteAt(route: readonly Point[], point: Point): number {
  // Project map geometry onto the smoothed route so the car and stop line share one distance coordinate system.
  let travelled = 0;
  let closestDistance = Infinity;
  let closestProgress = 0;
  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const length = distance(start, end);
    const projection = Math.max(0, Math.min(1,
      ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) / (length * length),
    ));
    const projected = {
      x: start.x + (end.x - start.x) * projection,
      y: start.y + (end.y - start.y) * projection,
    };
    if (distance(point, projected) < closestDistance) {
      closestDistance = distance(point, projected);
      closestProgress = travelled + length * projection;
    }
    travelled += length;
  }
  return closestProgress;
}

function routeData(nodes: readonly MapNode[]): RouteData {
  const points = smoothRoute(nodes);
  for (let index = 1; index < nodes.length; index += 1) {
    const controlledNode = nodes[index];
    if (controlledNode.id !== "north" && controlledNode.id !== "south") continue;
    const previous = nodes[index - 1];
    const length = distance(previous, controlledNode);
    const unit = {
      x: (controlledNode.x - previous.x) / length,
      y: (controlledNode.y - previous.y) / length,
    };
    const center = {
      x: controlledNode.x - unit.x * STOP_LINE_OFFSET_PIXELS,
      y: controlledNode.y - unit.y * STOP_LINE_OFFSET_PIXELS,
    };
    const perpendicular = { x: -unit.y * 15, y: unit.x * 15 };
    return {
      points,
      stopLine: {
        start: { x: center.x - perpendicular.x, y: center.y - perpendicular.y },
        end: { x: center.x + perpendicular.x, y: center.y + perpendicular.y },
      },
      stopLineDistance: distanceAlongRouteAt(points, center),
    };
  }
  return { points };
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
  let elapsedSeconds = seed.scenario === "traffic-light-green" ? TRAFFIC_LIGHT_PHASE_SECONDS : 0;
  let speedPixelsPerSecond = 0;
  let completedTrips = 0;
  let selection = 0;
  let safetyInterventions = 0;
  let currentNodeId = "south-west";
  let destinationId = seed.scenario === undefined
    ? MAP_NODES[seededIndex(seed.runId, selection, MAP_NODES.length)].id
    : "north-east";
  if (destinationId === currentNodeId) destinationId = "north-east";
  let currentRoute = routeData(pathBetween(currentNodeId, destinationId));
  let distanceAlongRoute = 0;
  const signal = (): TrafficLightSignal => Math.floor(elapsedSeconds / TRAFFIC_LIGHT_PHASE_SECONDS) % 2 === 0 ? "red" : "green";
  const distanceToStopLine = () => currentRoute.stopLineDistance === undefined
    ? -1
    : Math.max(-1, currentRoute.stopLineDistance - distanceAlongRoute);

  function selectNextRoute(): void {
    currentNodeId = destinationId;
    selection += 1;
    const candidates = MAP_NODES.filter((node) => node.id !== currentNodeId);
    destinationId = candidates[seededIndex(seed.runId, selection, candidates.length)].id;
    currentRoute = routeData(pathBetween(currentNodeId, destinationId));
    distanceAlongRoute = 0;
  }

  function snapshot(): WorldSnapshot {
    const stopDistance = distanceToStopLine();
    return {
      runId: seed.runId,
      elapsedSeconds,
      egoCar: { ...positionOnRoute(currentRoute.points, distanceAlongRoute), speedPixelsPerSecond },
      roadCenterlines: ROAD_CENTERLINES,
      route: currentRoute.points,
      destination: nodesById.get(destinationId)!,
      completedTrips,
      distanceToDestinationPixels: Math.max(0, routeLength(currentRoute.points) - distanceAlongRoute),
      trafficLight: {
        signal: signal(),
        distanceToStopLinePixels: Math.max(-1, stopDistance),
        ...(currentRoute.stopLine === undefined ? {} : { stopLine: currentRoute.stopLine }),
      },
      safetyInterventions,
    };
  }

  return {
    getObservation: () => ({
      contractVersion: CONTRACT_VERSION,
      values: [
        Math.max(0, routeLength(currentRoute.points) - distanceAlongRoute),
        speedPixelsPerSecond,
        distanceToStopLine(),
        signal() === "red" ? 0 : 1,
      ],
    }),
    step: (action) => {
      const remainingDistance = Math.max(0, routeLength(currentRoute.points) - distanceAlongRoute);
      const stopDistance = distanceToStopLine();
      const redStopLineAhead = signal() === "red" && stopDistance >= 0;
      const requestedTargetSpeed = Math.min(
        targetSpeeds[action],
        Math.sqrt(2 * MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * remainingDistance),
      );
      // v² = 2ad gives the highest speed that can still brake to zero at the stop line.
      const safeTargetSpeed = redStopLineAhead
        ? Math.sqrt(2 * MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * stopDistance)
        : requestedTargetSpeed;
      const safetyIntervention = redStopLineAhead && requestedTargetSpeed > safeTargetSpeed;
      const targetSpeed = Math.min(requestedTargetSpeed, safeTargetSpeed);
      const speedChange = MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * SIMULATION_STEP_SECONDS;
      speedPixelsPerSecond += Math.max(-speedChange, Math.min(speedChange, targetSpeed - speedPixelsPerSecond));
      distanceAlongRoute = Math.min(routeLength(currentRoute.points), distanceAlongRoute + speedPixelsPerSecond * SIMULATION_STEP_SECONDS);
      if (redStopLineAhead && currentRoute.stopLineDistance !== undefined) {
        // The discrete integration step must never carry the car past a red stop line.
        distanceAlongRoute = Math.min(distanceAlongRoute, currentRoute.stopLineDistance);
      }
      elapsedSeconds += SIMULATION_STEP_SECONDS;
      const events: WorldEvent[] = safetyIntervention ? [{ type: "safety-intervention", signal: "red" }] : [];
      if (safetyIntervention) safetyInterventions += 1;
      const distanceToDestination = routeLength(currentRoute.points) - distanceAlongRoute;
      if (distanceToDestination > 1 || speedPixelsPerSecond !== 0) return events;
      distanceAlongRoute = routeLength(currentRoute.points);
      const arrivedAt = nodesById.get(destinationId)!;
      completedTrips += 1;
      selectNextRoute();
      return [
        ...events,
        { type: "arrived", destination: arrivedAt },
        { type: "route-selected", destination: nodesById.get(destinationId)! },
      ];
    },
    getSnapshot: snapshot,
  };
}
