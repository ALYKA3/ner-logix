"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Incident, Reroute, Road, Vehicle } from "@/lib/types";

type Props = {
  vehicle: Vehicle;
  roads: Road[];
  incidents: Incident[];
  reroute: Reroute | null;
  currentRoute: number[][];
  vehicles?: Vehicle[];
  compact?: boolean;
  navigation?: boolean;
  onRoadBlock?: (road: Road) => Promise<boolean> | boolean;
  onRoadReopen?: (road: Road) => Promise<boolean> | boolean;
};

const LANDMARKS = [
  { lat: 26.1445, lng: 91.7362, name: "Guwahati Medical College", kind: "hospital", glyph: "+" },
  { lat: 26.1804, lng: 91.9953, name: "Chandrapur Bridge", kind: "bridge", glyph: "B" },
  { lat: 26.1021, lng: 92.1124, name: "Khetri Supply Depot", kind: "depot", glyph: "D" },
  { lat: 26.181, lng: 92.1452, name: "District Relief Hub", kind: "relief", glyph: "H" },
] as const;

const CITY_LABELS = [
  { lat: 26.151, lng: 91.748, name: "GUWAHATI" },
  { lat: 26.106, lng: 91.865, name: "JORABAT" },
  { lat: 26.102, lng: 91.9898, name: "SONAPUR" },
  { lat: 26.191, lng: 91.9953, name: "CHANDRAPUR" },
  { lat: 26.091, lng: 92.1124, name: "KHETRI" },
] as const;

function roadColor(road: Road) {
  if (road.status === "BLOCKED") return "#ff3548";
  if (road.risk_score >= 50) return "#ff7a18";
  if (road.risk_score >= 25) return "#ffd229";
  return "#32e071";
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] || character);
}

