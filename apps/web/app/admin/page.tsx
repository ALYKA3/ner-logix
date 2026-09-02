"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, Bell, BellOff, Boxes, Building2, Construction,
  CircleGauge, CloudOff, Database, FileWarning, Gauge, LayoutDashboard, LogOut, Map,
  PackageCheck, Radio, RefreshCw, Route, Settings, ShieldAlert, Truck, Users,
} from "lucide-react";
import OperationsMap from "@/components/OperationsMap";
import RoleGuard from "@/components/RoleGuard";
import { API_URL, api, connectFleetSocket, getBootstrap } from "@/lib/api";
import type { Bootstrap, Incident, Reroute, Road, RouteExposure, SimulationStatus, Vehicle } from "@/lib/types";

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
  confirmFieldReport: (incident: Incident, roadId: string) => Promise<boolean>;
  blockRoadFromMap: (road: Road) => Promise<boolean>;
  reopenRoadFromMap: (road: Road) => Promise<boolean>;
  autoMonitor: boolean;
  setAutoMonitor: (enabled: boolean) => void;
  compactMode: boolean;
  setCompactMode: (enabled: boolean) => void;
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

function IncidentReviewModal({incident,roads,onClose,onConfirm}:{incident:Incident;roads:Road[];onClose:()=>void;onConfirm:(incident:Incident,roadId:string)=>Promise<boolean>}) {
  const [roadId,setRoadId]=useState(incident.road_id!=="UNMAPPED"?incident.road_id:roads[0]?.id||"");
  const [confirming,setConfirming]=useState(false);
  const evidenceUrl=incident.photo_url?(incident.photo_url.startsWith("http")?incident.photo_url:`${API_URL}${incident.photo_url}`):"";
  const pending=!incident.verified&&incident.status==="ACTIVE"&&incident.source!=="control_room";
  const detailRows=[
    ["Officer / source",incident.source], ["Submitted",new Date(incident.created_at).toLocaleString()],
    ["Reported road",incident.road_id], ["Nearest landmark",incident.landmark||"Not provided"],
    ["Observed condition",incident.road_status||"Not provided"], ["Severity",incident.severity],
    ["Affected direction",incident.affected_direction||"Not provided"], ["Vehicle access",incident.vehicle_access||"Not provided"],
    ["Estimated clearance",incident.clearance_estimate||"Not provided"], ["GPS coordinates",`${incident.lat.toFixed(5)}, ${incident.lng.toFixed(5)}`],
  ];
  async function confirm(){if(!roadId)return;setConfirming(true);try{if(await onConfirm(incident,roadId))onClose();}finally{setConfirming(false)}}
  return <div className="report-review-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="report-review-modal" role="dialog" aria-modal="true" aria-label={`Field report INC-${incident.id}`}>
      <header><div><small>FIELD EVIDENCE REVIEW</small><h2>INC-{incident.id} · {incident.incident_type}</h2><p>Review the original officer evidence before issuing an operational closure.</p></div><button className="report-close" onClick={onClose} aria-label="Close report">×</button></header>
      <div className="report-review-body">
        <div className="report-evidence"><small>PHOTO EVIDENCE</small>{evidenceUrl?<Image src={evidenceUrl} alt={`Evidence submitted for incident ${incident.id}`} width={900} height={540} unoptimized/>:<div className="no-evidence">No image was attached to this report</div>}<p><b>Officer observation</b>{incident.description}</p></div>
        <div className="report-information"><div className="report-status-row"><span className={`severity ${incident.severity.toLowerCase()}`}>{incident.severity}</span><span className={pending?"review-pending":"review-complete"}>{pending?"PENDING CONTROL ROOM REVIEW":"REVIEWED"}</span></div><dl>{detailRows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
      </div>
      {pending?<footer className="report-decision"><div><label>Map report to complete registered road<select value={roadId} onChange={event=>setRoadId(event.target.value)}>{roads.map(road=><option value={road.id} key={road.id}>{road.id} · {road.name}</option>)}</select></label><p>This action verifies the report, blocks the selected road end-to-end, holds an exposed vehicle, and calculates a safe alternative.</p></div><button onClick={confirm} disabled={!roadId||confirming}>{confirming?"VERIFYING & REROUTING…":"VERIFY REPORT · BLOCK ROAD · REROUTE"}</button></footer>:<footer className="report-decision reviewed"><p>This report is retained as an audit record. Operational closure controls remain available on the map.</p><button onClick={onClose}>CLOSE REPORT</button></footer>}
    </section>
  </div>;
}

function AdminModule({ active, vehicle, vehicles, roads, incidents, reroute, currentRoute, setNotice, recalculateRisk, resolveIncident, confirmFieldReport, blockRoadFromMap, reopenRoadFromMap, autoMonitor, setAutoMonitor, compactMode, setCompactMode }: ModuleProps) {
  const [reviewIncident,setReviewIncident]=useState<Incident|null>(null);
  const connectivityNodes=["Guwahati","Jorabat","Sonapur","Chandrapur","Khetri","District Relief Hub"];
  const connectivity=connectivityNodes.map((name)=>{
    const linked=roads.filter((road)=>road.name.includes(name));
    const open=linked.filter((road)=>road.status!=="BLOCKED");
    const maxRisk=linked.length?Math.max(...linked.map((road)=>road.risk_score)):0;
    const status=!open.length?"ISOLATED":open.length<linked.length||maxRisk>=50?"DEGRADED":"CONNECTED";
    return {name,linked,open,maxRisk,status};
  });
  const reliefRoads=roads.filter((road)=>road.name.includes("District Relief Hub"));
  const reportingOfficerLastSeen=incidents.filter((item)=>item.source==="FO-014").map((item)=>item.created_at).sort().at(-1);
  if (active === "Database") return <DatabaseExplorer/>;
  if (active === "Live Map") return <section className="module-view live-map-module"><div className="module-toolbar"><div><p>OPERATIONS MAP</p><h1>Live corridor intelligence</h1></div><span className="live-pill"><i/>GPS &amp; RISK FEEDS LIVE</span></div><div className="module-map"><OperationsMap vehicle={vehicle} vehicles={vehicles} roads={roads} incidents={incidents} reroute={reroute} currentRoute={currentRoute} onRoadBlock={blockRoadFromMap} onRoadReopen={reopenRoadFromMap}/></div></section>;

  if (active === "Incidents" || active === "Alerts") {
    const items = incidents.length ? incidents : [{ id: 0, incident_type: "MONITORING", road_id: "ALL", severity: "LOW", description: "No active verified incidents", verified: false, source: "System", created_at: new Date().toISOString() } as Incident];
    return <section className="module-view"><div className="module-toolbar"><div><p>OPERATIONS</p><h1>{active}</h1></div><button onClick={()=>setNotice(`${active} queue refreshed.`)}>REFRESH QUEUE</button></div><div className="incident-board">{items.map((item)=><article key={item.id}><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span><div><h3>{item.incident_type} · {item.road_id}</h3><p>{item.description}</p><small>{item.verified?`Verified by ${item.source}`:"Verification pending · open complete evidence report"}</small></div>{item.id ? <div className="incident-actions"><button onClick={()=>setReviewIncident(item)}>{item.verified?"VIEW REPORT":"REVIEW COMPLETE REPORT"}</button>{item.verified&&<button className="incident-resolve" onClick={()=>resolveIncident(item)}>MARK RESOLVED</button>}</div> : <button disabled>MONITORING</button>}</article>)}</div>{reviewIncident&&<IncidentReviewModal incident={reviewIncident} roads={roads} onClose={()=>setReviewIncident(null)} onConfirm={confirmFieldReport}/>}</section>;
  }

  if (active === "Road Risk") return <section className="module-view"><div className="module-toolbar"><div><p>LIVE RISK ENGINE</p><h1>Road-segment intelligence</h1></div><button onClick={recalculateRisk}>RECALCULATE NOW</button></div><div className="risk-card-grid">{roads.map((road)=><article key={road.id}><div className="risk-number">{road.risk_score}</div><div><h3>{road.id} · {road.name}</h3><p>{road.reason}</p><div className="factor-list">{road.factors?.filter(f=>f.contribution>0).slice(0,4).map(f=><span key={f.name}>{f.name.replaceAll("_"," ")} <b>+{f.contribution}</b></span>)}</div><small>{road.data_status} · Confidence {Math.round(road.confidence*100)}% · {road.data_source}<br/>Observed {road.source_observed_at || road.last_evaluated}</small></div><span className={`severity ${road.risk_level.toLowerCase()}`}>{road.risk_level}</span></article>)}</div></section>;

  if (active === "District Connectivity") return <section className="module-view operations-module"><div className="module-toolbar"><div><p>LIVE NETWORK ANALYSIS</p><h1>District &amp; hub connectivity</h1></div><button onClick={recalculateRisk}>REFRESH CONNECTIVITY</button></div><div className="module-summary"><article><small>MONITORED HUBS</small><b>{connectivity.length}</b><span>Registered corridor nodes</span></article><article><small>CONNECTED</small><b>{connectivity.filter((item)=>item.status==="CONNECTED").length}</b><span>All registered links available</span></article><article><small>DEGRADED</small><b>{connectivity.filter((item)=>item.status==="DEGRADED").length}</b><span>Risky or partially blocked</span></article><article><small>ISOLATED</small><b>{connectivity.filter((item)=>item.status==="ISOLATED").length}</b><span>No registered open link</span></article></div><div className="connectivity-grid">{connectivity.map((item)=><article key={item.name} className={item.status.toLowerCase()}><header><Building2/><div><h3>{item.name}</h3><small>{item.linked.length} registered connection(s)</small></div><strong>{item.status}</strong></header><div className="connectivity-meter"><i style={{width:`${Math.max(4,100-item.maxRisk)}%`}}/></div><dl><div><dt>OPEN LINKS</dt><dd>{item.open.length}/{item.linked.length}</dd></div><div><dt>MAX RISK</dt><dd>{item.maxRisk}/100</dd></div></dl><p>{item.linked.map((road)=>`${road.id} ${road.status}`).join(" · ")||"No registered corridor link"}</p></article>)}</div></section>;

  if (active === "Supply Gaps") return <section className="module-view operations-module"><div className="module-toolbar"><div><p>MISSION ACCESS ANALYSIS</p><h1>Supply delivery gaps</h1></div><button onClick={recalculateRisk}>REFRESH SUPPLY ACCESS</button></div><div className="module-summary"><article><small>ACTIVE MISSIONS</small><b>{vehicles.length}</b><span>Vehicle delivery assignments</span></article><article><small>CRITICAL CARGO</small><b>{vehicles.filter((item)=>item.priority==="CRITICAL").length}</b><span>Priority supply missions</span></article><article><small>RELIEF-HUB LINKS OPEN</small><b>{reliefRoads.filter((road)=>road.status!=="BLOCKED").length}/{reliefRoads.length}</b><span>Last-mile access corridors</span></article><article><small>INVENTORY FEED</small><b>N/A</b><span>No hospital stock connector</span></article></div><div className="supply-layout"><div className="supply-missions">{vehicles.map((item)=><article key={item.vehicle_id}><header><PackageCheck/><div><h3>{item.vehicle_id} · {item.cargo}</h3><small>{item.priority} delivery to {item.destination}</small></div><strong className={item.status==="HOLD_POSITION"?"blocked":"open"}>{item.status}</strong></header><dl><div><dt>ROUTE DECISION</dt><dd>{item.vehicle_id===reroute?.vehicle_id?reroute.status:item.reroute_status}</dd></div><div><dt>ETA</dt><dd>{item.eta_minutes||"—"} min</dd></div><div><dt>LAST INSTRUCTION</dt><dd>{item.last_instruction}</dd></div></dl></article>)}</div><aside className="supply-access"><h3>Relief-hub access</h3>{reliefRoads.map((road)=><div key={road.id}><span><b>{road.id}</b><small>{road.name}</small></span><strong className={road.status.toLowerCase()}>{road.status} · {road.risk_score}/100</strong></div>)}<p><AlertTriangle/>NER-LOGIX can prove route-access gaps from live road data. Quantity shortages remain explicitly unavailable until an authorized inventory system is connected.</p></aside></div></section>;

  if (active === "Users") {
    const users=[
      {id:"ADMIN-001",name:"Assam Control Room",role:"ADMIN",status:"ONLINE",detail:"Current authenticated workspace"},
      {id:"MED-001",name:"Rahul Das",role:"DRIVER",status:vehicle.status||"OFFLINE",detail:`Telemetry: ${vehicle.telemetry_source||"UNAVAILABLE"}`},
      {id:"FO-014",name:"Field Officer 014",role:"FIELD OFFICER",status:reportingOfficerLastSeen?"REPORTING":"NO REPORT",detail:reportingOfficerLastSeen?`Last report ${new Date(reportingOfficerLastSeen).toLocaleString()}`:"No report in active queue"},
    ];
    return <section className="module-view operations-module"><div className="module-toolbar"><div><p>ROLE-BASED ACCESS</p><h1>Authorized prototype users</h1></div><span className="live-pill"><i/>AUTHENTICATED</span></div><div className="module-summary"><article><small>CONFIGURED IDENTITIES</small><b>{users.length}</b><span>Prototype access registry</span></article><article><small>ADMINISTRATORS</small><b>1</b><span>Control Room authority</span></article><article><small>FIELD OFFICERS</small><b>1</b><span>Ground verification role</span></article><article><small>DRIVERS</small><b>1</b><span>Mission execution role</span></article></div><div className="user-grid">{users.map((item)=><article key={item.id}><div className="user-avatar">{item.name.split(" ").map((word)=>word[0]).slice(0,2).join("")}</div><div><h3>{item.name}</h3><p>{item.id} · {item.role}</p><small>{item.detail}</small></div><strong>{item.status.replaceAll("_"," ")}</strong></article>)}</div><div className="module-note"><ShieldAlert/>Permissions are enforced by the API: Admin controls closures, Field Officer submits evidence, and Driver receives approved routes.</div></section>;
  }

  if (active === "Settings") return <section className="module-view operations-module"><div className="module-toolbar"><div><p>PLATFORM</p><h1>Control Room settings</h1></div><button onClick={recalculateRisk}>TEST LIVE REFRESH</button></div><div className="settings-grid functional-settings"><article><h3>Monitoring preferences</h3><label className="setting-switch"><span><b>Continuous route monitoring</b><small>Automatically rerank routes every 10 seconds</small></span><input type="checkbox" checked={autoMonitor} onChange={(event)=>setAutoMonitor(event.target.checked)}/></label><label className="setting-switch"><span><b>Compact interface</b><small>Reduce dashboard spacing for smaller screens</small></span><input type="checkbox" checked={compactMode} onChange={(event)=>setCompactMode(event.target.checked)}/></label></article><article><h3>Operational safeguards</h3><div className="setting-readout"><span>Trusted verification override</span><b>ENFORCED</b></div><div className="setting-readout"><span>End-to-end road closure</span><b>ENFORCED</b></div><div className="setting-readout"><span>Blocked-road route exclusion</span><b>ENFORCED</b></div></article><article><h3>Live service status</h3><div className="setting-readout"><span>Risk feeds</span><b>{roads.some((road)=>road.data_status==="LIVE")?"LIVE":"LIMITED"}</b></div><div className="setting-readout"><span>Vehicle telemetry</span><b>{vehicle.telemetry_source||"UNAVAILABLE"}</b></div><div className="setting-readout"><span>Route decision</span><b>{reroute?.status||"MONITORING"}</b></div><p>Preferences are saved in this browser. Safety policies remain server-enforced and cannot be disabled here.</p></article></div></section>;

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
  const [routeExposure, setRouteExposure] = useState<RouteExposure | null>(null);
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
  const [autoMonitor,setAutoMonitorState]=useState(true);
  const [compactMode,setCompactModeState]=useState(false);
  const [incidentAlert,setIncidentAlert]=useState<Incident|null>(null);
  const [soundEnabled,setSoundEnabled]=useState(true);
  const soundEnabledRef=useRef(true);

  useEffect(()=>{
    setAutoMonitorState(localStorage.getItem("ner_auto_monitor")!=="false");
    setCompactModeState(localStorage.getItem("ner_compact_mode")==="true");
    const enabled=localStorage.getItem("ner_incident_sound")!=="false";
    soundEnabledRef.current=enabled; setSoundEnabled(enabled);
  },[]);

  const playIncidentTone=useCallback((severity="HIGH")=>{
    if(!soundEnabledRef.current)return;
    try{
      const context=new AudioContext();
      const start=context.currentTime;
      const frequencies=severity==="CRITICAL"?[880,660,880]:[740,560];
      frequencies.forEach((frequency,index)=>{
        const oscillator=context.createOscillator();
        const gain=context.createGain();
        const begins=start+index*.18;
        oscillator.type="square"; oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(.0001,begins);
        gain.gain.exponentialRampToValueAtTime(.12,begins+.02);
        gain.gain.exponentialRampToValueAtTime(.0001,begins+.14);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(begins); oscillator.stop(begins+.16);
      });
      window.setTimeout(()=>context.close().catch(()=>null),900);
    }catch{/* Some browsers require a user gesture before audio can start. */}
  },[]);

  const toggleIncidentSound=useCallback(()=>{
    setSoundEnabled((enabled)=>{
      const next=!enabled; soundEnabledRef.current=next;
      localStorage.setItem("ner_incident_sound",String(next));
      if(next)window.setTimeout(()=>playIncidentTone("HIGH"),0);
      setNotice(next?"Incident notification sound enabled.":"Incident notification sound muted. Visual popups remain active.");
      return next;
    });
  },[playIncidentTone]);

  const updateAutoMonitor=useCallback((enabled:boolean)=>{setAutoMonitorState(enabled);localStorage.setItem("ner_auto_monitor",String(enabled));setNotice(enabled?"Continuous 10-second route monitoring enabled.":"Automatic monitoring paused. Manual refresh remains available.");},[]);
  const updateCompactMode=useCallback((enabled:boolean)=>{setCompactModeState(enabled);localStorage.setItem("ner_compact_mode",String(enabled));setNotice(enabled?"Compact Control Room interface enabled.":"Standard Control Room spacing restored.");},[]);

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
    setIncidents(bootstrap.incidents); setReroute(bootstrap.reroute); setRouteExposure(bootstrap.route_exposure||null);
  }, []);

  useEffect(() => {
    load().catch((error) => setNotice(error.message));
    loadRouteMonitor().catch((error)=>setNotice(error.message));
    const routeTimer=autoMonitor?window.setInterval(()=>loadRouteMonitor().catch(()=>null),10000):0;
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
        const incoming=event.data as Incident;
        setIncidents((items) => [incoming, ...items.filter((item) => item.id !== incoming.id)]);
        setIncidentAlert(incoming);
        playIncidentTone(incoming.severity);
        if (event.type === "field.verification" && event.data.road_id !== "UNMAPPED") {
          setClosureRoadId(event.data.road_id);
          setClosureReason(event.data.description || "Verified Field Officer road-safety report");
          setNotice(`${event.data.road_id} officer report received. Review it and use BLOCK REPORTED ROAD if closure is required.`);
        }
      }
      if (event.type === "incident.resolved") {
        setIncidents((items) => items.filter((item) => item.id !== event.data.id));
        setIncidentAlert((current)=>current?.id===event.data.id?null:current);
      }
      if (event.type === "road.reopened") {
        setIncidents((items)=>items.filter((item)=>item.road_id!==event.data.road_id));
        setIncidentAlert((current)=>current?.road_id===event.data.road_id?null:current);
        setRouteExposure((current)=>current?.road_id===event.data.road_id?null:current);
        setNotice(`${event.data.road_id} reopened by Control Room. Route safety is being recalculated.`);
      }
      if (event.type.startsWith("reroute.")) setReroute(event.data);
      if (event.type === "route.hazard_ahead") {
        const exposure:RouteExposure=event.data;
        setRouteExposure(exposure);
        if(exposure.reroute)setReroute(exposure.reroute);
        const eta=exposure.eta_to_hazard_seconds?` · ${exposure.eta_to_hazard_seconds}s at current speed`:"";
        setNotice(`${exposure.urgency}: ${exposure.road_id} hazard ${exposure.distance_ahead_km} km ahead${eta}. ${exposure.action.replaceAll("_"," ")}.`);
      }
      if (event.type !== "vehicle.location") setActivity((items) => [`${event.type.replaceAll(".", " ")} received`, ...items].slice(0, 6));
    });
    return () => {socket.close();window.clearInterval(routeTimer);};
  }, [autoMonitor,load,loadRouteMonitor,playIncidentTone]);

  const blocked = roads.filter((road) => road.status === "BLOCKED").length;
  const highRisk = roads.filter((road) => road.risk_score >= 50).length;
  const focusRoad = routeExposure ? roads.find((road)=>road.id===routeExposure.road_id) : roads.reduce<Road|undefined>((highest,road)=>!highest||road.risk_score>highest.risk_score?road:highest,undefined);
  const latestIncident = incidents[0];
  const activeRoadIds:string[] = simulation?.running
    ? simulation.route_road_ids||[]
    : reroute?.status==="DRIVER_ACCEPTED"
      ? reroute.road_ids||[]
      : (routeMonitor?.routes as MonitoredRoute[]|undefined)?.find((route)=>route.recommended)?.road_ids||[];
  const activeMonitoredRoute:MonitoredRoute|undefined=(routeMonitor?.routes as MonitoredRoute[]|undefined)?.find((route)=>route.road_ids.join("|")===activeRoadIds.join("|"));
  const activeRoads=roads.filter((road)=>activeRoadIds.includes(road.id));
  const currentRisk = activeMonitoredRoute?.risk_score ?? (activeRoads.length?Math.round(activeRoads.reduce((total,road)=>total+road.risk_score,0)/activeRoads.length):0);
  const routeRisk = reroute?.risk_score ?? 0;
  const actionableReroute=Boolean(reroute&&["PENDING_APPROVAL","APPROVED"].includes(reroute.status));
  const rerouteHeading=routeFailure?"No safe route available":reroute?.status==="DRIVER_ACCEPTED"?"Approved route is active":reroute?.status==="APPROVED"?"Route sent to driver":reroute?.status==="PENDING_APPROVAL"?"Safer route awaiting approval":"Monitoring current route";
  const closureRoad=roads.find((road)=>road.id===closureRoadId);
  const closureRoadBlocked=closureRoad?.status==="BLOCKED";

  async function declareClosure() {
    setBusy("flood");
    setRouteFailure("");
    try {
      const result:any=await api("/api/v1/roads/R-02/block", { method: "POST", body: JSON.stringify({
        vehicle_id:"MED-001",start_node:"A",destination_node:"F",
        description:"High water level has submerged the Sonapur carriageway",
      }) });
      setRoads(result.roads);
      setIncidents((items)=>[result.incident,...items.filter((item)=>item.id!==result.incident.id)]);
      setReroute(result.reroute); setRouteFailure(result.route_error||"");
      if(result.current_route)setData((current)=>current?{...current,current_route:result.current_route}:current);
      setNotice(result.reroute?`R-02 blocked end-to-end. ${result.vehicle_held?"MED-001 is holding safely and ":""}a risk-aware reroute is ready.`:"R-02 blocked; no safe route remains. MED-001 is holding.");
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

  const blockEntireRoad = useCallback(async (road:Road, description:string) => {
    const result:any=await api(`/api/v1/roads/${road.id}/block`,{method:"POST",body:JSON.stringify({
      vehicle_id:vehicle.vehicle_id,start_node:"A",destination_node:"F",description,
    })});
    setRoads(result.roads);
    setIncidents((items)=>[result.incident,...items.filter((item)=>item.id!==result.incident.id)]);
    setReroute(result.reroute);
    setRouteFailure(result.route_error||"");
    if(result.current_route)setData((current)=>current?{...current,current_route:result.current_route}:current);
    return result;
  },[vehicle.vehicle_id]);

  const confirmFieldReport = useCallback(async (incident:Incident, roadId:string) => {
    setBusy("field-report-confirmation");
    try {
      const result:any=await api(`/api/v1/incidents/${incident.id}/confirm-closure`,{method:"POST",body:JSON.stringify({
        road_id:roadId,vehicle_id:vehicle.vehicle_id,start_node:"A",destination_node:"F",
      })});
      setRoads(result.roads);
      setIncidents((items)=>[result.incident,...items.filter((item)=>item.id!==incident.id&&item.id!==result.incident.id)]);
      setReroute(result.reroute); setRouteExposure(result.route_exposure||null); setRouteFailure(result.route_error||"");
      if(result.current_route)setData((current)=>current?{...current,current_route:result.current_route}:current);
      await loadRouteMonitor();
      setNotice(result.reroute?`INC-${incident.id} verified. ${roadId} is red and blocked end-to-end; a safer route is ready for approval.`:`INC-${incident.id} verified and ${roadId} blocked. No safe route remains, so the vehicle must hold.`);
      return true;
    } catch(error) {setNotice(error instanceof Error?error.message:"Unable to confirm the field report");return false;}
    finally {setBusy("");}
  },[loadRouteMonitor,vehicle.vehicle_id]);

  async function blockReportedRoad() {
    const road=roads.find((item)=>item.id===closureRoadId);
    if(!road){setNotice("Select a mapped road segment before issuing a closure.");return;}
    if(road.status==="BLOCKED"){
      setBusy("road-closure");
      try {
        const reopened=await reopenRoadFromMap(road);
        if(reopened)setClosureReason("");
      } finally {setBusy("");}
      return;
    }
    setBusy("road-closure");
    try {
      const result=await blockEntireRoad(road,closureReason.trim()||"Control Room closure after verified Field Officer report");
      await loadRouteMonitor();
      setNotice(result.reroute?`${closureRoadId} blocked completely from one endpoint to the other. Safer route generated immediately.`:`${closureRoadId} blocked completely, but no safe route remains. Hold the vehicle at a verified safe point.`);
    } catch(error) {setNotice(error instanceof Error?error.message:"Unable to block the selected road");}
    finally {setBusy("");}
  }

  const blockRoadFromMap = useCallback(async (road:Road) => {
    setBusy("map-road-action");
    const report=incidents.find((item)=>item.road_id===road.id&&item.status==="ACTIVE");
    try {
      const result=await blockEntireRoad(road,report?.description||"Road blocked directly from the Control Room map after an operational safety report");
      await loadRouteMonitor();
      setNotice(result.reroute?`${road.id} blocked end-to-end from the map. Safer route is already available for Control Room approval.`:`${road.id} blocked end-to-end. No safe route remains; hold ${vehicle.vehicle_id}.`);
      return true;
    } catch(error) {setNotice(error instanceof Error?error.message:`Unable to block ${road.id}`);return false;}
    finally {setBusy("");}
  },[blockEntireRoad,incidents,loadRouteMonitor,vehicle.vehicle_id]);

  const reopenRoadFromMap = useCallback(async (road:Road) => {
    setBusy("map-road-action");
    try {
      const result:any=await api(`/api/v1/roads/${road.id}/reopen`,{method:"POST"});
      if(result.roads)setRoads(result.roads);
      else if(result.road)setRoads((items)=>items.map((item)=>item.id===road.id?result.road:item));
      if("reroute" in result)setReroute(result.reroute);
      if(result.current_route)setData((current)=>current?{...current,current_route:result.current_route}:current);
      setRouteFailure("");
      setIncidents((items)=>items.filter((item)=>item.road_id!==road.id));
      await loadRouteMonitor();
      setNotice(result.resumed_current_route?`${road.id} reopened. The held vehicle can safely continue on its optimized route.`:`${road.id} reopened. Remaining closures were checked and routes reranked.`);
      return true;
    } catch(error) {setNotice(error instanceof Error?error.message:`Unable to reopen ${road.id}`);return false;}
    finally {setBusy("");}
  },[loadRouteMonitor]);

  async function resolveIncident(item: Incident) {
    try {
      await api(`/api/v1/incidents/${item.id}/resolve`, {method:"POST"});
      await Promise.all([load(),loadRouteMonitor()]);
      setNotice(`${item.road_id} incident resolved; road risk and route decisions were recalculated.`);
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
      setReroute(null); setRouteExposure(null); setRouteFailure("");
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
    [Construction, "Bridge Feed", "N/A", "orange"], [Radio, "Active Incidents", String(incidents.length), "yellow"],
    [Building2, "District Feed", "N/A", "red"], [CloudOff, "Field Sync", "N/A", "slate"],
  ], [blocked, highRisk, incidents.length, vehicle.telemetry_source, vehicles, simulation?.running]);

  return <RoleGuard role="ADMIN"><div className={`admin-shell${compactMode?" compact-admin":""}`}>
    <aside className="sidebar">
      <div className="side-brand"><span>✦</span><b>NER-LOGIX</b></div>
      <nav>{nav.map(([Icon, label]) => <button className={activeView === label ? "active" : ""} key={label} onClick={()=>setActiveView(label)}><Icon size={17}/><span>{label}</span></button>)}</nav>
      <div className="operator"><span className="avatar">AC</span><span><b>Control Room</b><small>State Officer</small></span></div>
    </aside>
    <main className="admin-main">
      <header className="topbar">
        <div><strong>NER-LOGIX</strong><small>Smart Logistics &amp; Accessibility Intelligence Platform</small><select className="mobile-admin-nav" aria-label="Admin section" value={activeView} onChange={(event)=>setActiveView(event.target.value)}>{nav.map(([,label])=><option value={label} key={label}>{label}</option>)}</select></div>
        <div className="top-actions"><span className="live-pill"><i/>SYSTEM LIVE</span><span>Assam Pilot</span><button className={`notification-sound-button${soundEnabled?" enabled":" muted"}`} onClick={toggleIncidentSound} aria-label={soundEnabled?"Mute incident notification sound":"Enable incident notification sound"} aria-pressed={soundEnabled} title={soundEnabled?"Incident sound on — click to mute":"Incident sound muted — click to enable"}>{soundEnabled?<Bell size={18}/>:<BellOff size={18}/>}<i/></button><span className="avatar">AC</span><button className="icon-button" onClick={() => router.push("/")} aria-label="Sign out"><LogOut size={17}/></button></div>
      </header>
      {incidentAlert&&<aside className={`incident-notification ${incidentAlert.severity.toLowerCase()}`} role="alertdialog" aria-live="assertive" aria-label={`New ${incidentAlert.severity.toLowerCase()} incident`}>
        <div className="incident-notification-icon"><AlertTriangle/></div>
        <div><small>NEW FIELD INCIDENT · JUST NOW</small><h2>{incidentAlert.incident_type} · {incidentAlert.road_id}</h2><p>{incidentAlert.description}</p><span>{incidentAlert.severity} · {incidentAlert.source} · verification {incidentAlert.verified?"complete":"pending"}</span></div>
        <div className="incident-notification-actions"><button onClick={()=>{setActiveView("Incidents");setIncidentAlert(null)}}>REVIEW INCIDENT</button><button className="dismiss" onClick={()=>setIncidentAlert(null)}>DISMISS</button></div>
      </aside>}
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
            <div className={`alert-item ${routeExposure?.urgency==="CRITICAL"?"critical":"warning"}`}><b>{routeExposure?`${routeExposure.urgency} · ${routeExposure.distance_ahead_km} KM AHEAD`:"Mission exposure"}</b><small>{routeExposure?`${routeExposure.road_id} · ${routeExposure.road_name} · ${routeExposure.action.replaceAll("_"," ")}`:highRisk?`${vehicle.vehicle_id} is assigned to a corridor with ${highRisk} high-risk segment(s)`:"No high-risk segment on the monitored corridor"}</small></div>
            <div className="alert-item info"><b>Field verification</b><small>{latestIncident?.verified ? `Verified by ${latestIncident.source}` : latestIncident ? "Verification is pending" : "No verification task required"}</small></div>
            <div className="road-closure-control"><small>CONTROL ROOM ROAD CONTROL</small><div><select aria-label="Road segment to control" value={closureRoadId} onChange={(event)=>setClosureRoadId(event.target.value)}>{roads.map((road)=><option value={road.id} key={road.id}>{road.id} · {road.name} · {road.status}</option>)}</select><button onClick={()=>{if(latestIncident?.road_id&&latestIncident.road_id!=="UNMAPPED"){setClosureRoadId(latestIncident.road_id);setClosureReason(latestIncident.description);}}} disabled={!latestIncident||latestIncident.road_id==="UNMAPPED"}>USE LATEST REPORT</button></div><input aria-label="Road closure reason" value={closureReason} onChange={(event)=>setClosureReason(event.target.value)} placeholder={closureRoadBlocked?"Reopening resolves active incidents for this road":"Officer report or closure reason"} disabled={closureRoadBlocked}/><button className={closureRoadBlocked?"reopen-road-button":"block-road-button"} onClick={blockReportedRoad} disabled={busy==="road-closure"||busy==="map-road-action"}>{busy==="road-closure"||busy==="map-road-action"?(closureRoadBlocked?"REOPENING & RERANKING…":"BLOCKING & RERANKING…"):(closureRoadBlocked?`REOPEN ${closureRoadId} · MARK SAFE`:`BLOCK ${closureRoadId} · MARK UNSAFE`)}</button></div>
          </section>
          <section className="panel vehicle-panel"><div className="panel-title"><Truck size={16}/> SELECTED VEHICLE</div>
            <h3>{vehicle.vehicle_id}</h3><p>{vehicle.cargo}</p>
            <dl><div><dt>Priority</dt><dd className="danger-text">{vehicle.priority}</dd></div><div><dt>Speed</dt><dd>{vehicle.speed_kmph} km/h</dd></div><div><dt>ETA</dt><dd>{vehicle.eta_minutes} min</dd></div><div><dt>Status</dt><dd>{vehicle.status}</dd></div></dl>
          </section>
          <section className="panel ai-panel"><div className="panel-title"><CircleGauge size={16}/> RISK-AWARE ROUTE DECISION</div>
            <h3>{rerouteHeading}</h3>
            {routeFailure && <p className="no-route-warning">All graph paths are blocked or above the permitted safety threshold. Vehicle movement requires a verified corridor.</p>}
            <div className="risk-compare"><span>Current route risk <b className={currentRisk>=50?"danger-text":"safe-text"}>{currentRisk}/100</b></span>{reroute&&<><span>{actionableReroute?"Candidate risk":"Active route risk"} <b className="safe-text">{routeRisk}/100</b></span><span>{actionableReroute?"Candidate ETA":"Active ETA"} <b>{reroute.eta_minutes} min</b></span></>}<span>Risk-data confidence <b className="safe-text">{Math.round((focusRoad?.confidence||0)*100)}%</b></span></div>
            {routeFailure ? <button className="danger-button" disabled={busy === "hold" || vehicle.status === "HOLD_POSITION"} onClick={holdVehicle}>{vehicle.status === "HOLD_POSITION" ? "VEHICLE HOLDING" : busy === "hold" ? "SENDING HOLD…" : "HOLD VEHICLE"}</button> : <button className="primary-button" disabled={!reroute || reroute.status !== "PENDING_APPROVAL" || busy === "approve"} onClick={approve}>{reroute?.status === "APPROVED" ? "SENT TO DRIVER" : reroute?.status === "DRIVER_ACCEPTED" ? "DRIVER ACCEPTED" : busy === "approve" ? "APPROVING…" : "APPROVE REROUTE"}</button>}
            <button className="secondary-button" onClick={()=>setActiveView("Road Risk")}>VIEW LIVE REASONING</button>
          </section>
        </aside>
      </section>
      <section className="insight-grid">
        <article className="panel"><div className="panel-title">HIGHEST-RISK ROAD · {focusRoad?.id||"—"}</div><div className="big-risk"><b>{focusRoad?.risk_score||0}</b><span>/100<br/>{focusRoad?.risk_level || "INITIALIZING"}</span></div><p>{focusRoad?.reason || "Waiting for live data"}</p><small>{focusRoad?.data_status || "INITIALIZING"} · Confidence {Math.round((focusRoad?.confidence || 0)*100)}%<br/>{focusRoad?.data_source || "No source yet"}</small></article>
        <article className="panel"><div className="panel-title">INCIDENT MANAGEMENT</div>{incidents.length?incidents.slice(0,4).map(item=><div className="mini-row" key={item.id}><span>{item.incident_type} · {item.road_id}</span><b className={item.severity==="CRITICAL"?"danger-text":"warning-text"}>{item.severity}</b><button onClick={()=>setActiveView("Incidents")}>{item.verified?"View":"Review"}</button></div>):<p>No active incident reports.</p>}</article>
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
          <small className={simulation?.running?"simulation-live":""}>{simulation?.running?(simulation.paused?`DEMO GPS REPLAY · ${vehicles.length} vehicle(s) HOLDING for safe reroute`:`DEMO GPS REPLAY · ${vehicles.length} moving vehicles · ${simulation.source_name} → ${simulation.destination_name}`):"Replay is visibly labelled and separate from production device telemetry."}{preTrip && <><br/>Pre-trip risk {preTrip.risk_score}/100 · {preTrip.recommendation}</>}</small>
        </article>
      </section></> : <AdminModule active={activeView} vehicle={vehicle} vehicles={vehicles} roads={roads} incidents={incidents} reroute={reroute} currentRoute={data?.current_route || []} setNotice={setNotice} recalculateRisk={recalculateRisk} resolveIncident={resolveIncident} confirmFieldReport={confirmFieldReport} blockRoadFromMap={blockRoadFromMap} reopenRoadFromMap={reopenRoadFromMap} autoMonitor={autoMonitor} setAutoMonitor={updateAutoMonitor} compactMode={compactMode} setCompactMode={updateCompactMode}/>}
      <footer className="status-footer"><span className="live-dot"/>{notice}<button onClick={load}><RefreshCw size={14}/> Refresh</button></footer>
    </main>
  </div></RoleGuard>;
}
