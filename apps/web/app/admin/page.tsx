"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, Bell, Boxes, Building2, Construction,
  CircleGauge, CloudOff, Database, FileWarning, Gauge, LayoutDashboard, LogOut, Map,
  PackageCheck, Radio, RefreshCw, Route, Settings, ShieldAlert, Truck, Users,
} from "lucide-react";
import OperationsMap from "@/components/OperationsMap";
import RoleGuard from "@/components/RoleGuard";
import { api, connectFleetSocket, getBootstrap } from "@/lib/api";
import type { Bootstrap, Incident, Reroute, Road, SimulationStatus, Vehicle } from "@/lib/types";

const nav = [
  [LayoutDashboard, "Dashboard"], [Map, "Live Map"], [Truck, "Vehicles"],
  [PackageCheck, "Deliveries"], [AlertTriangle, "Incidents"], [Gauge, "Road Risk"],
  [Building2, "District Connectivity"], [Activity, "Bottlenecks"], [Boxes, "Supply Gaps"],
  [Bell, "Alerts"], [Database, "Database"], [FileWarning, "Reports"], [Users, "Users"], [Settings, "Settings"],
] as const;

const simulationNodes = [
  { id: "A", name: "Guwahati Medical College" }, { id: "B", name: "Jorabat" },
  { id: "C", name: "Sonapur" }, { id: "D", name: "Chandrapur" },
  { id: "E", name: "Khetri" }, { id: "F", name: "District Relief Hub" },
];

const emptyVehicle: Vehicle = {
  vehicle_id: "MED-001", vehicle_type: "Medicine", cargo: "Emergency medicines",
  priority: "CRITICAL", lat: 26.1445, lng: 91.7362, speed_kmph: 0,
  status: "CONNECTING", destination: "District Relief Hub", eta_minutes: 0,
  reroute_status: "MONITORING", last_instruction: "Connecting to fleet feed", updated_at: "",
};

type ModuleProps = {
  active: string;
  vehicle: Vehicle;
  vehicles: Vehicle[];
  roads: Road[];
  incidents: Incident[];
  reroute: Reroute | null;
  currentRoute: number[][];
  setNotice: (message: string) => void;
  recalculateRisk: () => Promise<void>;
  resolveIncident: (incident: Incident) => Promise<void>;
  blockRoadFromMap: (road: Road) => Promise<boolean>;
  reopenRoadFromMap: (road: Road) => Promise<boolean>;
};

type MonitoredRoute = {
  route_id:string; route_name:string; road_ids:string[]; distance_km:number; eta_minutes:number;
  risk_score:number; status:"SAFE"|"CAUTION"|"HIGH_RISK"|"BLOCKED"; blocked_roads:string[]; recommended:boolean;
};

function RouteRiskMonitor({monitor,checking,onCheck}:{monitor:any;checking:boolean;onCheck:()=>void}) {
  const routes:MonitoredRoute[]=monitor?.routes||[];
  return <section className="route-monitor"><header><div><small>CONTINUOUS DECISION INTELLIGENCE</small><b>LIVE ROUTE RISK MONITOR</b></div><div className="route-watch-controls"><span><i/>WATCH ACTIVE · 10 SEC</span><button onClick={onCheck} disabled={checking}><RefreshCw/>{checking?"CHECKING…":"CHECK ALL ROUTES NOW"}</button></div></header><div className="route-monitor-grid">{routes.map(route=><article className={`monitored-route ${route.status.toLowerCase()}${route.recommended?" recommended":""}`} key={route.route_id}><div className="route-card-top"><span><Route/><b>{route.route_id}</b></span><strong>{route.recommended?"BEST SAFE ROUTE":route.status.replaceAll("_"," ")}</strong></div><h3>{route.road_ids.join(" → ")}</h3><p>{route.route_name}</p><div className="route-risk-bar"><i style={{width:`${route.risk_score}%`}}/></div><dl><div><dt>RISK</dt><dd>{route.risk_score}/100</dd></div><div><dt>ETA</dt><dd>{route.eta_minutes} min</dd></div><div><dt>DISTANCE</dt><dd>{route.distance_km} km</dd></div></dl>{route.blocked_roads.length>0&&<small className="blocked-route-reason">Unsafe — blocked: {route.blocked_roads.join(", ")}</small>}</article>)}</div><footer><span>Last ranked {monitor?.evaluated_at?new Date(monitor.evaluated_at).toLocaleTimeString():"connecting…"}</span><span>{monitor?.algorithm||"Waiting for risk engine"}</span></footer></section>;
}

