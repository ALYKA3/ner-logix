"use client";

import {useCallback,useEffect,useState} from "react";
import {Camera,CloudOff,MapPin,RefreshCw} from "lucide-react";
import {flushQueue,queuedRequests,type QueuedRequest} from "@/lib/offline";
import {translate,type AppLanguage} from "@/lib/i18n";

export default function OfflineQueuePanel({language}:{language:AppLanguage}){
  const [items,setItems]=useState<QueuedRequest[]>([]);
  const [online,setOnline]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [lastResult,setLastResult]=useState("");
  const refresh=useCallback(async()=>{setOnline(navigator.onLine);setItems(await queuedRequests())},[]);
  useEffect(()=>{refresh();window.addEventListener("online",refresh);window.addEventListener("offline",refresh);window.addEventListener("ner-offline-queue-change",refresh);return()=>{window.removeEventListener("online",refresh);window.removeEventListener("offline",refresh);window.removeEventListener("ner-offline-queue-change",refresh)}},[refresh]);
  async function sync(){setSyncing(true);try{const sent=await flushQueue();setLastResult(`${sent} report(s) synchronized`);await refresh()}finally{setSyncing(false)}}
  return <section className="offline-queue-panel"><header><div><CloudOff/><span><small>{translate(language,"queueTitle")}</small><b>{items.length} {translate(language,"pending")}</b></span></div><button onClick={sync} disabled={!online||!items.length||syncing}><RefreshCw/>{syncing?translate(language,"syncing"):translate(language,"syncNow")}</button></header><p>{translate(language,"queueDescription")}</p>{lastResult&&<div className="sync-result">{lastResult}</div>}<div className="offline-report-list">{items.map((item)=><article key={item.id}><div className="offline-report-top"><strong>{item.path.includes("sos")?"SOS":item.body?.incident_type||"ROAD REPORT"}</strong><span className={online?"ready":"waiting"}>{online?translate(language,"readySync"):translate(language,"waitingNetwork")}</span></div><p>{item.body?.description||item.body?.message||"Stored operational report"}</p><div><span><MapPin/>{item.body?.road_id||item.body?.landmark||`${Number(item.body?.lat||0).toFixed(4)}, ${Number(item.body?.lng||0).toFixed(4)}`}</span><span><Camera/>{item.body?.photo_data_url?translate(language,"photoStored"):translate(language,"noPhoto")}</span></div><small>{translate(language,"storedAt")} · {new Date(item.createdAt).toLocaleString()}</small></article>)}{!items.length&&<div className="offline-empty">{translate(language,"queueEmpty")}</div>}</div></section>;
}
