/**
 * @module DroneEntity
 * @description Renders the animated drone arrow billboard in the 3D scene.
 * Position and heading driven entirely by CesiumJS SampledPositionProperty
 * and SampledProperty — zero per-frame React code.
 * @license GPL-3.0-only
 */

"use client";

import { useEffect, useRef } from "react";
import {
  CallbackProperty,
  HeightReference,
  type Viewer as CesiumViewer,
  type Entity,
  type SampledPositionProperty,
  type SampledProperty,
} from "cesium";

interface DroneEntityProps {
  viewer: CesiumViewer | null;
  positionProperty: SampledPositionProperty | null;
  headingProperty: SampledProperty | null;
  /** When true, positions are absolute (terrain-resolved). Use HeightReference.NONE. */
  useAbsoluteAlt?: boolean;
  /** When false, hides the drone entity (prevents visual pop during terrain loading). */
  visible?: boolean;
}

const DRONE_ENTITY_ID = "sim-drone";

const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 -0.5 25 25">
  <path d="m24.794 16.522-.281-2.748-10.191-5.131s.091-1.742 0-4.31c-.109-1.68-.786-3.184-1.839-4.339l.005.006h-.182c-1.048 1.15-1.726 2.653-1.834 4.312l-.001.021c-.091 2.567 0 4.31 0 4.31l-10.19 5.131-.281 2.748 6.889-2.074 3.491-.582c-.02.361-.031.783-.031 1.208 0 2.051.266 4.041.764 5.935l-.036-.162-2.728 1.095v1.798l3.52-.8c.155.312.3.566.456.812l-.021-.035v.282c.032-.046.062-.096.093-.143.032.046.061.096.094.143v-.282c.135-.21.28-.464.412-.726l.023-.051 3.52.8v-1.798l-2.728-1.095c.463-1.733.728-3.723.728-5.774 0-.425-.011-.847-.034-1.266l.003.058 3.492.582 6.888 2.074z" fill="#dff140" stroke="#fff" stroke-width="0.5" opacity="0.95"/>
</svg>`;
const ARROW_DATA_URL = `data:image/svg+xml;base64,${typeof window !== "undefined" ? btoa(ARROW_SVG) : ""}`;

export function DroneEntity({ viewer, positionProperty, headingProperty, useAbsoluteAlt = false, visible = true }: DroneEntityProps) {
  const droneRef = useRef<Entity | null>(null);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !positionProperty) return;

    // Create rotation property that compensates for camera heading
    // Without alignedAxis, billboard up = screen up, so rotation = camera.heading + sampledHeading
    const rotationProperty = new CallbackProperty((time) => {
      if (!viewer || viewer.isDestroyed()) return 0;
      const hdg = headingProperty?.getValue(time);
      return typeof hdg === "number" ? viewer.camera.heading + hdg : 0;
    }, false);

    const drone = viewer.entities.add({
      id: DRONE_ENTITY_ID,
      position: positionProperty, // CesiumJS evaluates at clock.currentTime every frame
      billboard: {
        image: ARROW_DATA_URL,
        width: 36,
        height: 36,
        rotation: rotationProperty,
        heightReference: useAbsoluteAlt ? HeightReference.NONE : HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        show: visible,
      },
    });
    droneRef.current = drone;

    return () => {
      if (viewer && !viewer.isDestroyed()) viewer.entities.removeById(DRONE_ENTITY_ID);
      droneRef.current = null;
    };
  }, [viewer, positionProperty, headingProperty, useAbsoluteAlt, visible]);

  return null;
}
