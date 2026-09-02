"use client";
/* Photo previews use temporary object URLs, which are not compatible with next/image. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, CheckCircle2, CloudOff, FileCheck2, History, LocateFixed, LogOut, Map as MapIcon, MapPin, PlusCircle, Radio, ShieldCheck, Upload } from "lucide-react";
import OperationsMap from "@/components/OperationsMap";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import OfflineQueuePanel from "@/components/OfflineQueuePanel";
import PwaRegister from "@/components/PwaRegister";
import RoleGuard from "@/components/RoleGuard";
import { api, getBootstrap } from "@/lib/api";
import { pendingCount, postOrQueue } from "@/lib/offline";
import {translate,type AppLanguage} from "@/lib/i18n";
import type { Bootstrap, Incident, Vehicle } from "@/lib/types";

type Step = "capture" | "details" | "success" | "history" | "offline";
type Fix = {lat:number;lng:number;accuracy:number};

function fileAsDataUrl(file:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})}

export default function FieldOfficerPage() {
  const router=useRouter();
  const [step,setStep]=useState<Step>("capture");
  const [online,setOnline]=useState(true);
  const [pending,setPending]=useState(0);
  const [photo,setPhoto]=useState<File|null>(null);
  const [preview,setPreview]=useState("");
  const [location,setLocation]=useState<Fix|null>(null);
  const [locationError,setLocationError]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<any>(null);
  const [bootstrap,setBootstrap]=useState<Bootstrap|null>(null);
  const [history,setHistory]=useState<Incident[]>([]);
  const [language,setLanguage]=useState<AppLanguage>("en");
  const [form,setForm]=useState({road_id:"R-02",landmark:"",incident_type:"FLOOD",incident_type_other:"",road_status:"CAUTION",severity:"MEDIUM",description:"",affected_direction:"BOTH",vehicle_access:"ALL",clearance_estimate:"Unknown"});

  useEffect(()=>{
    setLanguage((localStorage.getItem("ner_language") as AppLanguage)||"en");
    getBootstrap().then(setBootstrap).catch(()=>null);
    api<Incident[]>("/api/v1/incidents").then(setHistory).catch(()=>null);
    const update=()=>{setOnline(navigator.onLine);pendingCount().then(setPending)};
    update(); window.addEventListener("online",update); window.addEventListener("offline",update); window.addEventListener("ner-offline-queue-change",update);
    return()=>{window.removeEventListener("online",update);window.removeEventListener("offline",update);window.removeEventListener("ner-offline-queue-change",update)};
  },[]);

  const changeLanguage=(next:AppLanguage)=>{setLanguage(next);localStorage.setItem("ner_language",next)};
  const t=(key:string)=>translate(language,key);

  const mapVehicle:Vehicle|undefined=bootstrap ? {...bootstrap.vehicle,...(location?{lat:location.lat,lng:location.lng,accuracy_m:location.accuracy,telemetry_source:"FIELD_GPS",status:"FIELD_VERIFICATION"}:{})} : undefined;
  const customFieldsReady=form.road_id!=="UNMAPPED"||!!form.landmark.trim();
  const inspectionTypeReady=form.incident_type!=="OTHER"||!!form.incident_type_other.trim();

  function captureLocation(){
    if(!navigator.geolocation){setLocationError("GPS is not available on this device");return}
    setLocationError("Requesting a high-accuracy GPS fix…");
    navigator.geolocation.getCurrentPosition(position=>{
      setLocation({lat:position.coords.latitude,lng:position.coords.longitude,accuracy:Math.round(position.coords.accuracy)});
      setLocationError("");
    },error=>setLocationError(error.message),{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  }

  function choosePhoto(file?:File){if(!file)return;if(file.size>5*1024*1024){setResult({error:"Photo must be 5 MB or smaller"});return}setPhoto(file);setPreview(URL.createObjectURL(file));setResult(null)}

  async function submit(){
    if(!form.description.trim()||!customFieldsReady||!inspectionTypeReady)return;
    setBusy(true); setResult(null);
    try{
      let photo_url:string|null=null;
      let photo_data_url:string|null=null;
      if(photo&&navigator.onLine){const upload=new FormData();upload.append("photo",photo);const response:any=await api("/api/v1/uploads/incident-photo",{method:"POST",body:upload});photo_url=response.photo_url}
      if(photo&&!navigator.onLine)photo_data_url=await fileAsDataUrl(photo);
      const selectedRoad=bootstrap?.roads.find(road=>road.id===form.road_id);
      const roadCoordinate=selectedRoad?.coordinates[Math.floor((selectedRoad.coordinates.length-1)/2)];
      const reportLocation=location?{lat:location.lat,lng:location.lng}:{lat:roadCoordinate?.[0]??26.1127,lng:roadCoordinate?.[1]??91.9898};
      const response:any=await postOrQueue("/api/v1/field/verify",{...form,...reportLocation,photo_url,photo_data_url});
      setResult(response.queued?{queued:true,id:`OFF-${Date.now()}`}:response);if(!response.queued)setHistory(items=>[response,...items]);setPending(await pendingCount());setStep("success");
    }catch(error){setResult({error:error instanceof Error?error.message:"Submission failed"})}finally{setBusy(false)}
  }

  return <RoleGuard role="FIELD_OFFICER"><main className="mobile-workspace field-workspace"><PwaRegister/>
    <header className="mobile-header field-header"><div className="mobile-brand"><ShieldCheck/><span><b>NER-LOGIX FIELD</b><small>Authenticated Field Officer</small></span></div><div className="mobile-header-actions"><LanguageSwitcher language={language} onChange={changeLanguage}/><button onClick={()=>router.push("/")} aria-label="Sign out"><LogOut/></button></div></header>
    <div className="connectivity"><span className={online?"online":"offline"}>{online?<Radio/>:<CloudOff/>}{online?t("online"):t("offline")}</span><button className="pending-sync-link" onClick={()=>setStep("offline")}>{pending} {t("pending")}</button></div>
    <nav className="field-mobile-tabs"><button className={step==="capture"?"active":""} onClick={()=>setStep("capture")}><MapIcon/>{t("sectorMap")}</button><button className={step==="details"?"active":""} onClick={()=>setStep("details")}><PlusCircle/>{t("report")}</button><button className={step==="history"?"active":""} onClick={()=>setStep("history")}><History/>{t("history")}</button><button className={step==="offline"?"active":""} onClick={()=>setStep("offline")}><CloudOff/>{t("offlineQueue")}</button></nav>

    {step==="offline"&&<section className="offline-page"><OfflineQueuePanel language={language}/></section>}

    {step==="history"&&<section className="field-history"><div className="assignment-banner"><History/><span><small>SYNCED OPERATIONS LOG</small><b>Incident verification history</b></span></div>{history.map(item=><article key={item.id}><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span><div><b>{item.incident_type} · {item.road_id}</b><p>{item.description}</p><small>{item.status} · {new Date(item.created_at).toLocaleString()}</small></div></article>)}{!history.length&&<p>No reports submitted yet.</p>}</section>}

    {step==="capture"&&<section className="field-capture">
      <div className="assignment-banner"><FileCheck2/><span><small>{t("groundVerification")}</small><b>No road condition is pre-assumed</b></span></div>
      <h1>{t("sectorTitle")}</h1><p>{t("sectorDescription")}</p>
      <div className="field-live-map">{mapVehicle&&bootstrap&&<OperationsMap compact vehicle={mapVehicle} roads={bootstrap.roads} incidents={bootstrap.incidents} reroute={bootstrap.reroute} currentRoute={bootstrap.current_route}/>}<div className="coordinates">{location?`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} · accuracy ±${location.accuracy} m`:"Satellite sector map · no officer GPS fix captured"}</div></div>
      <button className="location-button" onClick={captureLocation}><LocateFixed/>{location?t("refreshLocation"):t("useLocation")}</button>{locationError&&<p className="form-error">{locationError}</p>}
      <button className="field-primary" onClick={()=>setStep("details")}>{t("openReport")}</button>
    </section>}

    {step==="details"&&<section className="mobile-form-page">
      <button className="back-button" onClick={()=>setStep("capture")}><ArrowLeft/>{t("sectorMap")}</button><h1>{t("reportTitle")}</h1><p>{t("reportDescription")}</p>
      <div className="form-grid">
        <label>{t("roadSegment")}<select value={form.road_id} onChange={e=>setForm({...form,road_id:e.target.value})}>{["R-01","R-02","R-03","R-04","R-05","R-06","R-07","R-08"].map(id=><option key={id}>{id}</option>)}<option value="UNMAPPED">Road unknown — use landmark</option></select></label>
        <label>{t("inspectionType")}<select value={form.incident_type} onChange={e=>setForm({...form,incident_type:e.target.value})}><option value="FLOOD">Flood</option><option value="LANDSLIDE">Landslide</option><option value="BLOCKAGE">Road blockage</option><option value="BRIDGE_DAMAGE">Bridge damage</option><option value="OTHER">Other</option></select></label>
        {form.road_id==="UNMAPPED"&&<label className="conditional-field">Nearest landmark / place name<input value={form.landmark} onChange={e=>setForm({...form,landmark:e.target.value})} placeholder="Example: Near Sonapur market, beside NH-27"/><small>Used by Control Room to identify and map the road.</small></label>}
        {form.incident_type==="OTHER"&&<label className="conditional-field">What is the inspection type?<input value={form.incident_type_other} onChange={e=>setForm({...form,incident_type_other:e.target.value})} placeholder="Example: Culvert collapse or fallen electric pole"/><small>Describe the condition category in a few words.</small></label>}
        <label>{t("roadStatus")}<select value={form.road_status} onChange={e=>setForm({...form,road_status:e.target.value})}><option value="SAFE">Safe</option><option value="CAUTION">Passable with caution</option><option value="RESTRICTED">Restricted</option><option value="BLOCKED">Completely blocked</option></select></label>
        <label>{t("severity")}<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select></label>
        <label>{t("direction")}<select value={form.affected_direction} onChange={e=>setForm({...form,affected_direction:e.target.value})}><option value="BOTH">Both directions</option><option value="EASTBOUND">Eastbound</option><option value="WESTBOUND">Westbound</option></select></label>
        <label>{t("vehicleAccess")}<select value={form.vehicle_access} onChange={e=>setForm({...form,vehicle_access:e.target.value})}><option value="ALL">All vehicles</option><option value="LIGHT_ONLY">Light vehicles only</option><option value="EMERGENCY_ONLY">Emergency vehicles only</option><option value="NONE">No vehicles</option></select></label>
        <label>{t("clearance")}<select value={form.clearance_estimate} onChange={e=>setForm({...form,clearance_estimate:e.target.value})}><option>Under 1 hour</option><option>1–3 hours</option><option>More than 3 hours</option><option>Unknown</option></select></label>
      </div>
      <label>{t("description")}<textarea required rows={5} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe only what you observed"/></label>
      <section className="optional-evidence"><div><small>OPTIONAL EVIDENCE</small><b>{t("addEvidence")}</b></div><button className="report-location-button" onClick={captureLocation}><LocateFixed/>{location?"REFRESH GPS":"ADD CURRENT LOCATION"}</button>{locationError&&<p className="form-error">{locationError}</p>}<label className="photo-drop compact-photo-drop">{preview?<img src={preview} alt="Incident evidence preview"/>:<><Camera/><b>Upload or capture photo</b><small>Optional · JPG, PNG or WebP · maximum 5 MB</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event=>choosePhoto(event.target.files?.[0])}/></label>{(location||photo)&&<div className="evidence-summary">{preview&&<img src={preview} alt="Attached evidence"/>}<span>{location?<><MapPin/>GPS accuracy ±{location.accuracy} m</>:<><MapPin/>Using selected road coordinates</>}<br/>{photo?<><Upload/>Photo ready to {online?"upload":"submit when online"}</>:<><Upload/>No photo attached</>}</span></div>}</section>{result?.error&&<p className="form-error">{result.error}</p>}
      <button className="field-primary" onClick={submit} disabled={busy||!form.description.trim()||!customFieldsReady||!inspectionTypeReady}>{busy?t("submitting"):t("submitReview")}</button>
    </section>}

    {step==="success"&&<section className="success-screen field-success"><CheckCircle2/><h1>{result?.queued?t("savedOffline"):t("synced")}</h1><p>{result?.queued?t("syncPending"):"Control Room review is pending. Confirmed closures will trigger immediate rerouting."}</p><div className="report-receipt"><span><small>INCIDENT ID</small><b>{result?.id||"PENDING"}</b></span><span><small>STATUS</small><b>{result?.queued?"PENDING SYNC":"PENDING REVIEW"}</b></span><span><small>ROAD</small><b>{form.road_id}</b></span><span><small>TIME</small><b>{new Date().toLocaleTimeString()}</b></span></div>{result?.queued&&<button className="secondary-button queue-view-button" onClick={()=>setStep("offline")}>{t("offlineQueue")}</button>}<button className="field-primary" onClick={()=>{setStep("capture");setPhoto(null);setPreview("");setLocation(null);setForm({...form,description:""})}}>{t("newVerification")}</button></section>}
  </main></RoleGuard>;
}
