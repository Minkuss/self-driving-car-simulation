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

export interface PedestrianSnapshot extends Point {
  readonly crossing: readonly [Point, Point];
  readonly crossingPosition: number;
  readonly speedPixelsPerSecond: number;
}

export interface WorldSeed {
  readonly runId: string;
  readonly scenario?: CuratedRouteId;
}

export interface WorldSnapshot {
  readonly runId: string;
  readonly routeId: CuratedRouteId;
  readonly elapsedSeconds: number;
  readonly egoCar: EgoCarSnapshot;
  readonly roadCenterlines: readonly (readonly Point[])[];
  readonly route: readonly Point[];
  readonly destination: Point;
  readonly completedTrips: number;
  readonly distanceToDestinationPixels: number;
  readonly trafficLight: TrafficLightSnapshot;
  readonly pedestrian?: PedestrianSnapshot;
  readonly safetyInterventions: number;
}

export type WorldEvent =
  | { readonly type: "arrived"; readonly destination: Point }
  | { readonly type: "route-selected"; readonly routeId: CuratedRouteId; readonly destination: Point }
  | { readonly type: "safety-intervention"; readonly hazard: "red-signal" | "pedestrian" };

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
  readonly crosswalkDistance?: number;
}

export type CuratedRouteId =
  | "traffic-light-red"
  | "traffic-light-green"
  | "pedestrian-crossing-eastbound"
  | "pedestrian-crossing-westbound";

interface CuratedRoute {
  readonly id: CuratedRouteId;
  readonly nodeIds: readonly string[];
  readonly clockStartSeconds: number;
  readonly kind: "traffic-light" | "pedestrian";
  readonly pedestrianDirection?: "eastbound" | "westbound";
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
const CROSSWALK_CENTER = { x: 400, y: 230 };
const CROSSWALK_START = { x: 370, y: 230 };
const CROSSWALK_END = { x: 430, y: 230 };
const PEDESTRIAN_CROSSING_START_SECONDS = 0;
const PEDESTRIAN_CROSSING_DURATION_SECONDS = 5;

// The public demo cycles these routes so every required event is visible without chance.
const CURATED_ROUTES: readonly CuratedRoute[] = [
  { id: "traffic-light-red", nodeIds: ["north-west", "north", "north-east"], clockStartSeconds: 0, kind: "traffic-light" },
  { id: "traffic-light-green", nodeIds: ["north-east", "north"], clockStartSeconds: TRAFFIC_LIGHT_PHASE_SECONDS, kind: "traffic-light" },
  { id: "pedestrian-crossing-westbound", nodeIds: ["north", "south"], clockStartSeconds: 0, kind: "pedestrian", pedestrianDirection: "westbound" },
  { id: "pedestrian-crossing-eastbound", nodeIds: ["south", "north", "north-west"], clockStartSeconds: 0, kind: "pedestrian", pedestrianDirection: "eastbound" },
];

export const curatedRouteIds = CURATED_ROUTES.map((route) => route.id) as readonly CuratedRouteId[];

function distance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
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

function routeData(route: CuratedRoute): RouteData {
  const nodes = route.nodeIds.map((nodeId) => {
    const node = nodesById.get(nodeId);
    if (node === undefined) throw new Error(`Curated route ${route.id} references an unknown map node.`);
    return node;
  });
  for (let index = 1; index < nodes.length; index += 1) {
    const [startId, endId] = [nodes[index - 1].id, nodes[index].id];
    if (!ROAD_CONNECTIONS.some(([first, second]) => (first === startId && second === endId) || (first === endId && second === startId))) {
      throw new Error(`Curated route ${route.id} leaves the road network.`);
    }
  }
  const points = smoothRoute(nodes);
  const crosswalkDistance = route.kind === "pedestrian"
    ? distanceAlongRouteAt(points, CROSSWALK_CENTER)
    : undefined;
  if (route.kind !== "traffic-light") return crosswalkDistance === undefined ? { points } : { points, crosswalkDistance };
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
      ...(crosswalkDistance === undefined ? {} : { crosswalkDistance }),
      stopLine: {
        start: { x: center.x - perpendicular.x, y: center.y - perpendicular.y },
        end: { x: center.x + perpendicular.x, y: center.y + perpendicular.y },
      },
      stopLineDistance: distanceAlongRouteAt(points, center),
    };
  }
  throw new Error(`Traffic-light route ${route.id} must enter a controlled map node.`);
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

