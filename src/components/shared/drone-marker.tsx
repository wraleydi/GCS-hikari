"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import L from "leaflet";
import type { DroneStatus } from "@/lib/types";

const Marker = dynamic(
  () => import("react-leaflet").then((m) => m.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import("react-leaflet").then((m) => m.Popup),
  { ssr: false }
);

interface DroneMarkerProps {
  id: string;
  name: string;
  lat: number;
  lon: number;
  heading: number;
  status: DroneStatus;
  battery?: number;
  onClick?: (id: string) => void;
}

const statusColors: Record<DroneStatus, string> = {
  online: "#22c55e",
  in_mission: "#3a82ff",
  idle: "#000000ff",
  returning: "#f59e0b",
  maintenance: "#ef4444",
  offline: "#666666",
};

const droneIconCache = new Map<string, L.DivIcon>();

function createDroneIcon(heading: number, status: DroneStatus): L.DivIcon {
  const key = `${heading}-${status}`;
  const cached = droneIconCache.get(key);
  if (cached) return cached;
  const color = statusColors[status];
  const svg = `<svg width="24" height="24" viewBox="0 -0.5 25 25" style="transform:rotate(${heading}deg)" xmlns="http://www.w3.org/2000/svg">
    <path d="m24.794 16.522-.281-2.748-10.191-5.131s.091-1.742 0-4.31c-.109-1.68-.786-3.184-1.839-4.339l.005.006h-.182c-1.048 1.15-1.726 2.653-1.834 4.312l-.001.021c-.091 2.567 0 4.31 0 4.31l-10.19 5.131-.281 2.748 6.889-2.074 3.491-.582c-.02.361-.031.783-.031 1.208 0 2.051.266 4.041.764 5.935l-.036-.162-2.728 1.095v1.798l3.52-.8c.155.312.3.566.456.812l-.021-.035v.282c.032-.046.062-.096.093-.143.032.046.061.096.094.143v-.282c.135-.21.28-.464.412-.726l.023-.051 3.52.8v-1.798l-2.728-1.095c.463-1.733.728-3.723.728-5.774 0-.425-.011-.847-.034-1.266l.003.058 3.492.582 6.888 2.074z" fill="${color}" stroke="#000" stroke-width="0.5" opacity="0.9"/>
  </svg>`;
  const icon = L.divIcon({
    html: svg,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  droneIconCache.set(key, icon);
  return icon;
}

export function DroneMarker({ id, name, lat, lon, heading, status, battery, onClick }: DroneMarkerProps) {
  const quantizedHeading = Math.round(heading / 5) * 5;
  const icon = useMemo(() => createDroneIcon(quantizedHeading, status), [quantizedHeading, status]);

  return (
    <Marker
      position={[lat, lon]}
      icon={icon}
      eventHandlers={{
        click: () => onClick?.(id),
      }}
    >
      <Popup>
        <div className="text-xs font-mono" style={{ color: "#fafafa", background: "#0a0a0a", padding: "4px 8px", margin: "-8px -12px" }}>
          <strong>{name}</strong>
          <br />
          {status} {battery !== undefined && `| ${Math.round(battery)}%`}
        </div>
      </Popup>
    </Marker>
  );
}
