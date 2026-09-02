export type AppLanguage="en"|"hi"|"as";

export const languages:{id:AppLanguage;label:string;short:string}[]=[
  {id:"en",label:"English",short:"EN"},
  {id:"hi",label:"हिन्दी",short:"हि"},
  {id:"as",label:"অসমীয়া",short:"অ"},
];

const messages:Record<AppLanguage,Record<string,string>>={
  en:{
    sectorMap:"Sector Map",report:"Report",history:"History",offlineQueue:"Offline Queue",
    online:"Online · sync active",offline:"Offline · reports queue locally",pending:"pending",
    groundVerification:"GROUND VERIFICATION",sectorTitle:"Sector accessibility map",sectorDescription:"Review the affected corridor. GPS is optional and can be attached from the report form.",
    useLocation:"USE CURRENT LOCATION",refreshLocation:"REFRESH CURRENT LOCATION",openReport:"OPEN INCIDENT REPORT",
    reportTitle:"Report road condition",reportDescription:"Record what you observed. GPS and photo evidence are optional and help the Control Room verify the report.",
    roadSegment:"Road segment",inspectionType:"Inspection type",roadStatus:"Road status",severity:"Severity",direction:"Affected direction",vehicleAccess:"Vehicle access",clearance:"Estimated clearance",description:"Description",
    addEvidence:"Add GPS or a road photo",submitReview:"SUBMIT REPORT FOR REVIEW",submitting:"SUBMITTING…",
    synced:"Report synchronized",savedOffline:"Saved securely offline",syncPending:"It will sync automatically when connectivity returns.",newVerification:"NEW VERIFICATION",
    queueTitle:"OFFLINE REPORT QUEUE",queueDescription:"Reports and photo evidence stored securely on this device until connectivity returns.",syncNow:"SYNC NOW",syncing:"SYNCING…",queueEmpty:"No reports waiting to sync.",photoStored:"Photo stored",noPhoto:"No photo",waitingNetwork:"WAITING FOR NETWORK",readySync:"READY TO SYNC",storedAt:"Stored",
    driverTitle:"NER-LOGIX DRIVER",reportUnsafe:"REPORT UNSAFE",sendReport:"SEND REPORT",returnRoute:"RETURN TO ROUTE",savedOfflineDriver:"Saved offline. Report will sync automatically.",defaultUnsafeMessage:"Standing water is making the road unsafe",
    driverSubtitle:"MED-001 · Critical Medicines",gpsNotStarted:"GPS not started",deviceGpsLive:"device GPS live",nextWaypoint:"NEXT SAFE WAYPOINT",continueTowards:"Continue towards",remainingApproved:"km remaining on approved corridor",liveGps:"LIVE GPS",destination:"DESTINATION",criticalDelivery:"CRITICAL DELIVERY",routeComplete:"route complete",lowerRisk:"LOWER RISK",approvedBy:"Approved by",viewRouteDetails:"VIEW FULL ROUTE DETAILS",controlRoom:"CONTROL ROOM",callControlRoom:"CALL CONTROL ROOM",callingControlRoom:"Calling Assam Control Room…",mission:"MISSION",eta:"ETA",distance:"DISTANCE",speed:"SPEED",routeRisk:"ROUTE RISK",authorityDecision:"AUTHORITY DECISION",startGps:"START DEVICE GPS",routeAccepted:"ROUTE ACCEPTED",acceptRoute:"ACCEPT APPROVED ROUTE",newRouteApproved:"NEW ROUTE APPROVED",roadRiskAhead:"ROAD RISK AHEAD",liveMonitoring:"LIVE MONITORING",noRiskSignal:"No high-risk signal on the monitored corridor.",waitDecision:"Wait for authority decision on",continueMonitoring:"Continue with live monitoring",nextSafeAction:"NEXT SAFE ACTION",latestRouteRisk:"Latest route risk",reportHelp:"Share the condition ahead. Your live location will be attached.",incidentFlood:"Flood / Waterlogging",incidentLandslide:"Landslide",incidentBlockage:"Road blockage",incidentBridge:"Bridge damage",high:"High",critical:"Critical",medium:"Medium",reportSubmitted:"Report submitted",sosTitle:"Send emergency SOS?",sosDescription:"Your live location, vehicle ID and mission details will be sent to the Control Room.",confirmSos:"PRESS TO CONFIRM SOS",cancel:"CANCEL",connectedControlRoom:"Connected to Assam Control Room",realtimeConnected:"Realtime channel connected to Assam Control Room",
  },
  hi:{
    sectorMap:"क्षेत्र मानचित्र",report:"रिपोर्ट",history:"इतिहास",offlineQueue:"ऑफलाइन कतार",
    online:"ऑनलाइन · सिंक सक्रिय",offline:"ऑफलाइन · रिपोर्ट सुरक्षित हैं",pending:"लंबित",
    groundVerification:"मैदानी सत्यापन",sectorTitle:"क्षेत्र पहुँच मानचित्र",sectorDescription:"प्रभावित मार्ग देखें। रिपोर्ट में GPS और फोटो जोड़ना वैकल्पिक है।",
    useLocation:"वर्तमान स्थान लें",refreshLocation:"स्थान दोबारा लें",openReport:"घटना रिपोर्ट खोलें",
    reportTitle:"सड़क की स्थिति रिपोर्ट करें",reportDescription:"जो देखा वही दर्ज करें। GPS और फोटो कंट्रोल रूम को सत्यापन में मदद करते हैं।",
    roadSegment:"सड़क खंड",inspectionType:"घटना का प्रकार",roadStatus:"सड़क की स्थिति",severity:"गंभीरता",direction:"प्रभावित दिशा",vehicleAccess:"वाहन पहुँच",clearance:"खुलने का अनुमान",description:"विवरण",
    addEvidence:"GPS या सड़क का फोटो जोड़ें",submitReview:"समीक्षा के लिए रिपोर्ट भेजें",submitting:"भेजा जा रहा है…",
    synced:"रिपोर्ट सिंक हो गई",savedOffline:"रिपोर्ट ऑफलाइन सुरक्षित है",syncPending:"इंटरनेट आते ही यह अपने आप सिंक होगी।",newVerification:"नई जाँच",
    queueTitle:"ऑफलाइन रिपोर्ट कतार",queueDescription:"नेटवर्क आने तक रिपोर्ट और फोटो इस डिवाइस पर सुरक्षित रहते हैं।",syncNow:"अभी सिंक करें",syncing:"सिंक हो रहा है…",queueEmpty:"सिंक के लिए कोई रिपोर्ट लंबित नहीं है।",photoStored:"फोटो सुरक्षित",noPhoto:"फोटो नहीं",waitingNetwork:"नेटवर्क की प्रतीक्षा",readySync:"सिंक के लिए तैयार",storedAt:"सुरक्षित समय",
    driverTitle:"NER-LOGIX चालक",reportUnsafe:"असुरक्षित रिपोर्ट",sendReport:"रिपोर्ट भेजें",returnRoute:"मार्ग पर लौटें",savedOfflineDriver:"ऑफलाइन सुरक्षित। नेटवर्क आते ही रिपोर्ट सिंक होगी।",defaultUnsafeMessage:"सड़क पर जमा पानी आवागमन को असुरक्षित बना रहा है",
    driverSubtitle:"MED-001 · आवश्यक दवाइयाँ",gpsNotStarted:"GPS शुरू नहीं",deviceGpsLive:"डिवाइस GPS चालू",nextWaypoint:"अगला सुरक्षित पड़ाव",continueTowards:"आगे बढ़ें",remainingApproved:"किमी स्वीकृत मार्ग शेष",liveGps:"लाइव GPS",destination:"गंतव्य",criticalDelivery:"अत्यावश्यक आपूर्ति",routeComplete:"मार्ग पूरा",lowerRisk:"कम जोखिम",approvedBy:"स्वीकृति",viewRouteDetails:"पूरा मार्ग देखें",controlRoom:"नियंत्रण कक्ष",callControlRoom:"नियंत्रण कक्ष को कॉल करें",callingControlRoom:"असम नियंत्रण कक्ष को कॉल किया जा रहा है…",mission:"मिशन",eta:"अनुमानित समय",distance:"दूरी",speed:"गति",routeRisk:"मार्ग जोखिम",authorityDecision:"प्राधिकरण निर्णय",startGps:"डिवाइस GPS शुरू करें",routeAccepted:"मार्ग स्वीकार किया",acceptRoute:"स्वीकृत मार्ग अपनाएँ",newRouteApproved:"नया मार्ग स्वीकृत",roadRiskAhead:"आगे सड़क जोखिम",liveMonitoring:"लाइव निगरानी",noRiskSignal:"निगरानी वाले मार्ग पर कोई उच्च जोखिम संकेत नहीं है।",waitDecision:"प्राधिकरण के निर्णय की प्रतीक्षा करें:",continueMonitoring:"लाइव निगरानी के साथ आगे बढ़ें",nextSafeAction:"अगली सुरक्षित कार्रवाई",latestRouteRisk:"नवीनतम मार्ग जोखिम",reportHelp:"आगे की स्थिति बताएँ। आपका लाइव स्थान रिपोर्ट के साथ जुड़ेगा।",incidentFlood:"बाढ़ / जलभराव",incidentLandslide:"भूस्खलन",incidentBlockage:"सड़क अवरोध",incidentBridge:"पुल को नुकसान",high:"उच्च",critical:"गंभीर",medium:"मध्यम",reportSubmitted:"रिपोर्ट जमा हुई",sosTitle:"आपातकालीन SOS भेजें?",sosDescription:"आपका लाइव स्थान, वाहन ID और मिशन विवरण नियंत्रण कक्ष को भेजा जाएगा।",confirmSos:"SOS की पुष्टि करें",cancel:"रद्द करें",connectedControlRoom:"असम नियंत्रण कक्ष से जुड़ा",realtimeConnected:"असम नियंत्रण कक्ष से लाइव संपर्क सक्रिय",
  },
  as:{
    sectorMap:"এলেকা মানচিত্ৰ",report:"প্ৰতিবেদন",history:"ইতিহাস",offlineQueue:"অফলাইন শাৰী",
    online:"অনলাইন · ছিংক সক্ৰিয়",offline:"অফলাইন · প্ৰতিবেদন সুৰক্ষিত",pending:"বাকী",
    groundVerification:"ক্ষেত্ৰ পৰীক্ষণ",sectorTitle:"এলেকাৰ যাতায়াত মানচিত্ৰ",sectorDescription:"প্ৰভাৱিত পথ চাওক। GPS আৰু ফটো যোগ কৰাটো ঐচ্ছিক।",
    useLocation:"বৰ্তমান স্থান লওক",refreshLocation:"স্থান পুনৰ লওক",openReport:"ঘটনাৰ প্ৰতিবেদন খোলক",
    reportTitle:"পথৰ অৱস্থা জনাওক",reportDescription:"আপুনি দেখা তথ্য লিখক। GPS আৰু ফটোৱে নিয়ন্ত্ৰণ কক্ষক পৰীক্ষাত সহায় কৰে।",
    roadSegment:"পথ খণ্ড",inspectionType:"ঘটনাৰ ধৰণ",roadStatus:"পথৰ অৱস্থা",severity:"গুৰুত্ব",direction:"প্ৰভাৱিত দিশ",vehicleAccess:"যান-বাহনৰ প্ৰৱেশ",clearance:"মুকলি হোৱাৰ অনুমান",description:"বিৱৰণ",
    addEvidence:"GPS বা পথৰ ফটো যোগ কৰক",submitReview:"পৰীক্ষাৰ বাবে প্ৰতিবেদন পঠাওক",submitting:"পঠোৱা হৈছে…",
    synced:"প্ৰতিবেদন ছিংক হ’ল",savedOffline:"প্ৰতিবেদন অফলাইন সুৰক্ষিত",syncPending:"ইণ্টাৰনেট আহিলে স্বয়ংক্ৰিয়ভাৱে ছিংক হ’ব।",newVerification:"নতুন পৰীক্ষণ",
    queueTitle:"অফলাইন প্ৰতিবেদন শাৰী",queueDescription:"নেটৱৰ্ক অহালৈ প্ৰতিবেদন আৰু ফটো এই ডিভাইচত সুৰক্ষিত থাকে।",syncNow:"এতিয়া ছিংক কৰক",syncing:"ছিংক হৈছে…",queueEmpty:"ছিংকৰ বাবে কোনো প্ৰতিবেদন নাই।",photoStored:"ফটো সুৰক্ষিত",noPhoto:"ফটো নাই",waitingNetwork:"নেটৱৰ্কৰ অপেক্ষা",readySync:"ছিংকৰ বাবে সাজু",storedAt:"সুৰক্ষিত সময়",
    driverTitle:"NER-LOGIX চালক",reportUnsafe:"অসুৰক্ষিত পথ জনাওক",sendReport:"প্ৰতিবেদন পঠাওক",returnRoute:"পথলৈ উভতি যাওক",savedOfflineDriver:"অফলাইন সুৰক্ষিত। নেটৱৰ্ক আহিলে ছিংক হ’ব।",defaultUnsafeMessage:"পথত জমা পানীয়ে যাতায়াত অসুৰক্ষিত কৰিছে",
    driverSubtitle:"MED-001 · জৰুৰী ঔষধ",gpsNotStarted:"GPS আৰম্ভ হোৱা নাই",deviceGpsLive:"ডিভাইচ GPS সক্ৰিয়",nextWaypoint:"পৰৱৰ্তী সুৰক্ষিত স্থান",continueTowards:"আগবাঢ়ক",remainingApproved:"কিমি অনুমোদিত পথ বাকী",liveGps:"লাইভ GPS",destination:"গন্তব্য",criticalDelivery:"জৰুৰী যোগান",routeComplete:"পথ সম্পূৰ্ণ",lowerRisk:"কম বিপদ",approvedBy:"অনুমোদন",viewRouteDetails:"সম্পূৰ্ণ পথ চাওক",controlRoom:"নিয়ন্ত্ৰণ কক্ষ",callControlRoom:"নিয়ন্ত্ৰণ কক্ষলৈ ফোন কৰক",callingControlRoom:"অসম নিয়ন্ত্ৰণ কক্ষলৈ ফোন কৰা হৈছে…",mission:"অভিযান",eta:"আনুমানিক সময়",distance:"দূৰত্ব",speed:"গতি",routeRisk:"পথৰ বিপদ",authorityDecision:"কৰ্তৃপক্ষৰ সিদ্ধান্ত",startGps:"ডিভাইচ GPS আৰম্ভ কৰক",routeAccepted:"পথ গ্ৰহণ কৰা হ’ল",acceptRoute:"অনুমোদিত পথ গ্ৰহণ কৰক",newRouteApproved:"নতুন পথ অনুমোদিত",roadRiskAhead:"আগলৈ পথৰ বিপদ",liveMonitoring:"লাইভ নিৰীক্ষণ",noRiskSignal:"নিৰীক্ষণ কৰা পথত উচ্চ বিপদৰ সংকেত নাই।",waitDecision:"কৰ্তৃপক্ষৰ সিদ্ধান্তৰ অপেক্ষা কৰক:",continueMonitoring:"লাইভ নিৰীক্ষণৰ সৈতে আগবাঢ়ক",nextSafeAction:"পৰৱৰ্তী সুৰক্ষিত পদক্ষেপ",latestRouteRisk:"শেহতীয়া পথৰ বিপদ",reportHelp:"আগৰ অৱস্থা জনাওক। আপোনাৰ লাইভ স্থান প্ৰতিবেদনৰ সৈতে যোগ হ’ব।",incidentFlood:"বানপানী / পানী জমা",incidentLandslide:"ভূমিস্খলন",incidentBlockage:"পথ অৱৰোধ",incidentBridge:"দলঙৰ ক্ষতি",high:"উচ্চ",critical:"গুৰুতৰ",medium:"মধ্যম",reportSubmitted:"প্ৰতিবেদন জমা হ’ল",sosTitle:"জৰুৰী SOS পঠাবনে?",sosDescription:"আপোনাৰ লাইভ স্থান, যান ID আৰু অভিযানৰ তথ্য নিয়ন্ত্ৰণ কক্ষলৈ পঠোৱা হ’ব।",confirmSos:"SOS নিশ্চিত কৰক",cancel:"বাতিল",connectedControlRoom:"অসম নিয়ন্ত্ৰণ কক্ষৰ সৈতে সংযোগ",realtimeConnected:"অসম নিয়ন্ত্ৰণ কক্ষৰ লাইভ সংযোগ সক্ৰিয়",
  },
};