export default function OperationsMap({ vehicle, vehicles, roads, incidents, reroute, currentRoute, compact, navigation, onRoadBlock, onRoadReopen }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const lastFitKeyRef = useRef<string>("");
  const openRoadIdRef = useRef<string | null>(null);
  const redrawingRef = useRef(false);

  const highestRisk = useMemo(() => Math.max(0, ...roads.map((road) => road.risk_score)), [roads]);
  const blockedCount = useMemo(() => roads.filter((road) => road.status === "BLOCKED").length, [roads]);
  const liveCount = useMemo(() => roads.filter((road) => road.data_status === "LIVE").length, [roads]);
  const inPilotCorridor = useMemo(() => vehicle.lat >= 25.7 && vehicle.lat <= 26.6 && vehicle.lng >= 91.3 && vehicle.lng <= 92.6, [vehicle.lat, vehicle.lng]);
  const displayedVehicles = useMemo(() => compact ? [vehicle] : vehicles?.length ? vehicles : [vehicle], [compact, vehicle, vehicles]);
  const showAlternativeRoute = Boolean(reroute?.coordinates?.length && ["PENDING_APPROVAL", "APPROVED"].includes(reroute.status));

  useEffect(() => {
    let disposed = false;

    async function setup() {
      if (!container.current) return;
      const L = await import("leaflet");
      if (disposed || !container.current) return;

      if (!mapRef.current) {
        const satelliteImagery = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
            maxZoom: 19,
          },
        );
        const satelliteLabels = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { attribution: "Labels &copy; Esri", maxZoom: 19, pane: "overlayPane" },
        );
        const satellite = L.layerGroup([satelliteImagery, satelliteLabels]);
        const topographic = L.tileLayer(
          "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
          { attribution: "Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap", maxZoom: 17 },
        );
        const street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        });

        mapRef.current = L.map(container.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: false,
          layers: [satellite],
        }).setView([26.135, 91.95], navigation ? 13 : compact ? 10 : 11);

        // Stable pane ordering prevents overlapping routes from hiding each other:
        // roads < reroute < current route < blocked roads < click targets.
        [
          ["roadStatePane", "410"],
          ["reroutePane", "420"],
          ["currentRoutePane", "430"],
          ["blockedRoadPane", "440"],
          ["roadInteractionPane", "450"],
        ].forEach(([name, zIndex]) => {
          const pane = mapRef.current!.createPane(name);
          pane.style.zIndex = zIndex;
        });

        L.control.zoom({ position: "topright" }).addTo(mapRef.current);
        if (!compact) {
          L.control.layers({ "Satellite intelligence": satellite, Topographic: topographic, Streets: street }, undefined, {
            position: "topright",
            collapsed: true,
          }).addTo(mapRef.current);
        }
        const syncLabelVisibility = () => container.current?.classList.toggle("show-map-labels", mapRef.current?.getZoom() >= 11);
        mapRef.current.on("zoomend", syncLabelVisibility);
        syncLabelVisibility();
      }

      const roadPopupToRestore = openRoadIdRef.current;
      redrawingRef.current = true;
      if (layersRef.current) layersRef.current.clearLayers();
      const group = L.layerGroup().addTo(mapRef.current);
      layersRef.current = group;
      const roadTargets = new Map<string, any>();

      if (currentRoute.length) {
        const route = currentRoute as [number, number][];
        L.polyline(route, { pane: "currentRoutePane", color: "#00112d", weight: 16, opacity: 0.86, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
        L.polyline(route, { pane: "currentRoutePane", color: "#0077ff", weight: 10, opacity: 0.42, lineCap: "round", lineJoin: "round", interactive: false }).addTo(group);
        L.polyline(route, { pane: "currentRoutePane", color: "#28a9ff", weight: 6, opacity: 1, lineCap: "round", lineJoin: "round", className: "current-route-line", interactive: false })
          .bindTooltip("ROAD-SNAPPED CURRENT ROUTE · MED-001", { sticky: true, className: "intel-tooltip route-tooltip" })
          .addTo(group);
      }

      roads.forEach((road) => {
        const coordinates = road.coordinates as [number, number][];
        const color = roadColor(road);
        const roadPane = road.status === "BLOCKED" ? "blockedRoadPane" : "roadStatePane";
        L.polyline(coordinates, { pane: roadPane, color: "#020713", weight: road.status === "BLOCKED" ? 15 : 11, opacity: 0.8, lineCap: "round", interactive: false }).addTo(group);
        L.polyline(coordinates, { pane: roadPane, color, weight: road.status === "BLOCKED" ? 11 : 7, opacity: 0.35, lineCap: "round", interactive: false }).addTo(group);
        const roadLine = L.polyline(coordinates, {
          pane: roadPane,
          color,
          weight: road.status === "BLOCKED" ? 6 : 4,
          opacity: 1,
          dashArray: road.status === "BLOCKED" ? "4 7" : undefined,
          className: road.status === "BLOCKED" ? "blocked-road-line" : "risk-road-line",
        }).bindTooltip(`<b>${road.id} · ${road.name}</b><br>Risk ${road.risk_score}/100 · ${road.status}<br>${road.reason}`, { sticky: true, className: "intel-tooltip" });
        // Render the visible line first. The wider transparent touch target below
        // must remain above it so route clicks open the Control Room action popup.
        roadLine.addTo(group);
        if (onRoadBlock && onRoadReopen) {
          const popup = L.DomUtil.create("div", "road-map-action");
          const heading = document.createElement("strong");
          heading.textContent = `${road.id} · ${road.name}`;
          const detail = document.createElement("p");
          detail.textContent = `Risk ${road.risk_score}/100 · ${road.status} · ${road.reason}`;
          const hint = document.createElement("small");
          hint.textContent = road.status === "BLOCKED" ? "Control Room may reopen this segment after verified clearance." : "Block only after an officer, driver or trusted feed reports unsafe access.";
          const action = document.createElement("button");
          action.className = road.status === "BLOCKED" ? "reopen-road-map" : "block-road-map";
          action.textContent = road.status === "BLOCKED" ? "REOPEN ROAD" : "BLOCK ROAD · MARK UNSAFE";
          action.onclick = async () => {
            const originalText = action.textContent;
            action.disabled = true;
            action.textContent = road.status === "BLOCKED" ? "REOPENING & RERANKING…" : "BLOCKING & RERANKING…";
            try {
              const succeeded = road.status === "BLOCKED" ? await onRoadReopen(road) : await onRoadBlock(road);
              if (succeeded !== false) {
                openRoadIdRef.current = null;
                mapRef.current?.closePopup();
              }
            } catch {
              // Parent callbacks normally convert failures to a dashboard notice.
              // This final guard prevents async DOM handlers from opening the dev overlay.
            } finally { action.disabled = false; action.textContent = originalText; }
          };
          popup.append(heading, detail, hint, action);
          L.DomEvent.disableClickPropagation(popup);
          const touchTarget = L.polyline(coordinates, {
            pane: "roadInteractionPane",
            color,
            weight: 22,
            opacity: 0.01,
            lineCap: "round",
            className: "road-touch-target",
          }).bindPopup(popup, { className: "road-action-popup", closeButton: true, minWidth: 245 }).addTo(group);
          touchTarget.on("popupopen", () => { openRoadIdRef.current = road.id; });
          touchTarget.on("popupclose", () => {
            if (!redrawingRef.current && openRoadIdRef.current === road.id) openRoadIdRef.current = null;
          });
          roadTargets.set(road.id, touchTarget);
        }
      });

      if (roadPopupToRestore) {
        const target = roadTargets.get(roadPopupToRestore);
        if (target) target.openPopup();
        else openRoadIdRef.current = null;
      }
      redrawingRef.current = false;

      if (showAlternativeRoute && reroute?.coordinates?.length) {
        const alternate = reroute.coordinates as [number, number][];
        L.polyline(alternate, { pane: "reroutePane", color: "#003d2d", weight: 12, opacity: 0.72, lineCap: "round", interactive: false }).addTo(group);
        L.polyline(alternate, {
          pane: "reroutePane",
          color: "#2cff8b",
          weight: 5,
          dashArray: "5 10",
          opacity: 1,
          className: "alternate-route-line",
          interactive: false,
        })
          .bindTooltip(`SAFER ROUTE · Risk ${reroute.risk_score}/100 · ETA ${reroute.eta_minutes} min`, { sticky: true, className: "intel-tooltip route-tooltip" })
          .addTo(group);
      }

      const groupedIncidents = new Map<string, { incident: Incident; count: number }>();
      incidents.forEach((incident) => {
        const key = incident.road_id === "UNMAPPED" ? `${incident.road_id}:${incident.lat.toFixed(3)}:${incident.lng.toFixed(3)}` : incident.road_id;
        const existing = groupedIncidents.get(key);
        if (existing) existing.count += 1;
        else groupedIncidents.set(key, { incident, count: 1 });
      });
      groupedIncidents.forEach(({ incident, count }) => {
        const reportCount = count > 1 ? ` · ${count} REPORTS` : "";
        const controlRoomClosure = incident.source === "control_room" && ["HIGH", "CRITICAL"].includes(incident.severity);
        const verificationLabel = controlRoomClosure ? "CONTROL ROOM · BLOCKED" : incident.verified ? "FIELD VERIFIED" : "PENDING VERIFICATION";
        const safeType = escapeHtml(incident.incident_type);
        const safeRoad = escapeHtml(incident.road_id);
        const safeDescription = escapeHtml(incident.description);
        L.marker([incident.lat, incident.lng], {
          icon: L.divIcon({
            className: "map-icon",
            html: `<span class="hazard-pulse"><b>!</b>${count > 1 ? `<small>${count}</small>` : ""}</span>`,
            iconSize: [38, 38], iconAnchor: [19, 19],
          }),
        })
          .bindPopup(`<strong>${safeType} · ${safeRoad}</strong><br/>${safeDescription}<br/>${controlRoomClosure ? "Digitally blocked by authenticated Control Room" : incident.verified ? "Field verified" : "Pending verification"}${reportCount}`)
          .bindTooltip(`${safeRoad} · ${verificationLabel}${reportCount}`, { direction: "top", offset: [0, -18], className: "intel-tooltip hazard-tooltip" })
          .addTo(group);
      });

      if (!compact) {
        LANDMARKS.forEach((landmark) => {
          L.marker([landmark.lat, landmark.lng], {
            icon: L.divIcon({
              className: "map-icon",
              html: `<span class="landmark-marker ${landmark.kind}">${landmark.glyph}</span><b class="landmark-label">${landmark.name}</b>`,
              iconSize: [30, 30], iconAnchor: [15, 15],
            }),
            interactive: false,
          }).addTo(group);
        });
        CITY_LABELS.forEach((city) => {
          L.marker([city.lat, city.lng], {
            icon: L.divIcon({ className: "map-icon", html: `<span class="city-map-label">${city.name}</span>`, iconSize: [1, 1], iconAnchor: [0, 0] }),
            interactive: false,
            zIndexOffset: 250,
          }).addTo(group);
        });
      }

      displayedVehicles.forEach((item, vehicleIndex) => {
        const inside = item.lat >= 25.7 && item.lat <= 26.6 && item.lng >= 91.3 && item.lng <= 92.6;
        if (!inside && !compact) return;
        const selected = item.vehicle_id === vehicle.vehicle_id;
        L.marker([item.lat, item.lng], {
          icon: L.divIcon({
            className: "map-icon",
            html: `<span class="vehicle-halo ${selected ? "selected" : "auxiliary"}"></span><span class="vehicle-marker truck-marker ${selected ? "selected" : "auxiliary"} ${item.speed_kmph > 0 ? "moving" : "stopped"} ${item.priority === "CRITICAL" ? "critical-mission" : ""}"><svg viewBox="0 0 64 38" aria-hidden="true"><defs><linearGradient id="truck-box-${vehicleIndex}" x1="0" x2="1"><stop stop-color="#18b9ff"/><stop offset="1" stop-color="#0869d8"/></linearGradient><linearGradient id="truck-cab-${vehicleIndex}" x1="0" x2="1"><stop stop-color="#38cfff"/><stop offset="1" stop-color="#0876db"/></linearGradient></defs><rect x="4" y="5" width="36" height="22" rx="2" fill="url(#truck-box-${vehicleIndex})"/><path d="M40 12h11l8 8v7H40z" fill="url(#truck-cab-${vehicleIndex})"/><path d="M45 14h5l5 6H45z" fill="#b9efff"/><rect x="2" y="26" width="58" height="4" rx="2" fill="#064d9e"/><circle cx="15" cy="31" r="5" fill="#07121d" stroke="#8edfff" stroke-width="2"/><circle cx="49" cy="31" r="5" fill="#07121d" stroke="#8edfff" stroke-width="2"/><circle cx="15" cy="31" r="1.5" fill="#dffaff"/><circle cx="49" cy="31" r="1.5" fill="#dffaff"/></svg></span><b class="marker-label ${selected ? "selected" : "auxiliary"}">${item.vehicle_id}<small>${Math.round(item.speed_kmph)} KM/H · ${item.telemetry_source === "DEMO_GPS_REPLAY" ? "DEMO" : "LIVE"}</small></b>`,
            iconSize: [64, 48], iconAnchor: [32, 31],
          }),
          zIndexOffset: selected ? 1000 : 800 - vehicleIndex,
        })
          .bindPopup(`<strong>${item.vehicle_id}</strong><br/>${item.cargo}<br/>${item.status} · ${item.speed_kmph} km/h<br/>${item.telemetry_source}`)
          .addTo(group);
      });

      const points: [number, number][] = [];
      displayedVehicles.forEach((item) => {
        const inside = item.lat >= 25.7 && item.lat <= 26.6 && item.lng >= 91.3 && item.lng <= 92.6;
        if (inside || compact || (!currentRoute.length && !roads.length)) points.push([item.lat, item.lng]);
      });
      if (!compact || inPilotCorridor) {
        currentRoute.forEach((point) => points.push(point as [number, number]));
        if (showAlternativeRoute) reroute?.coordinates?.forEach((point) => points.push(point as [number, number]));
        roads.forEach((road) => road.coordinates.forEach((point) => points.push(point as [number, number])));
      }
      if (navigation) {
        mapRef.current.setView([vehicle.lat, vehicle.lng], 13, { animate: true });
      } else if (points.length > 1) {
        const first = currentRoute[0];
        const last = currentRoute[currentRoute.length - 1];
        const fitKey = `${currentRoute.length}:${first?.join(",")}:${last?.join(",")}:${showAlternativeRoute ? reroute?.id : "none"}`;
        // Live GPS/risk updates redraw layers, but must not override the operator's zoom.
        if (lastFitKeyRef.current !== fitKey) {
          mapRef.current.fitBounds(L.latLngBounds(points), { padding: compact ? [16, 16] : [46, 46] });
          lastFitKeyRef.current = fitKey;
        }
      }
      window.setTimeout(() => mapRef.current?.invalidateSize(), 50);
    }

    setup();
    return () => { disposed = true; };
  }, [vehicle, displayedVehicles, roads, incidents, reroute, currentRoute, compact, navigation, inPilotCorridor, onRoadBlock, onRoadReopen, showAlternativeRoute]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  useEffect(() => {
    if (!container.current || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => mapRef.current?.invalidateSize({ animate: false }));
    });
    observer.observe(container.current);
    return () => { observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, []);

  return <div className={`operations-map-shell${compact ? " compact-map" : ""}${navigation ? " navigation-map" : ""}`}>
    <div ref={container} className="map" aria-label="Live satellite logistics map for the Assam pilot corridor" />
    {!compact && <>
      <div className="map-command-title"><small>NER-LOGIX · CORRIDOR INTELLIGENCE</small><b>NORTHEAST INDIA</b><span>ASSAM PILOT</span></div>
      <div className="map-data-gauge">
        <span><small>HIGHEST RISK</small><b>{highestRisk}</b><i className={highestRisk >= 75 ? "critical" : highestRisk >= 50 ? "high" : "nominal"}/></span>
        <span><small>GPS SPEED</small><b>{Math.round(vehicle.speed_kmph)}</b><em>km/h</em></span>
      </div>
      <div className={`map-feed-status${inPilotCorridor ? "" : " gps-anomaly"}`}><i/><span><b>{liveCount}/{roads.length}</b> LIVE RISK FEEDS</span><span><b>{blockedCount}</b> BLOCKED</span>{!inPilotCorridor && <span><b>GPS OUTSIDE PILOT</b></span>}</div>
      <div className={`map-coordinate-readout${inPilotCorridor ? "" : " warning"}`}>{vehicle.vehicle_id}&nbsp;&nbsp; {vehicle.lat.toFixed(4)}°N&nbsp; {vehicle.lng.toFixed(4)}°E{!inPilotCorridor && " · OUTSIDE ASSAM GEOFENCE"}</div>
    </>}
  </div>;
}
