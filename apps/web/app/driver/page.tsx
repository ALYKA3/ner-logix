"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, CloudOff, Gauge, Headphones, LogOut, MapPin, Navigation, PhoneCall, Radio, Route, ShieldCheck, Siren, Truck, Volume2 } from "lucide-react";
import OperationsMap from "@/components/OperationsMap";
import PwaRegister from "@/components/PwaRegister";
import RoleGuard from "@/components/RoleGuard";
import { api, connectFleetSocket, getBootstrap } from "@/lib/api";
import { pendingCount, postOrQueue } from "@/lib/offline";
import type { Bootstrap, Reroute, Vehicle } from "@/lib/types";

export default function DriverPage() {
  const router = useRouter();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [reroute, setReroute] = useState<Reroute | null>(null);
  const [view, setView] = useState<"route"|"report"|"success">("route");
  const [message, setMessage] = useState("Standing water is making the road unsafe");
  const [notice, setNotice] = useState("Connected to Assam Control Room");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [sosConfirm, setSosConfirm] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  const gpsWatch = useRef<number | null>(null);

  useEffect(() => {
    getBootstrap().then((bootstrap) => { setData(bootstrap); setVehicle(bootstrap.vehicle); setReroute(bootstrap.reroute); });
    const socket = connectFleetSocket((event) => {
      if (event.type === "vehicle.location" || event.type === "connected") setVehicle(event.data);
      if (event.type === "fleet.snapshot" || event.type === "simulation.started") {
        const selected = event.data.vehicles?.find((item: Vehicle) => item.vehicle_id === "MED-001") || event.data.vehicles?.[0];
        if (selected) setVehicle(selected);
        if (event.data.current_route) setData((current)=>current ? {...current,current_route:event.data.current_route} : current);
      }
      if (event.type === "socket.online") setNotice("Realtime channel connected to Assam Control Room");
      if (event.type === "socket.offline") setNotice("Realtime channel reconnecting…");
      if (event.type === "roads.risk_updated") setData((current)=>current ? {...current, roads:event.data} : current);
      if (event.type === "incident.created" || event.type === "field.verification") setData((current)=>current ? {...current,incidents:[event.data,...current.incidents.filter(item=>item.id!==event.data.id)]} : current);
      if (event.type === "incident.resolved") setData((current)=>current ? {...current,incidents:current.incidents.filter(item=>item.id!==event.data.id)} : current);
      if (event.type.startsWith("reroute.")) { setReroute(event.data); setNotice(event.type === "reroute.approved" ? "New route approved by Control Room" : "Route status updated"); }
    });
    const updateNetwork = () => { setOnline(navigator.onLine); pendingCount().then(setPending); };
    updateNetwork(); window.addEventListener("online", updateNetwork); window.addEventListener("offline", updateNetwork);
    return () => { socket.close(); if(gpsWatch.current!==null) navigator.geolocation.clearWatch(gpsWatch.current); window.removeEventListener("online", updateNetwork); window.removeEventListener("offline", updateNetwork); };
  }, []);

  function startLiveGps() {
    if (!navigator.geolocation) { setNotice("This device does not expose GPS."); return; }
    setNotice("Requesting device GPS permission…");
    gpsWatch.current = navigator.geolocation.watchPosition(async (position) => {
      try {
        const result: Vehicle = await api("/api/v1/telemetry/vehicles/MED-001/location", {method:"POST", body:JSON.stringify({
          lat:position.coords.latitude, lng:position.coords.longitude,
          speed_kmph:Math.max(0,(position.coords.speed || 0)*3.6), accuracy_m:position.coords.accuracy,
          heading_degrees:position.coords.heading, captured_at:new Date(position.timestamp).toISOString(),
        })});
        setVehicle(result); setGpsActive(true); setNotice(`Device GPS live · accuracy ±${Math.round(position.coords.accuracy)} m`);
      } catch(error) { setNotice(error instanceof Error?error.message:"GPS upload failed"); }
    }, (error)=>setNotice(`GPS unavailable: ${error.message}`), {enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }

  async function acceptRoute() {
    if (!reroute) return;
    try {
      const result: Reroute = await api(`/api/v1/driver/MED-001/routes/${reroute.id}/accept`, { method: "POST" });
      setReroute(result); setNotice("Route accepted. Follow the safer route via Chandrapur.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to accept route"); }
  }

  async function reportUnsafe() {
    try {
      const result: any = await postOrQueue("/api/v1/driver/MED-001/reports", { message, lat: vehicle?.lat, lng: vehicle?.lng });
      setNotice(result.queued ? "Saved offline. Report will sync automatically." : "Unsafe-road report sent to Control Room.");
      setPending(await pendingCount()); setView("success");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to submit unsafe-road report"); }
  }

  async function sendSos() {
    setSosConfirm(false);
    try {
      const result: any = await postOrQueue("/api/v1/driver/MED-001/sos", { message: "Vehicle stuck — emergency assistance required", lat: vehicle?.lat, lng: vehicle?.lng });
      setNotice(result.queued ? "SOS stored offline; call Control Room if possible." : "SOS acknowledged by Control Room.");
      setPending(await pendingCount());
    } catch (error) { setNotice(error instanceof Error ? error.message : "SOS could not be sent"); }
  }

  const routeApproved = reroute?.status === "APPROVED" || reroute?.status === "DRIVER_ACCEPTED";
  const navigating = reroute?.status === "DRIVER_ACCEPTED";
  const hazardRoad = data?.roads.find(road=>road.status==="BLOCKED") || data?.roads.find(road=>road.risk_score>=50);
  const liveRouteRisk = data?.roads.length ? Math.max(...data.roads.map(road=>road.risk_score)) : null;
  const routeCoordinates = reroute?.coordinates || [];
  const nearestRouteIndex = vehicle && routeCoordinates.length ? routeCoordinates.reduce((best,indexed,index)=>{
    const distance=(indexed[0]-vehicle.lat)**2+(indexed[1]-vehicle.lng)**2;
    return distance<best.distance?{index,distance}:best;
  },{index:0,distance:Number.POSITIVE_INFINITY}).index : 0;
  const routeProgress = routeCoordinates.length>1 ? Math.min(100,Math.round(nearestRouteIndex/(routeCoordinates.length-1)*100)) : 0;
  const routeStops = reroute?.route_name.split(" → ") || [];
  const nextStop = routeStops[Math.min(nearestRouteIndex+1,Math.max(0,routeStops.length-1))] || vehicle?.destination || "Destination";
  const remainingDistance = reroute ? Math.max(.1,reroute.distance_km*(1-routeProgress/100)) : 0;
  const remainingEta = reroute ? Math.max(1,Math.round(reroute.eta_minutes*(1-routeProgress/100))) : vehicle?.eta_minutes || 0;
  return <RoleGuard role="DRIVER"><main className="mobile-workspace driver-workspace"><PwaRegister/>
    <header className="mobile-header"><div className="mobile-brand"><Truck/><span><b>NER-LOGIX DRIVER</b><small>MED-001 · Critical Medicines</small></span></div><button onClick={()=>router.push("/")} aria-label="Sign out"><LogOut/></button></header>
    <div className="connectivity"><span className={online?"online":"offline"}>{online?<Radio/>:<CloudOff/>}{online?`Online · ${gpsActive||vehicle?.telemetry_source==="DEVICE_GPS"?"device GPS live":"GPS not started"}`:"Offline mode"}</span><span>{pending} pending sync</span></div>

    {view === "route" && navigating && vehicle && data && reroute && <section className="driver-navigation">
      <div className="navigation-stage">
        <OperationsMap navigation compact vehicle={vehicle} roads={data.roads} incidents={data.incidents} reroute={reroute} currentRoute={[]}/>
        <div className="turn-card"><span className="turn-icon"><Navigation/></span><div><small>NEXT SAFE WAYPOINT</small><b>Continue towards {nextStop}</b><p>{remainingDistance.toFixed(1)} km remaining on approved corridor</p></div><button aria-label="Voice navigation"><Volume2/></button></div>
        <div className="navigation-status"><span><i/>LIVE GPS</span><b>{Math.round(vehicle.speed_kmph)} <small>km/h</small></b></div>
      </div>
      <div className="trip-sheet">
        <div className="sheet-handle"/>
        <div className="trip-destination"><span><MapPin/></span><div><small>DESTINATION</small><h1>{vehicle.destination}</h1><p>{vehicle.cargo} · <b>CRITICAL DELIVERY</b></p></div></div>
        <div className="trip-primary-metrics"><span><Clock3/><div><b>{remainingEta} min</b><small>ETA {new Date(Date.now()+remainingEta*60000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</small></div></span><span><Route/><div><b>{remainingDistance.toFixed(1)} km</b><small>{routeProgress}% route complete</small></div></span><span><ShieldCheck/><div><b className="safe-text">{reroute.risk_score}/100</b><small>LOWER RISK</small></div></span></div>
        <div className="route-progress"><i style={{width:`${routeProgress}%`}}/><span className="progress-truck" style={{left:`calc(${routeProgress}% - 9px)`}}><Truck/></span></div>
        <div className="route-detail-line"><span><Radio/>Approved by {reroute.approved_by||"Control Room"}</span><span><Gauge/>{vehicle.telemetry_source?.replaceAll("_"," ")}</span></div>
        <button className="route-details-button" onClick={()=>setNotice(`${reroute.route_name} · ${reroute.reason}`)}><Route/>VIEW FULL ROUTE DETAILS</button>
        {!gpsActive && vehicle.telemetry_source!=="DEVICE_GPS" && vehicle.telemetry_source!=="DEMO_GPS_REPLAY" && <button className="driver-primary gps-button" onClick={startLiveGps}><Navigation/> START DEVICE GPS</button>}
        <div className="navigation-actions"><button onClick={()=>setView("report")}><AlertTriangle/>REPORT UNSAFE</button><button onClick={()=>setNotice("Calling Assam Control Room…")}><PhoneCall/>CONTROL ROOM</button><button className="sos" onClick={()=>setSosConfirm(true)}><Siren/>SOS</button></div>
        <div className="driver-note"><Headphones/><span>{notice}</span></div>
      </div>
    </section>}

    {view === "route" && !navigating && <>
      <section className={`instruction-banner ${routeApproved?"approved":"warning"}`}>
        {routeApproved?<CheckCircle2/>:<AlertTriangle/>}<div><b>{routeApproved?"NEW ROUTE APPROVED":hazardRoad?"ROAD RISK AHEAD":"LIVE MONITORING"}</b><p>{routeApproved?`Approved by ${reroute?.approved_by||"Control Room"}`:hazardRoad?`${hazardRoad.id} · ${hazardRoad.reason}`:"No high-risk signal on the monitored corridor."}</p></div>
      </section>
      {vehicle && data && <section className="mobile-map-card"><OperationsMap compact vehicle={vehicle} roads={data.roads} incidents={data.incidents} reroute={reroute} currentRoute={data.current_route}/><div className="next-action"><Navigation/><span><small>NEXT SAFE ACTION</small><b>{routeApproved?reroute?.route_name:hazardRoad?`Wait for authority decision on ${hazardRoad.id}`:"Continue with live monitoring"}</b></span></div></section>}
      <section className="mission-card"><div className="mission-heading"><span><small>MISSION</small><b>MED-001</b></span><strong>CRITICAL</strong></div><h2>{vehicle?.cargo}</h2><p>Destination · {vehicle?.destination}</p><div className="mission-metrics"><span><small>ETA</small><b>{reroute?.eta_minutes ?? vehicle?.eta_minutes ?? "—"} min</b></span><span><small>DISTANCE</small><b>{reroute?`${reroute.distance_km} km`:"—"}</b></span><span><small>SPEED</small><b>{vehicle?.speed_kmph ?? 0} km/h</b></span><span><small>ROUTE RISK</small><b className={routeApproved?"safe-text":"warning-text"}>{reroute?.risk_score ?? liveRouteRisk ?? "—"}/100</b></span></div></section>
      {reroute && <section className="route-approval-card"><ShieldCheck/><div><small>AUTHORITY DECISION</small><b>{reroute.status.replaceAll("_"," ")}</b><p>Latest route risk {reroute.risk_score}/100 · ETA {reroute.eta_minutes} min</p></div></section>}
      {!gpsActive && vehicle?.telemetry_source!=="DEVICE_GPS" && <button className="driver-primary gps-button" onClick={startLiveGps}><Navigation/> START DEVICE GPS</button>}
      <button className="driver-primary" disabled={!routeApproved || reroute?.status === "DRIVER_ACCEPTED"} onClick={acceptRoute}>{reroute?.status === "DRIVER_ACCEPTED"?"ROUTE ACCEPTED":"ACCEPT APPROVED ROUTE"}</button>
      <div className="driver-actions"><button onClick={()=>setView("report")}><AlertTriangle/>REPORT UNSAFE</button><button onClick={()=>setNotice("Calling Assam Control Room…")}><PhoneCall/>CALL CONTROL ROOM</button><button className="sos" onClick={()=>setSosConfirm(true)}><Siren/>SOS</button></div>
      <div className="driver-note"><Headphones/><span>{notice}</span></div>
    </>}

    {view === "report" && <section className="mobile-form-page"><button className="back-button" onClick={()=>setView("route")}><ArrowLeft/>Back to route</button><h1>Report Unsafe Road</h1><p>Share the condition ahead. Your live location will be attached.</p><label>Incident type<select><option>Flood / Waterlogging</option><option>Landslide</option><option>Road blockage</option><option>Bridge damage</option></select></label><label>Severity<select><option>High</option><option>Critical</option><option>Medium</option></select></label><label>Description<textarea value={message} onChange={(event)=>setMessage(event.target.value)} rows={5}/></label><div className="location-chip"><Navigation/>GPS {vehicle?.lat.toFixed(4)}, {vehicle?.lng.toFixed(4)} · {vehicle?.telemetry_source || "NO DEVICE FIX"} {vehicle?.accuracy_m?`· accuracy ±${Math.round(vehicle.accuracy_m)} m`:""}</div><button className="driver-primary" onClick={reportUnsafe}>SEND REPORT</button></section>}

    {view === "success" && <section className="success-screen"><CheckCircle2/><h1>Report submitted</h1><p>{notice}</p><button className="driver-primary" onClick={()=>setView("route")}>RETURN TO ROUTE</button></section>}

    {sosConfirm && <div className="modal-backdrop"><div className="sos-modal"><Siren/><h2>Send emergency SOS?</h2><p>Your live location, vehicle ID and mission details will be sent to the Control Room.</p><button className="sos-confirm" onClick={sendSos}>PRESS TO CONFIRM SOS</button><button className="secondary-button" onClick={()=>setSosConfirm(false)}>CANCEL</button></div></div>}
  </main></RoleGuard>;
}