export function translate(language:AppLanguage,key:string){return messages[language][key]||messages.en[key]||key}

const valueTranslations:Record<AppLanguage,Record<string,string>>={
  en:{},
  hi:{"Realtime channel connected to Assam Control Room":"असम नियंत्रण कक्ष से लाइव संपर्क सक्रिय","Connected to Assam Control Room":"असम नियंत्रण कक्ष से जुड़ा","District Relief Hub":"जिला राहत केंद्र","Emergency antibiotics and insulin":"आपातकालीन एंटीबायोटिक्स और इंसुलिन","Assam Control Room":"असम नियंत्रण कक्ष","Critical Medicines":"आवश्यक दवाइयाँ","Guwahati Medical College":"गुवाहाटी मेडिकल कॉलेज","Jorabat":"जोरबाट","Sonapur":"सोनापुर","Chandrapur":"चंद्रपुर","Khetri":"खेतरी","CRITICAL":"गंभीर","APPROVED":"स्वीकृत","DRIVER ACCEPTED":"चालक ने स्वीकार किया","DEMO GPS REPLAY":"डेमो GPS पुनरावृत्ति","PENDING APPROVAL":"स्वीकृति लंबित","MONITORING":"निगरानी","NO SAFE ROUTE":"कोई सुरक्षित मार्ग नहीं"},
  as:{"Realtime channel connected to Assam Control Room":"অসম নিয়ন্ত্ৰণ কক্ষৰ লাইভ সংযোগ সক্ৰিয়","Connected to Assam Control Room":"অসম নিয়ন্ত্ৰণ কক্ষৰ সৈতে সংযোগ","District Relief Hub":"জিলা সাহায্য কেন্দ্ৰ","Emergency antibiotics and insulin":"জৰুৰী এণ্টিবায়টিক আৰু ইনচুলিন","Assam Control Room":"অসম নিয়ন্ত্ৰণ কক্ষ","Critical Medicines":"জৰুৰী ঔষধ","Guwahati Medical College":"গুৱাহাটী মেডিকেল কলেজ","Jorabat":"যোৰাবাট","Sonapur":"সোণাপুৰ","Chandrapur":"চন্দ্ৰপুৰ","Khetri":"ক্ষেত্ৰী","CRITICAL":"গুৰুতৰ","APPROVED":"অনুমোদিত","DRIVER ACCEPTED":"চালকে গ্ৰহণ কৰিছে","DEMO GPS REPLAY":"ডেমো GPS পুনৰাবৃত্তি","PENDING APPROVAL":"অনুমোদনৰ অপেক্ষা","MONITORING":"নিৰীক্ষণ","NO SAFE ROUTE":"সুৰক্ষিত পথ নাই"},
};
export function translateValue(language:AppLanguage,value:string|undefined|null){
  if(!value)return "";
  return Object.entries(valueTranslations[language])
    .sort(([left],[right])=>right.length-left.length)
    .reduce((translated,[source,target])=>translated.replaceAll(source,target),value);
}
