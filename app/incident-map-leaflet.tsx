"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Incident, IncidentPoint } from "@/lib/incidents";
import { formatNotamExpiry, type NotamZone } from "@/lib/notam-shared";

type Props = {
  incidents: Incident[];
  focusPoint?: IncidentPoint | null;
  notamZones?: NotamZone[];
  showNotam?: boolean;
};

function MapFocusEffect({ point }: { point: IncidentPoint | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (point) {
      map.flyTo([point.lat, point.lng], 9, { duration: 1.2 });
    }
  }, [map, point?.lat, point?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const VERIFICATION_COLORS = {
  confirmed: "#b7efc5",
  pending: "#ffb49a",
  contested: "#ffd8a8",
  template: "#c8b7a4",
} as const;

const TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function LeafletMap({ incidents, focusPoint, notamZones = [], showNotam = false }: Props) {
  const live = incidents.filter((i) => !i.isTemplate);

  const points = live.filter((i) => i.mapPoint).map((i) => ({
    id: i.id,
    title: i.title,
    verification: i.verification,
    severity: i.severity,
    point: i.mapPoint!,
    weaponType: i.weaponType,
    targetType: i.targetType,
    casualties: i.casualties,
    injuries: i.injuries,
  }));

  const trajectories = live.flatMap((i) =>
    (i.trajectories ?? []).map((t) => ({
      ...t,
      incidentTitle: i.title,
      incidentVerification: i.verification,
    })),
  );

  // Also show template map points so the map isn't empty before live data arrives
  const templatePoints = incidents
    .filter((i) => i.isTemplate && i.mapPoint)
    .map((i) => ({
      id: i.id,
      title: i.title,
      verification: i.verification as keyof typeof VERIFICATION_COLORS,
      point: i.mapPoint!,
      isTemplate: true,
    }));

  return (
    <MapContainer
      center={[32, 53]}
      zoom={5}
      minZoom={4}
      maxZoom={12}
      style={{ height: "520px", width: "100%", borderRadius: "1.5rem" }}
      className="z-0"
    >
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        subdomains="abcd"
        maxZoom={19}
      />
      <MapFocusEffect point={focusPoint} />

      {/* NOTAM airspace restriction zones */}
      {showNotam &&
        notamZones.map((zone) => (
          <Circle
            key={zone.id}
            center={[zone.lat, zone.lng]}
            radius={zone.radiusM}
            pathOptions={{
              color: "#ef4444",
              fillColor: "#ef4444",
              fillOpacity: 0.15,
              weight: 1.5,
              opacity: 0.75,
              dashArray: "6 4",
            }}
          >
            <Tooltip direction="top" sticky>
              <div style={{ maxWidth: 240, fontFamily: "monospace" }}>
                <p style={{ fontWeight: 700, fontSize: 12, color: "#ef4444", marginBottom: 2 }}>
                  ✈ NOTAM — {zone.id}
                </p>
                <p style={{ fontSize: 11, marginBottom: 2 }}>
                  <strong>Q-kód:</strong> {zone.qCode}
                </p>
                <p style={{ fontSize: 11, marginBottom: 2 }}>
                  <strong>FL:</strong> {zone.lowerFL}–{zone.upperFL}
                </p>
                <p style={{ fontSize: 11, marginBottom: 2 }}>
                  <strong>Platnost do:</strong> {formatNotamExpiry(zone.effectiveEnd)}
                </p>
                {zone.location && (
                  <p style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                    {zone.location}
                  </p>
                )}
              </div>
            </Tooltip>
          </Circle>
        ))}

      {/* Confirmed / live incident markers */}
      {points.map((item) => {
        const color = VERIFICATION_COLORS[item.verification] ?? "#ffb49a";
        return (
          <CircleMarker
            key={item.id}
            center={[item.point.lat, item.point.lng]}
            radius={item.severity === "critical" ? 14 : item.severity === "high" ? 11 : 9}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]} permanent={false}>
              <div style={{ maxWidth: 220 }}>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>{item.point.label}</p>
                <p style={{ fontSize: 12, opacity: 0.85 }}>{item.title}</p>
                {item.weaponType && (
                  <p style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                    Zbraň: {item.weaponType}
                  </p>
                )}
                {item.casualties !== undefined && (
                  <p style={{ fontSize: 11, color: "#ffb49a", marginTop: 2 }}>
                    Mrtvých: {item.casualties}
                  </p>
                )}
                {item.injuries !== undefined && (
                  <p style={{ fontSize: 11, opacity: 0.7 }}>
                    Zraněných: {item.injuries}
                  </p>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Template markers (dimmed) */}
      {templatePoints.map((item) => (
        <CircleMarker
          key={item.id}
          center={[item.point.lat, item.point.lng]}
          radius={7}
          pathOptions={{
            color: "#c8b7a4",
            fillColor: "#c8b7a4",
            fillOpacity: 0.3,
            weight: 1,
            dashArray: "4 3",
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <p style={{ fontSize: 12, opacity: 0.7 }}>{item.point.label} (šablona)</p>
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Attack trajectories */}
      {trajectories.map((traj) => {
        const color = traj.status === "confirmed" ? "#ffb49a" : "#d79e52";
        return (
          <Polyline
            key={traj.id}
            positions={[
              [traj.origin.lat, traj.origin.lng],
              [traj.target.lat, traj.target.lng],
            ]}
            pathOptions={{
              color,
              weight: 2.5,
              opacity: 0.85,
              dashArray: traj.status === "confirmed" ? undefined : "10 8",
            }}
          >
            <Tooltip sticky>
              <div style={{ maxWidth: 200 }}>
                <p style={{ fontWeight: 600, fontSize: 12 }}>
                  {traj.weaponType || "Trajektorie útoku"}
                </p>
                <p style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                  {traj.origin.label} → {traj.target.label}
                </p>
                <p style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                  {traj.status === "confirmed" ? "✓ Potvrzeno" : "⚠ Hlášeno"}
                </p>
              </div>
            </Tooltip>
          </Polyline>
        );
      })}

      {/* Launch point markers */}
      {trajectories.map((traj) => (
        <CircleMarker
          key={`${traj.id}-origin`}
          center={[traj.origin.lat, traj.origin.lng]}
          radius={5}
          pathOptions={{ color: "#ffd79b", fillColor: "#ffd79b", fillOpacity: 0.9, weight: 1.5 }}
        />
      ))}

      {/* Impact point markers */}
      {trajectories.map((traj) => (
        <CircleMarker
          key={`${traj.id}-target`}
          center={[traj.target.lat, traj.target.lng]}
          radius={7}
          pathOptions={{ color: "#dd6a42", fillColor: "#dd6a42", fillOpacity: 0.9, weight: 2 }}
        />
      ))}
    </MapContainer>
  );
}