export function createSimulator(seed: WorldSeed): Simulator {
  let elapsedSeconds = 0;
  let speedPixelsPerSecond = 0;
  let completedTrips = 0;
  let safetyInterventions = 0;
  let routeIndex = seed.scenario === undefined ? 0 : curatedRouteIds.indexOf(seed.scenario);
  if (routeIndex < 0) throw new Error("Unknown curated route scenario.");
  let selectedRoute = CURATED_ROUTES[routeIndex];
  let currentRoute = routeData(selectedRoute);
  let routeElapsedSeconds = selectedRoute.clockStartSeconds;
  let distanceAlongRoute = 0;
  const signal = (): TrafficLightSignal => Math.floor(routeElapsedSeconds / TRAFFIC_LIGHT_PHASE_SECONDS) % 2 === 0 ? "red" : "green";
  const distanceToStopLine = () => currentRoute.stopLineDistance === undefined
    ? -1
    : Math.max(-1, currentRoute.stopLineDistance - distanceAlongRoute);
  const pedestrian = (): PedestrianSnapshot | undefined => {
    if (selectedRoute.pedestrianDirection === undefined) return undefined;
    const crossingElapsed = routeElapsedSeconds - selectedRoute.clockStartSeconds - PEDESTRIAN_CROSSING_START_SECONDS;
    if (crossingElapsed < 0 || crossingElapsed >= PEDESTRIAN_CROSSING_DURATION_SECONDS) return undefined;
    const crossingPosition = crossingElapsed / PEDESTRIAN_CROSSING_DURATION_SECONDS;
    const [crossingStart, crossingEnd] = selectedRoute.pedestrianDirection === "eastbound"
      ? [CROSSWALK_START, CROSSWALK_END]
      : [CROSSWALK_END, CROSSWALK_START];
    return {
      x: crossingStart.x + (crossingEnd.x - crossingStart.x) * crossingPosition,
      y: CROSSWALK_CENTER.y,
      crossing: [crossingStart, crossingEnd],
      crossingPosition,
      speedPixelsPerSecond: distance(crossingStart, crossingEnd) / PEDESTRIAN_CROSSING_DURATION_SECONDS,
    };
  };
  const distanceToCrosswalk = () => currentRoute.crosswalkDistance === undefined
    ? -1
    : Math.max(-1, currentRoute.crosswalkDistance - distanceAlongRoute);

  function selectNextRoute(): void {
    routeIndex = (routeIndex + 1) % CURATED_ROUTES.length;
    selectedRoute = CURATED_ROUTES[routeIndex];
    currentRoute = routeData(selectedRoute);
    routeElapsedSeconds = selectedRoute.clockStartSeconds;
    distanceAlongRoute = 0;
  }

  function snapshot(): WorldSnapshot {
    const stopDistance = distanceToStopLine();
    return {
      runId: seed.runId,
      routeId: selectedRoute.id,
      elapsedSeconds,
      egoCar: { ...positionOnRoute(currentRoute.points, distanceAlongRoute), speedPixelsPerSecond },
      roadCenterlines: ROAD_CENTERLINES,
      route: currentRoute.points,
      destination: nodesById.get(selectedRoute.nodeIds[selectedRoute.nodeIds.length - 1])!,
      completedTrips,
      distanceToDestinationPixels: Math.max(0, routeLength(currentRoute.points) - distanceAlongRoute),
      trafficLight: {
        signal: signal(),
        distanceToStopLinePixels: Math.max(-1, stopDistance),
        ...(currentRoute.stopLine === undefined ? {} : { stopLine: currentRoute.stopLine }),
      },
      ...(pedestrian() === undefined ? {} : { pedestrian: pedestrian() }),
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
        distanceToCrosswalk(),
        pedestrian()?.crossingPosition ?? -1,
        pedestrian()?.speedPixelsPerSecond ?? 0,
      ],
    }),
    step: (action) => {
      const remainingDistance = Math.max(0, routeLength(currentRoute.points) - distanceAlongRoute);
      const stopDistance = distanceToStopLine();
      const redStopLineAhead = signal() === "red" && stopDistance >= 0;
      const crossingDistance = distanceToCrosswalk();
      const occupiedCrosswalkAhead = pedestrian() !== undefined && crossingDistance >= 0;
      const requestedTargetSpeed = Math.min(
        targetSpeeds[action],
        Math.sqrt(2 * MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * remainingDistance),
      );
      // v² = 2ad gives the highest speed that can still brake to zero at the stop line.
      const safeTargetSpeed = Math.min(
        requestedTargetSpeed,
        redStopLineAhead ? Math.sqrt(2 * MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * stopDistance) : requestedTargetSpeed,
        occupiedCrosswalkAhead ? Math.sqrt(2 * MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * crossingDistance) : requestedTargetSpeed,
      );
      const safetyHazard = redStopLineAhead && requestedTargetSpeed > safeTargetSpeed
        ? "red-signal"
        : occupiedCrosswalkAhead && requestedTargetSpeed > safeTargetSpeed
          ? "pedestrian"
          : undefined;
      const targetSpeed = Math.min(requestedTargetSpeed, safeTargetSpeed);
      const speedChange = MAX_ACCELERATION_PIXELS_PER_SECOND_SQUARED * SIMULATION_STEP_SECONDS;
      speedPixelsPerSecond += Math.max(-speedChange, Math.min(speedChange, targetSpeed - speedPixelsPerSecond));
      distanceAlongRoute = Math.min(routeLength(currentRoute.points), distanceAlongRoute + speedPixelsPerSecond * SIMULATION_STEP_SECONDS);
      if (redStopLineAhead && currentRoute.stopLineDistance !== undefined) {
        // The discrete integration step must never carry the car past a red stop line.
        distanceAlongRoute = Math.min(distanceAlongRoute, currentRoute.stopLineDistance);
      }
      if (occupiedCrosswalkAhead && currentRoute.crosswalkDistance !== undefined) {
        distanceAlongRoute = Math.min(distanceAlongRoute, currentRoute.crosswalkDistance);
      }
      elapsedSeconds += SIMULATION_STEP_SECONDS;
      routeElapsedSeconds += SIMULATION_STEP_SECONDS;
      const events: WorldEvent[] = safetyHazard === undefined ? [] : [{ type: "safety-intervention", hazard: safetyHazard }];
      if (safetyHazard !== undefined) safetyInterventions += 1;
      const distanceToDestination = routeLength(currentRoute.points) - distanceAlongRoute;
      if (distanceToDestination > 1 || speedPixelsPerSecond !== 0) return events;
      distanceAlongRoute = routeLength(currentRoute.points);
      const arrivedAt = nodesById.get(selectedRoute.nodeIds[selectedRoute.nodeIds.length - 1])!;
      completedTrips += 1;
      selectNextRoute();
      return [
        ...events,
        { type: "arrived", destination: arrivedAt },
        { type: "route-selected", routeId: selectedRoute.id, destination: nodesById.get(selectedRoute.nodeIds[selectedRoute.nodeIds.length - 1])! },
      ];
    },
    getSnapshot: snapshot,
  };
}
