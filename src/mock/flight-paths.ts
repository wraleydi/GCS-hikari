/**
 * GPS waypoint routes for demo drones.
 * Each path is a closed loop : drone cycles through waypoints continuously.
 */

export interface PathWaypoint {
  lat: number;
  lon: number;
  alt: number; // meters AGL
  speed: number; // m/s target ground speed
}

const PATROL_LOOP_A: PathWaypoint[] = [
  { lat: -5.360, lon: 105.313, alt: 40, speed: 8 },
  { lat: -5.358, lon: 105.315, alt: 45, speed: 8 },
  { lat: -5.356, lon: 105.317, alt: 40, speed: 8 },
  { lat: -5.357, lon: 105.320, alt: 45, speed: 8 },
  { lat: -5.359, lon: 105.321, alt: 40, speed: 8 },
  { lat: -5.361, lon: 105.319, alt: 45, speed: 8 },
  { lat: -5.362, lon: 105.316, alt: 40, speed: 8 },
  { lat: -5.361, lon: 105.314, alt: 45, speed: 8 },
];

const SURVEY_GRID_A: PathWaypoint[] = [
  { lat: -5.355, lon: 105.320, alt: 80, speed: 5 },
  { lat: -5.353, lon: 105.320, alt: 80, speed: 5 },
  { lat: -5.353, lon: 105.323, alt: 80, speed: 5 },
  { lat: -5.355, lon: 105.323, alt: 80, speed: 5 },
  { lat: -5.355, lon: 105.326, alt: 80, speed: 5 },
  { lat: -5.353, lon: 105.326, alt: 80, speed: 5 },
  { lat: -5.353, lon: 105.329, alt: 80, speed: 5 },
  { lat: -5.355, lon: 105.329, alt: 80, speed: 5 },
  { lat: -5.357, lon: 105.329, alt: 80, speed: 5 },
  { lat: -5.357, lon: 105.326, alt: 80, speed: 5 },
  { lat: -5.357, lon: 105.323, alt: 80, speed: 5 },
  { lat: -5.357, lon: 105.320, alt: 80, speed: 5 },
];

const SAR_SEARCH_A: PathWaypoint[] = [
  { lat: -5.370, lon: 105.330, alt: 60, speed: 10 },
  { lat: -5.368, lon: 105.333, alt: 65, speed: 10 },
  { lat: -5.366, lon: 105.330, alt: 60, speed: 10 },
  { lat: -5.368, lon: 105.327, alt: 65, speed: 10 },
  { lat: -5.370, lon: 105.324, alt: 60, speed: 10 },
  { lat: -5.372, lon: 105.327, alt: 65, speed: 10 },
  { lat: -5.372, lon: 105.333, alt: 60, speed: 10 },
  { lat: -5.370, lon: 105.336, alt: 65, speed: 10 },
];

const INAV_QUAD_LOOP: PathWaypoint[] = [
  { lat: -5.385, lon: 105.250, alt: 50, speed: 6 },
  { lat: -5.383, lon: 105.253, alt: 55, speed: 6 },
  { lat: -5.381, lon: 105.250, alt: 50, speed: 6 },
  { lat: -5.383, lon: 105.247, alt: 55, speed: 6 },
  { lat: -5.385, lon: 105.250, alt: 50, speed: 6 },
  { lat: -5.387, lon: 105.253, alt: 55, speed: 6 },
];

const INAV_FW_CIRCUIT: PathWaypoint[] = [
  { lat: -5.390, lon: 105.245, alt: 80, speed: 15 },
  { lat: -5.386, lon: 105.250, alt: 85, speed: 15 },
  { lat: -5.390, lon: 105.255, alt: 80, speed: 15 },
  { lat: -5.394, lon: 105.250, alt: 85, speed: 15 },
];

export const FLIGHT_PATHS: PathWaypoint[][] = [
  PATROL_LOOP_A,
  SURVEY_GRID_A,
  SAR_SEARCH_A,
  INAV_QUAD_LOOP,
  INAV_FW_CIRCUIT,
];

/**
 * Interpolate position between two waypoints.
 * Returns { lat, lon, alt, heading, progress (0-1) }.
 */
export function interpolatePath(
  from: PathWaypoint,
  to: PathWaypoint,
  t: number
): { lat: number; lon: number; alt: number; heading: number } {
  const lat = from.lat + (to.lat - from.lat) * t;
  const lon = from.lon + (to.lon - from.lon) * t;
  const alt = from.alt + (to.alt - from.alt) * t;

  // Calculate heading
  const dLon = to.lon - from.lon;
  const y = Math.sin(dLon * (Math.PI / 180)) * Math.cos(to.lat * (Math.PI / 180));
  const x =
    Math.cos(from.lat * (Math.PI / 180)) * Math.sin(to.lat * (Math.PI / 180)) -
    Math.sin(from.lat * (Math.PI / 180)) * Math.cos(to.lat * (Math.PI / 180)) * Math.cos(dLon * (Math.PI / 180));
  const heading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

  return { lat, lon, alt, heading };
}
