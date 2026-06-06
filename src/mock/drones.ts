import type { FleetDrone, DroneStatus, FlightMode, SuiteType } from "@/lib/types";

export interface DemoDroneConfig {
  id: string;
  name: string;
  status: DroneStatus;
  flightMode: FlightMode;
  suiteType?: SuiteType;
  suiteName?: string;
  homeLat: number;
  homeLon: number;
  homeAlt: number;
  batteryStart: number;
  pathIndex: number; // index into FLIGHT_PATHS
  healthScore: number;
  hasAgent?: boolean;
  /** When set, the engine spawns an INavMockProtocol instead of MockProtocol. */
  firmwareTag?: "inav-copter" | "inav-plane";
}

/**
 * 5 demo drones in Bangalore area (HAL Airport / Whitefield).
 */
export const DEMO_DRONES: DemoDroneConfig[] = [
  {
    id: "alpha-1",
    name: "Alpha-1",
    status: "idle",
    flightMode: "STABILIZE",
    homeLat: -5.360,
    homeLon: 105.315,
    homeAlt: 0,
    batteryStart: 82,
    pathIndex: -1,
    healthScore: 95,
    hasAgent: true,
  },
  {
    id: "bravo-2",
    name: "Bravo-2",
    status: "idle",
    flightMode: "STABILIZE",
    homeLat: -5.355,
    homeLon: 105.320,
    homeAlt: 0,
    batteryStart: 67,
    pathIndex: -1,
    healthScore: 88,
    hasAgent: true,
  },
  {
    id: "echo-5",
    name: "Echo-5",
    status: "idle",
    flightMode: "STABILIZE",
    homeLat: -5.370,
    homeLon: 105.330,
    homeAlt: 0,
    batteryStart: 91,
    pathIndex: -1,
    healthScore: 92,
    hasAgent: true,
  },
];

/** Convert config to initial FleetDrone state. */
export function configToFleetDrone(cfg: DemoDroneConfig): FleetDrone {
  return {
    id: cfg.id,
    name: cfg.name,
    status: cfg.status,
    suiteName: cfg.suiteName,
    suiteType: cfg.suiteType,
    connectionState: cfg.status === "maintenance" ? "disconnected" : "connected",
    flightMode: cfg.flightMode,
    armState: cfg.status === "in_mission" ? "armed" : "disarmed",
    lastHeartbeat: 1740600000000,
    healthScore: cfg.healthScore,
    hasAgent: cfg.hasAgent,
    position: {
      timestamp: 1740600000000,
      lat: cfg.homeLat,
      lon: cfg.homeLon,
      alt: cfg.status === "in_mission" ? 50 : 0,
      relativeAlt: cfg.status === "in_mission" ? 50 : 0,
      heading: 0,
      groundSpeed: 0,
      airSpeed: 0,
      climbRate: 0,
    },
    battery: {
      timestamp: 1740600000000,
      voltage: 22.2 * (cfg.batteryStart / 100),
      current: cfg.status === "in_mission" ? 12.5 : 0,
      remaining: cfg.batteryStart,
      consumed: (100 - cfg.batteryStart) * 22,
    },
    gps: {
      timestamp: 1740600000000,
      fixType: cfg.status === "maintenance" ? 0 : 3,
      satellites: cfg.status === "maintenance" ? 0 : 17,
      hdop: 1.0,
      lat: cfg.homeLat,
      lon: cfg.homeLon,
      alt: 10,
    },
  };
}