function DatabaseExplorer() {
  const [overview, setOverview] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setOverview(await api("/api/v1/admin/database/overview")); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Database request failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return <section className="module-view database-explorer">
    <div className="module-toolbar"><div><p>LIVE PERSISTENCE LAYER</p><h1>Database Explorer</h1></div><button onClick={refresh} disabled={loading}>{loading ? "READING DATABASE…" : "REFRESH DATABASE"}</button></div>
    {error && <div className="database-error">{error}</div>}
    {!overview ? <div className="empty-module"><p>{loading ? "Reading the active database…" : "Database unavailable"}</p></div> : <>
      <div className="database-summary">
        <article><small>ACTIVE ENGINE</small><b>{overview.active_engine}</b><span>{overview.environment}</span></article>
        <article><small>STORED RECORDS</small><b>{overview.tables.reduce((total:number,table:any)=>total+table.rows,0).toLocaleString()}</b><span>Across {overview.tables.length} operational tables</span></article>
        <article><small>DEPLOYMENT TARGET</small><b>{overview.deployment_target}</b><span>Geospatial schema prepared</span></article>
        <article className="database-location"><small>ACTIVE LOCATION</small><b>{overview.location}</b><span>Read at {new Date(overview.refreshed_at).toLocaleTimeString()}</span></article>
      </div>
      <div className="database-tables">{overview.tables.map((table:any)=><article key={table.name} className="database-table-card">
        <header><div><small>TABLE</small><h2>{table.name}</h2></div><strong>{table.rows.toLocaleString()} <span>ROWS</span></strong></header>
        <div className="database-columns">{table.columns.map((column:string)=><code key={column}>{column}</code>)}</div>
        <div className="database-records"><table><thead><tr>{Object.keys(table.recent[0]||{}).map((key)=><th key={key}>{key.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{table.recent.map((record:any)=><tr key={record.id}>{Object.values(record).map((value:any,index)=><td key={index}>{typeof value === "boolean" ? value ? "YES" : "NO" : String(value)}</td>)}</tr>)}</tbody></table>{!table.recent.length&&<p>No records stored.</p>}</div>
      </article>)}</div>
    </>}
  </section>;
}

function AdminModule({ active, vehicle, vehicles, roads, incidents, reroute, currentRoute, setNotice, recalculateRisk, resolveIncident, blockRoadFromMap, reopenRoadFromMap }: ModuleProps) {
  if (active === "Database") return <DatabaseExplorer/>;
  if (active === "Live Map") return <section className="module-view live-map-module"><div className="module-toolbar"><div><p>OPERATIONS MAP</p><h1>Live corridor intelligence</h1></div><span className="live-pill"><i/>GPS &amp; RISK FEEDS LIVE</span></div><div className="module-map"><OperationsMap vehicle={vehicle} vehicles={vehicles} roads={roads} incidents={incidents} reroute={reroute} currentRoute={currentRoute} onRoadBlock={blockRoadFromMap} onRoadReopen={reopenRoadFromMap}/></div></section>;

  if (active === "Incidents" || active === "Alerts") {
    const items = incidents.length ? incidents : [{ id: 0, incident_type: "MONITORING", road_id: "ALL", severity: "LOW", description: "No active verified incidents", verified: false, source: "System", created_at: new Date().toISOString() } as Incident];
    return <section className="module-view"><div className="module-toolbar"><div><p>OPERATIONS</p><h1>{active}</h1></div><button onClick={()=>setNotice(`${active} queue refreshed.`)}>REFRESH QUEUE</button></div><div className="incident-board">{items.map((item)=><article key={item.id}><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span><div><h3>{item.incident_type} · {item.road_id}</h3><p>{item.description}</p><small>{item.verified?`Verified by ${item.source}`:"Verification pending"}</small></div>{item.id ? <button onClick={()=>item.verified?resolveIncident(item):setNotice(`${item.road_id} assigned to nearest Field Officer.`)}>{item.verified?"MARK RESOLVED":"ASSIGN VERIFICATION"}</button> : <button disabled>MONITORING</button>}</article>)}</div></section>;
  }

  if (active === "Road Risk") return <section className="module-view"><div className="module-toolbar"><div><p>LIVE RISK ENGINE</p><h1>Road-segment intelligence</h1></div><button onClick={recalculateRisk}>RECALCULATE NOW</button></div><div className="risk-card-grid">{roads.map((road)=><article key={road.id}><div className="risk-number">{road.risk_score}</div><div><h3>{road.id} · {road.name}</h3><p>{road.reason}</p><div className="factor-list">{road.factors?.filter(f=>f.contribution>0).slice(0,4).map(f=><span key={f.name}>{f.name.replaceAll("_"," ")} <b>+{f.contribution}</b></span>)}</div><small>{road.data_status} · Confidence {Math.round(road.confidence*100)}% · {road.data_source}<br/>Observed {road.source_observed_at || road.last_evaluated}</small></div><span className={`severity ${road.risk_level.toLowerCase()}`}>{road.risk_level}</span></article>)}</div></section>;

  if (active === "Settings") return <section className="module-view"><div className="module-toolbar"><div><p>PLATFORM</p><h1>Runtime configuration</h1></div></div><div className="settings-grid"><article><h3>Risk Engine</h3><label><input type="checkbox" checked readOnly/> Continuous 10-second route and risk recalculation</label><label><input type="checkbox" checked readOnly/> Trusted verification safety override</label><label><input type="checkbox" checked readOnly/> Live external data enabled</label></article><article><h3>Telemetry</h3><label><input type="checkbox" checked readOnly/> Device GPS ingestion enabled</label><label><input type="checkbox" readOnly/> GPS simulator disabled</label><label><input type="checkbox" checked readOnly/> Authenticated WebSocket enabled</label></article><article><h3>Configuration policy</h3><p>These values come from the deployed environment and cannot be faked or changed only in this browser.</p></article></div></section>;

  const liveTables: Record<string, {headers:string[];rows:string[][]}> = {
    Vehicles:{headers:["Vehicle","Cargo","Priority","Speed","Status","GPS source"],rows:vehicles.map(item=>[item.vehicle_id,item.cargo,item.priority,`${item.speed_kmph} km/h`,item.status,item.telemetry_source||"UNAVAILABLE"])},
    Deliveries:{headers:["Vehicle","Cargo","Destination","Priority","Route status"],rows:vehicles.map(item=>[item.vehicle_id,item.cargo,item.destination,item.priority,item.vehicle_id===reroute?.vehicle_id?reroute.status:item.reroute_status])},
    Bottlenecks:{headers:["Road","Risk","Status","Live reason","Observed"],rows:roads.filter(r=>r.risk_score>=25||r.status==="BLOCKED").map(r=>[`${r.id} · ${r.name}`,`${r.risk_score}/100`,r.status,r.reason,r.source_observed_at||r.last_evaluated])},
    Reports:{headers:["Report","Type","Road","Source","Verification","Created"],rows:incidents.map(i=>[`INC-${i.id}`,i.incident_type,i.road_id,i.source,i.verified?"VERIFIED":"PENDING",i.created_at])},
  };
  const table = liveTables[active];
  return <section className="module-view"><div className="module-toolbar"><div><p>LIVE DATA MODULE</p><h1>{active}</h1></div></div>{table?<div className="table-wrap"><table className="data-table"><thead><tr>{table.headers.map(header=><th key={header}>{header}</th>)}</tr></thead><tbody>{table.rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table>{!table.rows.length&&<div className="empty-module"><p>No current live records.</p></div>}</div>:<div className="empty-module"><h2>{active}</h2><p>No authorized live connector is configured for this module. NER-LOGIX will not display fabricated values.</p></div>}</section>;
}

export default function AdminPage() {
  const router = useRouter();
  const [activeView, setActiveView] = useState("Dashboard");
  const [data, setData] = useState<Bootstrap | null>(null);
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [vehicles, setVehicles] = useState<Vehicle[]>([emptyVehicle]);
  const [roads, setRoads] = useState<Road[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [reroute, setReroute] = useState<Reroute | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("System ready. Waiting for verified live feeds.");
  const [activity, setActivity] = useState<string[]>(["Authenticated event channel initialized"]);
  const [preTrip, setPreTrip] = useState<any>(null);
  const [routeFailure, setRouteFailure] = useState("");
  const [simulation, setSimulation] = useState<SimulationStatus | null>(null);
  const [simCount, setSimCount] = useState(3);
  const [simSource, setSimSource] = useState("A");
  const [simDestination, setSimDestination] = useState("F");
  const [simInterval, setSimInterval] = useState(2);
  const [routeMonitor, setRouteMonitor] = useState<any>(null);
  const [routeChecking, setRouteChecking] = useState(false);
  const routeMonitorRef = useRef<any>(null);
  const [closureRoadId, setClosureRoadId] = useState("R-02");
  const [closureReason, setClosureReason] = useState("Field officer reported that this road is unsafe");

  const loadRouteMonitor = useCallback(async () => {
    const result:any=await api("/api/v1/routes/monitor?start_node=A&destination_node=F");
    const previousRoutes:MonitoredRoute[]=routeMonitorRef.current?.routes||[];
    const newlyUnsafe=(result.routes as MonitoredRoute[]).filter((route)=>{
      const previous=previousRoutes.find((item)=>item.road_ids.join("|")===route.road_ids.join("|"));
      return previous && !["HIGH_RISK","BLOCKED"].includes(previous.status) && ["HIGH_RISK","BLOCKED"].includes(route.status);
    });
    if(newlyUnsafe.length){
      const message=`ROUTE ALERT: ${newlyUnsafe.map((route)=>route.route_id).join(", ")} changed to ${newlyUnsafe.map((route)=>route.status.replaceAll("_"," ")).join(", ")}.`;
      setNotice(message);
      setActivity((items)=>[message,...items].slice(0,6));
    }
    routeMonitorRef.current=result;
    setRouteMonitor(result);
  },[]);

  const load = useCallback(async () => {
    const bootstrap = await getBootstrap();
    setData(bootstrap); setVehicle(bootstrap.vehicle); setRoads(bootstrap.roads);
    setVehicles(bootstrap.vehicles?.length ? bootstrap.vehicles : [bootstrap.vehicle]);
    setSimulation(bootstrap.simulation || null);
    setIncidents(bootstrap.incidents); setReroute(bootstrap.reroute);
  }, []);

  useEffect(() => {
    load().catch((error) => setNotice(error.message));
    loadRouteMonitor().catch((error)=>setNotice(error.message));
    const routeTimer=window.setInterval(()=>loadRouteMonitor().catch(()=>null),10000);
    const socket = connectFleetSocket((event) => {
      if (event.type === "connected" || event.type.startsWith("vehicle.")) setVehicle(event.data);
      if (event.type === "fleet.snapshot" || event.type === "simulation.started") {
        const nextVehicles: Vehicle[] = event.data.vehicles;
        setVehicles(nextVehicles); setSimulation(event.data.simulation);
        if (nextVehicles.length) setVehicle(nextVehicles.find((item) => item.vehicle_id === "MED-001") || nextVehicles[0]);
        if (event.data.current_route) setData((current)=>current ? {...current,current_route:event.data.current_route} : current);
      }
      if (event.type === "simulation.stopped") {
        setSimulation(event.data.simulation); setVehicles(event.data.vehicles);
        if (event.data.vehicles.length) setVehicle(event.data.vehicles[0]);
      }
      if (event.type === "roads.risk_updated") {setRoads(event.data);loadRouteMonitor().catch(()=>null);}
      if (event.type === "incident.created" || event.type === "field.verification") {
        setIncidents((items) => [event.data, ...items.filter((item) => item.id !== event.data.id)]);
        if (event.type === "field.verification" && event.data.road_id !== "UNMAPPED") {
          setClosureRoadId(event.data.road_id);
          setClosureReason(event.data.description || "Verified Field Officer road-safety report");
          setNotice(`${event.data.road_id} officer report received. Review it and use BLOCK REPORTED ROAD if closure is required.`);
        }
      }
      if (event.type === "incident.resolved") setIncidents((items) => items.filter((item) => item.id !== event.data.id));
      if (event.type === "road.reopened") {
        setIncidents((items)=>items.filter((item)=>item.road_id!==event.data.road_id));
        setNotice(`${event.data.road_id} reopened by Control Room. Route safety is being recalculated.`);
      }
      if (event.type.startsWith("reroute.")) setReroute(event.data);
      if (event.type !== "vehicle.location") setActivity((items) => [`${event.type.replaceAll(".", " ")} received`, ...items].slice(0, 6));
    });
    return () => {socket.close();window.clearInterval(routeTimer);};
  }, [load,loadRouteMonitor]);

  const blocked = roads.filter((road) => road.status === "BLOCKED").length;
  const highRisk = roads.filter((road) => road.risk_score >= 50).length;
  const selectedRoad = roads.find((road) => road.id === "R-02");
  const latestIncident = incidents[0];
  const currentRisk = selectedRoad?.risk_score ?? 0;
  const routeRisk = reroute?.risk_score ?? 0;

  async function declareClosure() {
    setBusy("flood");
    setRouteFailure("");
    try {
      await api("/api/v1/incidents", { method: "POST", body: JSON.stringify({
        road_id: "R-02", incident_type: "FLOOD", severity: "CRITICAL",
        description: "High water level has submerged the Sonapur carriageway", lat: 26.1127, lng: 91.9898, source: "control_room",
      }) });
      const risk: any = await api("/api/v1/risk/recalculate", { method: "POST" });
      setRoads(risk.roads);
      const route: Reroute = await api("/api/v1/routes/alternate", { method: "POST", body: JSON.stringify({ vehicle_id: "MED-001", start_node: "A", destination_node: "F", avoid_road_ids: ["R-02"] }) });
      setReroute(route); setNotice("R-02 digitally blocked. Safer route generated for MED-001.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No safe route is available";
      setReroute(null); setRouteFailure(message); setNotice(`${message}. Hold MED-001 at a verified safe point.`);
    }
    finally { setBusy(""); }
  }

  async function holdVehicle() {
    setBusy("hold");
    try {
      const held: Vehicle = await api(`/api/v1/vehicles/${vehicle.vehicle_id}/hold`, { method: "POST" });
      setVehicle(held); setNotice("MED-001 is holding at the nearest safe point. Control room will continue risk evaluation.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to issue hold instruction"); }
    finally { setBusy(""); }
  }

  async function approve() {
    if (!reroute) return;
    setBusy("approve");
    try {
      const result: Reroute = await api(`/api/v1/reroutes/${reroute.id}/approve`, { method: "POST", body: JSON.stringify({ approved_by: "Assam Control Room" }) });
      setReroute(result); setNotice("Route approved and sent to MED-001 driver.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Approval failed"); }
    finally { setBusy(""); }
  }

  async function runPreTrip() {
    setBusy("pretrip");
    try {
      const result = await api("/api/v1/risk/pre-trip", { method: "POST", body: JSON.stringify({ vehicle_id: "MED-001", cargo_priority: "CRITICAL" }) });
      setPreTrip(result); setNotice("Pre-trip scan complete. Risk-aware dispatch approval required.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Pre-trip scan failed"); }
    finally { setBusy(""); }
  }

  async function recalculateRisk() {
    setNotice("Refreshing live Open-Meteo, GloFAS and incident feeds…");
    try {
      const result: any = await api("/api/v1/risk/recalculate", { method: "POST" });
      setRoads(result.roads);
      setNotice(`Live risk refreshed at ${new Date(result.last_refresh).toLocaleTimeString()}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Live risk refresh failed"); }
  }

  async function checkAllSafeRoutes() {
    setRouteChecking(true);
    setNotice("Checking weather, river, incident and road-risk signals across every candidate route…");
    try {
      const result:any=await api("/api/v1/risk/recalculate",{method:"POST"});
      setRoads(result.roads);
      await loadRouteMonitor();
      setNotice(`All routes reassessed at ${new Date(result.last_refresh).toLocaleTimeString()}. Unsafe routes are marked immediately.`);
    } catch(error) {
      setNotice(error instanceof Error?error.message:"Route safety check failed");
    } finally { setRouteChecking(false); }
  }

  const proposeImmediateReroute = useCallback(async (newlyBlockedRoadId:string) => {
    const avoidRoadIds=Array.from(new Set([
      ...roads.filter((road)=>road.status==="BLOCKED").map((road)=>road.id),
      newlyBlockedRoadId,
    ]));
    try {
      const route:Reroute=await api("/api/v1/routes/alternate",{method:"POST",body:JSON.stringify({
        vehicle_id:vehicle.vehicle_id,start_node:"A",destination_node:"F",avoid_road_ids:avoidRoadIds,
      })});
      setReroute(route);
      setRouteFailure("");
      return route;
    } catch(error) {
      const message=error instanceof Error?error.message:"No safe route is available";
      setReroute(null);
      setRouteFailure(message);
      return null;
    }
  },[roads,vehicle.vehicle_id]);

  async function blockReportedRoad() {
    const road=roads.find((item)=>item.id===closureRoadId);
    if(!road){setNotice("Select a mapped road segment before issuing a closure.");return;}
    setBusy("road-closure");
    try {
      await api("/api/v1/incidents",{method:"POST",body:JSON.stringify({
        road_id:closureRoadId,
        incident_type:"BLOCKAGE",
        severity:"CRITICAL",
        description:closureReason.trim()||"Control Room closure after verified Field Officer report",
        lat:road.coordinates[Math.floor(road.coordinates.length/2)]?.[0]||road.coordinates[0][0],
        lng:road.coordinates[Math.floor(road.coordinates.length/2)]?.[1]||road.coordinates[0][1],
        source:"control_room",
      })});
      const route=await proposeImmediateReroute(closureRoadId);
      await loadRouteMonitor();
      setNotice(route?`${closureRoadId} blocked. Safer route generated immediately and is waiting for approval.`:`${closureRoadId} blocked, but no safe route remains. Hold the vehicle at a verified safe point.`);
    } catch(error) {setNotice(error instanceof Error?error.message:"Unable to block the selected road");}
    finally {setBusy("");}
  }

  const blockRoadFromMap = useCallback(async (road:Road) => {
    setBusy("map-road-action");
    const report=incidents.find((item)=>item.road_id===road.id&&item.status==="ACTIVE");
    const midpoint=road.coordinates[Math.floor(road.coordinates.length/2)]||road.coordinates[0];
    try {
      await api("/api/v1/incidents",{method:"POST",body:JSON.stringify({
        road_id:road.id,incident_type:"BLOCKAGE",severity:"CRITICAL",
        description:report?.description||"Road blocked directly from the Control Room map after an operational safety report",
        lat:midpoint[0],lng:midpoint[1],source:"control_room",
      })});
      const route=await proposeImmediateReroute(road.id);
      await loadRouteMonitor();
      setNotice(route?`${road.id} blocked from the map. Safer route is already available for Control Room approval.`:`${road.id} blocked from the map. No safe route remains; hold ${vehicle.vehicle_id}.`);
      return true;
    } catch(error) {setNotice(error instanceof Error?error.message:`Unable to block ${road.id}`);return false;}
    finally {setBusy("");}
  },[incidents,loadRouteMonitor,proposeImmediateReroute,vehicle.vehicle_id]);

  const reopenRoadFromMap = useCallback(async (road:Road) => {
    setBusy("map-road-action");
    try {
      const result:any=await api(`/api/v1/roads/${road.id}/reopen`,{method:"POST"});
      if(result.road)setRoads((items)=>items.map((item)=>item.id===road.id?result.road:item));
      setIncidents((items)=>items.filter((item)=>item.road_id!==road.id));
      await loadRouteMonitor();
      setNotice(`${road.id} reopened from the map after clearance. Routes were recalculated using its latest remaining risk.`);
      return true;
    } catch(error) {setNotice(error instanceof Error?error.message:`Unable to reopen ${road.id}`);return false;}
    finally {setBusy("");}
  },[loadRouteMonitor]);

  async function resolveIncident(item: Incident) {
    try {
      await api(`/api/v1/incidents/${item.id}/resolve`, {method:"POST"});
      setIncidents((items)=>items.filter((candidate)=>candidate.id!==item.id));
      setNotice(`${item.road_id} reopened after verified resolution; risk engine recalculated.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to resolve incident"); }
  }

  async function startDemoReplay() {
    if (simSource === simDestination) { setNotice("Choose different source and destination points."); return; }
    setBusy("simulation");
    try {
      const result: any = await api("/api/v1/simulation/start", { method: "POST", body: JSON.stringify({
        vehicle_count: simCount, source_node: simSource, destination_node: simDestination, interval_seconds: simInterval,
      }) });
      setVehicles(result.vehicles); setSimulation(result.simulation);
      if (result.vehicles.length) setVehicle(result.vehicles[0]);
      setNotice(`Demo GPS Replay started for ${simCount} vehicle(s): ${result.simulation.source_name} → ${result.simulation.destination_name}.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to start demo replay"); }
    finally { setBusy(""); }
  }

  async function stopDemoReplay() {
    setBusy("simulation");
    try {
      const result: any = await api("/api/v1/simulation/stop", { method: "POST" });
      setVehicles(result.vehicles); setSimulation(result.simulation);
      if (result.vehicles.length) setVehicle(result.vehicles[0]);
      setNotice("Demo GPS Replay stopped. Device telemetry mode restored.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to stop demo replay"); }
    finally { setBusy(""); }
  }

  const kpis = useMemo(() => [
    [Truck, "Active Vehicles", simulation?.running ? String(vehicles.length) : vehicle.telemetry_source === "DEVICE_GPS" ? "1" : "0", "cyan"], [PackageCheck, "Critical Deliveries", simulation?.running ? String(vehicles.filter((item) => item.priority === "CRITICAL").length) : "1", "orange"],
    [ShieldAlert, "Blocked Roads", String(blocked), "red"], [AlertTriangle, "High-Risk Roads", String(highRisk), "amber"],
    [Construction, "Restricted Bridges", "0", "orange"], [Radio, "Active Incidents", String(incidents.length), "yellow"],
    [Building2, "Critical Districts", highRisk ? "1" : "0", "red"], [CloudOff, "Pending Sync", "0", "slate"],
  ], [blocked, highRisk, incidents.length, vehicle.telemetry_source, vehicles, simulation?.running]);

  return <RoleGuard role="ADMIN"><div className="admin-shell">
    <aside className="sidebar">
      <div className="side-brand"><span>✦</span><b>NER-LOGIX</b></div>
      <nav>{nav.map(([Icon, label]) => <button className={activeView === label ? "active" : ""} key={label} onClick={()=>setActiveView(label)}><Icon size={17}/><span>{label}</span></button>)}</nav>
      <div className="operator"><span className="avatar">AC</span><span><b>Control Room</b><small>State Officer</small></span></div>
    </aside>
    <main className="admin-main">
      <header className="topbar">
        <div><strong>NER-LOGIX</strong><small>Smart Logistics &amp; Accessibility Intelligence Platform</small></div>
        <div className="top-actions"><span className="live-pill"><i/>SYSTEM LIVE</span><span>Assam Pilot</span><Bell size={18}/><span className="avatar">AC</span><button className="icon-button" onClick={() => router.push("/")} aria-label="Sign out"><LogOut size={17}/></button></div>
      </header>
      {activeView === "Dashboard" ? <><section className="kpi-row">{kpis.map(([Icon, label, value, color]) => <article className={`kpi ${color}`} key={label as string}><Icon/><span><small>{label as string}</small><b>{value as string}</b></span></article>)}</section>
      <section className="admin-grid">
        <div className="map-stack"><div className="map-card">
            <OperationsMap vehicle={vehicle} vehicles={vehicles} roads={roads} incidents={incidents} reroute={reroute} currentRoute={data?.current_route || []} onRoadBlock={blockRoadFromMap} onRoadReopen={reopenRoadFromMap}/>
            <div className="map-legend"><span><i className="safe"/>Safe</span><span><i className="risky"/>Risky</span><span><i className="blocked"/>Blocked</span><span><i className="current"/>Current route</span><span><i className="alternate"/>Safer route</span></div>
          </div><RouteRiskMonitor monitor={routeMonitor} checking={routeChecking} onCheck={checkAllSafeRoutes}/>
        </div>
        <aside className="decision-column">
          <section className="panel alert-panel"><div className="panel-title"><AlertTriangle size={16}/> LIVE ALERTS</div>
            <div className="alert-item critical"><b>{latestIncident ? `${latestIncident.incident_type} · ${latestIncident.road_id}` : "No verified closure"}</b><small>{latestIncident?.description || "Monitoring all road segments"}</small></div>
            <div className="alert-item warning"><b>Mission exposure</b><small>{highRisk?`${vehicle.vehicle_id} is assigned to a corridor with ${highRisk} high-risk segment(s)`:"No high-risk segment on the monitored corridor"}</small></div>
            <div className="alert-item info"><b>Field verification</b><small>{latestIncident?.verified ? `Verified by ${latestIncident.source}` : latestIncident ? "Verification is pending" : "No verification task required"}</small></div>
            <div className="road-closure-control"><small>CONTROL ROOM ROAD CLOSURE</small><div><select aria-label="Road segment to block" value={closureRoadId} onChange={(event)=>setClosureRoadId(event.target.value)}>{roads.map((road)=><option value={road.id} key={road.id}>{road.id} · {road.name}</option>)}</select><button onClick={()=>{if(latestIncident?.road_id&&latestIncident.road_id!=="UNMAPPED"){setClosureRoadId(latestIncident.road_id);setClosureReason(latestIncident.description);}}} disabled={!latestIncident||latestIncident.road_id==="UNMAPPED"}>USE LATEST REPORT</button></div><input aria-label="Road closure reason" value={closureReason} onChange={(event)=>setClosureReason(event.target.value)} placeholder="Officer report or closure reason"/><button className="block-road-button" onClick={blockReportedRoad} disabled={busy==="road-closure"}>{busy==="road-closure"?"BLOCKING & RERANKING…":`BLOCK ${closureRoadId} · MARK UNSAFE`}</button></div>
          </section>
          <section className="panel vehicle-panel"><div className="panel-title"><Truck size={16}/> SELECTED VEHICLE</div>
            <h3>{vehicle.vehicle_id}</h3><p>{vehicle.cargo}</p>
            <dl><div><dt>Priority</dt><dd className="danger-text">{vehicle.priority}</dd></div><div><dt>Speed</dt><dd>{vehicle.speed_kmph} km/h</dd></div><div><dt>ETA</dt><dd>{vehicle.eta_minutes} min</dd></div><div><dt>Status</dt><dd>{vehicle.status}</dd></div></dl>
          </section>
          <section className="panel ai-panel"><div className="panel-title"><CircleGauge size={16}/> AI REROUTE RECOMMENDATION</div>
            <h3>{routeFailure ? "No safe route available" : reroute ? "Safer route available" : "Monitoring current route"}</h3>
            {routeFailure && <p className="no-route-warning">All graph paths are blocked or above the permitted safety threshold. Vehicle movement requires a verified corridor.</p>}
            <div className="risk-compare"><span>Current risk <b className="danger-text">{currentRisk}/100</b></span><span>Proposed risk <b className="safe-text">{routeRisk}/100</b></span><span>Proposed ETA <b>{reroute ? `${reroute.eta_minutes} min` : "—"}</b></span><span>Data confidence <b className="safe-text">{Math.round((selectedRoad?.confidence||0)*100)}%</b></span></div>
            {routeFailure ? <button className="danger-button" disabled={busy === "hold" || vehicle.status === "HOLD_POSITION"} onClick={holdVehicle}>{vehicle.status === "HOLD_POSITION" ? "VEHICLE HOLDING" : busy === "hold" ? "SENDING HOLD…" : "HOLD VEHICLE"}</button> : <button className="primary-button" disabled={!reroute || reroute.status !== "PENDING_APPROVAL" || busy === "approve"} onClick={approve}>{reroute?.status === "APPROVED" ? "SENT TO DRIVER" : reroute?.status === "DRIVER_ACCEPTED" ? "DRIVER ACCEPTED" : busy === "approve" ? "APPROVING…" : "APPROVE REROUTE"}</button>}
            <button className="secondary-button" onClick={()=>setActiveView("Road Risk")}>VIEW LIVE REASONING</button>
          </section>
        </aside>
      </section>
      <section className="insight-grid">
        <article className="panel"><div className="panel-title">LIVE RISK ENGINE</div><div className="big-risk"><b>{currentRisk}</b><span>/100<br/>{selectedRoad?.risk_level || "INITIALIZING"}</span></div><p>{selectedRoad?.reason || "Waiting for live data"}</p><small>{selectedRoad?.data_status || "INITIALIZING"} · Confidence {Math.round((selectedRoad?.confidence || 0)*100)}%<br/>{selectedRoad?.data_source || "No source yet"}</small></article>
        <article className="panel"><div className="panel-title">INCIDENT MANAGEMENT</div>{incidents.length?incidents.slice(0,4).map(item=><div className="mini-row" key={item.id}><span>{item.incident_type} · {item.road_id}</span><b className={item.severity==="CRITICAL"?"danger-text":"warning-text"}>{item.severity}</b><button onClick={()=>setActiveView("Incidents")}>{item.verified?"View":"Verify"}</button></div>):<p>No active incident reports.</p>}</article>
        <article className="panel"><div className="panel-title">RECENT ACTIVITY</div>{activity.map((x,i)=><div className="timeline-item" key={`${x}-${i}`}><i/><span><small>{new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small>{x}</span></div>)}</article>
        <article className="panel"><div className="panel-title">CORRIDOR AVAILABILITY</div>{roads.map(road=><div className="bar-row" key={road.id}><span>{road.id}</span><div><i style={{width:`${100-road.risk_score}%`}}/></div><b>{road.status}</b></div>)}</article>
        <article className="panel"><div className="panel-title">SUPPLY GAP ANALYSIS</div><p>No authorized hospital inventory connector is configured. No stock-window estimates are displayed.</p></article>
        <article className="panel demo-panel"><div className="panel-title">DEMO GPS REPLAY &amp; CONTROL</div>
          <div className="simulation-config">
            <label>Vehicles<input type="number" min="1" max="8" value={simCount} onChange={(event)=>setSimCount(Math.min(8,Math.max(1,Number(event.target.value))))}/></label>
            <label>Source<select value={simSource} onChange={(event)=>setSimSource(event.target.value)}>{simulationNodes.map((node)=><option value={node.id} key={node.id}>{node.name}</option>)}</select></label>
            <label>Destination<select value={simDestination} onChange={(event)=>setSimDestination(event.target.value)}>{simulationNodes.map((node)=><option value={node.id} key={node.id}>{node.name}</option>)}</select></label>
            <label>Replay interval<select value={simInterval} onChange={(event)=>setSimInterval(Number(event.target.value))}><option value={1}>1 second</option><option value={2}>2 seconds</option><option value={4}>4 seconds</option></select></label>
          </div>
          <button className={simulation?.running?"danger-button":""} onClick={simulation?.running?stopDemoReplay:startDemoReplay} disabled={busy==="simulation"}>{busy==="simulation"?"UPDATING REPLAY…":simulation?.running?"STOP DEMO GPS REPLAY":"START DEMO GPS REPLAY"}</button>
          <div className="demo-secondary-actions"><button onClick={runPreTrip} disabled={!!busy}>{busy==="pretrip"?"SCANNING…":"RUN PRE-TRIP"}</button><button className="danger-button" onClick={declareClosure} disabled={!!busy}>{busy==="flood"?"DECLARING…":"BLOCK R-02"}</button></div>
          <small className={simulation?.running?"simulation-live":""}>{simulation?.running?`DEMO GPS REPLAY · ${vehicles.length} moving vehicles · ${simulation.source_name} → ${simulation.destination_name}`:"Replay is visibly labelled and separate from production device telemetry."}{preTrip && <><br/>Pre-trip risk {preTrip.risk_score}/100 · {preTrip.recommendation}</>}</small>
        </article>
      </section></> : <AdminModule active={activeView} vehicle={vehicle} vehicles={vehicles} roads={roads} incidents={incidents} reroute={reroute} currentRoute={data?.current_route || []} setNotice={setNotice} recalculateRisk={recalculateRisk} resolveIncident={resolveIncident} blockRoadFromMap={blockRoadFromMap} reopenRoadFromMap={reopenRoadFromMap}/>} 
      <footer className="status-footer"><span className="live-dot"/>{notice}<button onClick={load}><RefreshCw size={14}/> Refresh</button></footer>
    </main>
  </div></RoleGuard>;
}
