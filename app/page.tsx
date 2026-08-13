"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { openMeteoHrrrProvider } from "../lib/providers/open-meteo";
import type { SoundingLevel, SoundingProfile } from "../lib/sounding";
import { bunkersRightMover, surfaceParcelProfile } from "../lib/meteorology";
import { MapPicker } from "./MapPicker";
import { placeLabel, searchPlaces, type Place } from "../lib/locations";
import { cacheProfile, cachedProfile, clearSkewedStorage } from "../lib/profile-cache";
import { getObservedProfile } from "../lib/providers/observed";
import { windBarbParts } from "../lib/wind-barb";

const models = ["HRRR", "OBS"];
const times = ["NOW", "+1H", "+2H", "+3H", "+4H", "+5H", "+6H"];
function storedPlaces(key:string):Place[]{if(typeof localStorage==="undefined")return[];try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value:[]}catch{return[]}}

function SoundingChart({ hour, parcel, levels, comparison }: { hour: number; parcel: boolean; levels?: SoundingLevel[]; comparison?: SoundingLevel[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [inspection,setInspection]=useState<{trace:string;color:string,valueC?:number,windSpeedKt?:number,windDirectionDeg?:number,level:SoundingLevel,x:number,y:number}|null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      const c = canvas.getContext("2d"); if (!c) return;
      c.scale(dpr, dpr); const w = rect.width, h = rect.height;
      const left = 46, right = w - 22, top = 24, bottom = h - 38;
      c.clearRect(0, 0, w, h);
      c.font = "10px ui-monospace, monospace"; c.textAlign = "right";
      [100,200,300,400,500,600,700,800,900,1000].forEach((p, i) => {
        const y = top + (bottom-top) * Math.log(p/100) / Math.log(10);
        c.strokeStyle = i % 2 ? "rgba(131,166,180,.10)" : "rgba(131,166,180,.18)";
        c.lineWidth = 1; c.beginPath(); c.moveTo(left,y); c.lineTo(right,y); c.stroke();
        c.fillStyle="#66808b"; c.fillText(String(p), left-9, y+3);
      });
      c.textAlign="center";
      for(let t=-40;t<=40;t+=10){
        const x=left+(t+45)/95*(right-left);
        c.strokeStyle="rgba(131,166,180,.12)"; c.beginPath(); c.moveTo(x,top); c.lineTo(x+110,bottom); c.stroke();
        c.fillStyle="#66808b"; c.fillText(`${t}°`,x+102,bottom+18);
      }
      const line=(pts:number[][], color:string, width=3, dash:number[]=[])=>{
        c.beginPath(); c.setLineDash(dash); pts.forEach(([x,y],i)=>{ const px=left+x*(right-left), py=top+y*(bottom-top); if(i)c.lineTo(px,py);else c.moveTo(px,py)});
        c.strokeStyle=color; c.lineWidth=width; c.lineJoin="round"; c.lineCap="round"; c.shadowColor=color; c.shadowBlur=width>2?9:0; c.stroke(); c.shadowBlur=0; c.setLineDash([]);
      };
      const profilePoint=(temperatureC:number,pressureHpa:number)=>{
        const y=Math.log(pressureHpa/100)/Math.log(10);
        const x=(temperatureC+60)/110-(1-y)*.12;
        return [Math.max(-.05,Math.min(1.05,x)),y];
      };
      const liveLevels=levels?.filter(level=>level.pressureHpa>=100&&level.pressureHpa<=1000);
      const temp=liveLevels?.map(level=>profilePoint(level.temperatureC,level.pressureHpa))??[[.76,1],[.69,.91],[.66,.82],[.61,.72],[.62,.64],[.55,.55],[.50,.45],[.43,.34],[.40,.24],[.34,.13],[.29,0]];
      const dew=liveLevels?.map(level=>profilePoint(level.dewpointC,level.pressureHpa))??[[.58,1],[.56,.91],[.52,.82],[.49,.72],[.43,.64],[.41,.55],[.36,.45],[.30,.34],[.29,.24],[.23,.13],[.20,0]];
      line(temp.map(([x,y])=>[x+(hour*.004*Math.sin(y*18)),y]),"#ff6b6f",3.2);
      line(dew,"#50e3a4",3.2);
      if(comparison?.length){line(comparison.map(level=>profilePoint(level.temperatureC,level.pressureHpa)),"rgba(255,107,111,.58)",1.6,[5,5]);line(comparison.map(level=>profilePoint(level.dewpointC,level.pressureHpa)),"rgba(80,227,164,.55)",1.6,[5,5])}
      if(parcel) {
        const parcelPoints=liveLevels?.length?surfaceParcelProfile(liveLevels).points.map(point=>profilePoint(point.temperatureC,point.pressureHpa)):[[.77,1],[.73,.87],[.69,.72],[.62,.58],[.54,.43],[.46,.29],[.39,.15],[.34,0]];
        line(parcelPoints,"#ffd45e",2,[7,6]);
      }
      c.shadowBlur=0;
      const winds=liveLevels?.filter((_,i)=>i%3===0)??Array.from({length:14},(_,i)=>({windDirectionDeg:240,windSpeedKt:15+i*3,pressureHpa:1000-i*65}));
      winds.forEach((wind)=>{
        const y=top+Math.log(wind.pressureHpa/100)/Math.log(10)*(bottom-top), x=right-10;
        const parts=windBarbParts(wind.windSpeedKt);c.strokeStyle="#75c8ff";c.fillStyle="#75c8ff";c.lineWidth=1.4;
        if(parts.calm){c.beginPath();c.arc(x,y,3.5,0,Math.PI*2);c.stroke();return}
        const direction=wind.windDirectionDeg*Math.PI/180,length=26;
        const shaftX=Math.sin(direction),shaftY=-Math.cos(direction),tailX=x+shaftX*length,tailY=y+shaftY*length;
        const featherX=-shaftY,featherY=shaftX;c.beginPath();c.moveTo(x,y);c.lineTo(tailX,tailY);c.stroke();let offset=0;
        for(let flag=0;flag<parts.pennants;flag++){const ax=tailX-shaftX*offset,ay=tailY-shaftY*offset,bx=tailX-shaftX*(offset+6),by=tailY-shaftY*(offset+6);c.beginPath();c.moveTo(ax,ay);c.lineTo(ax+featherX*9,ay+featherY*9);c.lineTo(bx,by);c.closePath();c.fill();offset+=7}
        c.beginPath();for(let barb=0;barb<parts.fullBarbs;barb++){const bx=tailX-shaftX*offset,by=tailY-shaftY*offset;c.moveTo(bx,by);c.lineTo(bx+featherX*9,by+featherY*9);offset+=4.5}if(parts.halfBarbs){const bx=tailX-shaftX*offset,by=tailY-shaftY*offset;c.moveTo(bx,by);c.lineTo(bx+featherX*5,by+featherY*5)}c.stroke();
      });
    };
    draw(); const obs=new ResizeObserver(draw); obs.observe(canvas); return()=>obs.disconnect();
  },[hour,parcel,levels,comparison]);
  const inspect=(event:ReactPointerEvent<HTMLCanvasElement>)=>{
    if(!levels?.length)return;
    const rect=event.currentTarget.getBoundingClientRect(),left=46,right=rect.width-22,top=24,bottom=rect.height-38;
    const pointerX=event.clientX-rect.left,pointerY=event.clientY-rect.top;
    const profilePoint=(temperatureC:number,pressureHpa:number)=>{const y=Math.log(pressureHpa/100)/Math.log(10);const x=(temperatureC+60)/110-(1-y)*.12;return{x:left+Math.max(-.05,Math.min(1.05,x))*(right-left),y:top+y*(bottom-top)}};
    const liveLevels=levels.filter(level=>level.pressureHpa>=100&&level.pressureHpa<=1000);
    const candidates:{trace:string;color:string,valueC?:number,windSpeedKt?:number,windDirectionDeg?:number,level:SoundingLevel,x:number,y:number,distance?:number}[]=[];
    liveLevels.forEach(level=>{
      const temperature=profilePoint(level.temperatureC,level.pressureHpa),dewpoint=profilePoint(level.dewpointC,level.pressureHpa);
      temperature.x+=(hour*.004*Math.sin(Math.log(level.pressureHpa/100)/Math.log(10)*18))*(right-left);
      candidates.push({trace:"Temperature",color:"#ff6b6f",valueC:level.temperatureC,level,x:temperature.x,y:temperature.y},{trace:"Dew point",color:"#50e3a4",valueC:level.dewpointC,level,x:dewpoint.x,y:dewpoint.y});
    });
    if(parcel){const byPressure=new Map(levels.map(level=>[level.pressureHpa,level]));surfaceParcelProfile(levels).points.forEach(point=>{const level=byPressure.get(point.pressureHpa);if(level){const position=profilePoint(point.temperatureC,point.pressureHpa);candidates.push({trace:"Parcel",color:"#ffd45e",valueC:point.temperatureC,level,x:position.x,y:position.y})}})}
    liveLevels.filter((_,index)=>index%3===0).forEach(level=>{const x=right-10,y=top+Math.log(level.pressureHpa/100)/Math.log(10)*(bottom-top),direction=level.windDirectionDeg*Math.PI/180,tailX=x+Math.sin(direction)*26,tailY=y-Math.cos(direction)*26,dx=tailX-x,dy=tailY-y,lengthSquared=dx*dx+dy*dy,t=windBarbParts(level.windSpeedKt).calm?0:Math.max(0,Math.min(1,((pointerX-x)*dx+(pointerY-y)*dy)/lengthSquared)),hitX=x+t*dx,hitY=y+t*dy;candidates.push({trace:"Wind",color:"#75c8ff",windSpeedKt:level.windSpeedKt,windDirectionDeg:level.windDirectionDeg,level,x:hitX,y:hitY,distance:Math.hypot(hitX-pointerX,hitY-pointerY)})});
    const nearest=candidates.reduce<{item:typeof candidates[number],distance:number}|null>((best,item)=>{const distance=item.distance??Math.hypot(item.x-pointerX,item.y-pointerY);return !best||distance<best.distance?{item,distance}:best},null);
    setInspection(nearest&&nearest.distance<=30?nearest.item:null);
  };
  return <div className="sounding-interactive" onPointerLeave={()=>setInspection(null)}><canvas ref={ref} aria-label="Interactive Skew-T log-P sounding chart. Touch or point at a trace or wind barb to inspect its value." aria-describedby="profile-summary" onPointerDown={inspect} onPointerMove={inspect}/>{inspection&&<><i className="sounding-marker" style={{left:inspection.x,top:inspection.y,borderColor:inspection.color,boxShadow:`0 0 12px ${inspection.color}`}}/><div className={`sounding-readout${inspection.windSpeedKt!==undefined?" wind-readout":""}`} style={{left:inspection.x,top:inspection.y,borderColor:inspection.color}} role="status"><b style={{color:inspection.color}}>{inspection.trace}</b><strong>{inspection.windSpeedKt!==undefined?`${inspection.windSpeedKt.toFixed(0)} kt`: `${inspection.valueC?.toFixed(1)}°C`}</strong><span>{inspection.windDirectionDeg!==undefined&&`${Math.round(inspection.windDirectionDeg)}° · `}{Math.round(inspection.level.pressureHpa)} hPa · {Math.round(inspection.level.heightM)} m</span></div></>}</div>;
}

function Hodograph({levels}:{levels?:SoundingLevel[]}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const canvas=ref.current;if(!canvas||!levels?.length)return;const rect=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;const c=canvas.getContext("2d");if(!c)return;c.scale(dpr,dpr);const w=rect.width,h=rect.height,cx=w/2,cy=h/2,scale=Math.min(w,h)/150;c.clearRect(0,0,w,h);c.font="8px ui-monospace";c.textAlign="center";[15,30,45,60].forEach(speed=>{c.beginPath();c.arc(cx,cy,speed*scale,0,Math.PI*2);c.strokeStyle="rgba(110,145,155,.18)";c.stroke();c.fillStyle="#59727b";c.fillText(String(speed),cx+speed*scale,cy-3)});c.beginPath();c.moveTo(0,cy);c.lineTo(w,cy);c.moveTo(cx,0);c.lineTo(cx,h);c.strokeStyle="rgba(110,145,155,.12)";c.stroke();const surface=Math.min(...levels.map(l=>l.heightM));const points=levels.filter(l=>l.heightM-surface<=6000).map(level=>{const r=level.windDirectionDeg*Math.PI/180;return{x:cx-level.windSpeedKt*Math.sin(r)*scale,y:cy+level.windSpeedKt*Math.cos(r)*scale,height:level.heightM-surface}});c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle="#61dfae";c.lineWidth=3;c.lineJoin="round";c.shadowColor="#61dfae";c.shadowBlur=7;c.stroke();c.shadowBlur=0;const storm=bunkersRightMover(levels);const sx=cx+storm.uKt*scale,sy=cy-storm.vKt*scale;c.fillStyle="#74d9ee";c.beginPath();c.arc(sx,sy,4,0,Math.PI*2);c.fill();c.fillStyle="#74d9ee";c.fillText("RM",sx,sy-7)},[levels]);
  return <canvas ref={ref} aria-label="0 to 6 kilometer hodograph"/>;
}

export default function Home() {
  const [model,setModel]=useState("HRRR"); const [time,setTime]=useState(2);
  const [parcel,setParcel]=useState(true); const [location,setLocation]=useState("Wichita, KS");
  const [layers,setLayers]=useState(true);
  const [place,setPlace]=useState<Place>({name:"Wichita",admin:"Kansas",latitude:37.687,longitude:-97.330});
  const [mapOpen,setMapOpen]=useState(false); const [suggestions,setSuggestions]=useState<Place[]>([]); const [searchOpen,setSearchOpen]=useState(false);
  const locationPickerRef=useRef<HTMLDivElement>(null);
  const [placesOpen,setPlacesOpen]=useState(false);
  const [recents,setRecents]=useState<Place[]>([]);
  const [favorites,setFavorites]=useState<Place[]>([]);
  const [profile,setProfile]=useState<SoundingProfile>(); const [dataState,setDataState]=useState<"loading"|"live"|"cached"|"error">("loading");
  const [refreshKey,setRefreshKey]=useState(0);
  const [compare,setCompare]=useState(false); const [comparison,setComparison]=useState<SoundingProfile>();
  const [online,setOnline]=useState(true);
  const [fieldMode,setFieldMode]=useState(false); const [preferencesLoaded,setPreferencesLoaded]=useState(false);
  const favorite=favorites.some(item=>Math.abs(item.latitude-place.latitude)<.001&&Math.abs(item.longitude-place.longitude)<.001);
  useEffect(()=>{const dismiss=(event:PointerEvent)=>{if(!locationPickerRef.current?.contains(event.target as Node))setSearchOpen(false)};document.addEventListener("pointerdown",dismiss);return()=>document.removeEventListener("pointerdown",dismiss)},[]);
  useEffect(()=>{const id=setTimeout(()=>{setRecents(storedPlaces("skewed:recents"));setFavorites(storedPlaces("skewed:favorites"));setFieldMode(localStorage.getItem("skewed:field-mode")==="true");setPreferencesLoaded(true)},0);return()=>clearTimeout(id)},[]);
  const searchSequence=useRef(0);
  useEffect(()=>{const sequence=++searchSequence.current;const id=setTimeout(()=>searchPlaces(location).then(results=>{if(sequence===searchSequence.current)setSuggestions(results)}).catch(()=>{if(sequence===searchSequence.current)setSuggestions([])}),350);return()=>clearTimeout(id)},[location]);
  const choosePlace=useCallback((next:Place)=>{setDataState("loading");setPlace(next);setLocation(placeLabel(next));setSuggestions([]);setSearchOpen(false);setRecents(previous=>{const updated=[next,...previous.filter(item=>Math.abs(item.latitude-next.latitude)>.001||Math.abs(item.longitude-next.longitude)>.001)].slice(0,5);localStorage.setItem("skewed:recents",JSON.stringify(updated));return updated})},[]);
  const toggleFavorite=()=>{setFavorites(previous=>{const exists=previous.some(item=>Math.abs(item.latitude-place.latitude)<.001&&Math.abs(item.longitude-place.longitude)<.001);const updated=exists?previous.filter(item=>Math.abs(item.latitude-place.latitude)>.001||Math.abs(item.longitude-place.longitude)>.001):[place,...previous];localStorage.setItem("skewed:favorites",JSON.stringify(updated));return updated})};
  useEffect(()=>{const connected=()=>setOnline(true),disconnected=()=>setOnline(false);window.addEventListener("online",connected);window.addEventListener("offline",disconnected);return()=>{window.removeEventListener("online",connected);window.removeEventListener("offline",disconnected)}},[]);
  const focusReturn=useRef<HTMLElement|null>(null);
  useEffect(()=>{if(!mapOpen&&!placesOpen)return;focusReturn.current=document.activeElement as HTMLElement;const dialog=document.querySelector<HTMLElement>("[role=dialog]");setTimeout(()=>dialog?.focus(),0);const keydown=(event:KeyboardEvent)=>{if(event.key==="Escape"){setMapOpen(false);setPlacesOpen(false)}if(event.key==="Tab"&&dialog){const items=[...dialog.querySelectorAll<HTMLElement>('button,input,[tabindex]:not([tabindex="-1"])')].filter(item=>!item.hasAttribute("disabled"));if(!items.length)return;const first=items[0],last=items.at(-1)!;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}};document.addEventListener("keydown",keydown);return()=>{document.removeEventListener("keydown",keydown);focusReturn.current?.focus()}},[mapOpen,placesOpen]);
  useEffect(()=>{if(!preferencesLoaded)return;localStorage.setItem("skewed:field-mode",String(fieldMode));if(!fieldMode)return;let lock:{release:()=>Promise<void>}|undefined;const wakeLock=(navigator as Navigator&{wakeLock?:{request:(type:"screen")=>Promise<{release:()=>Promise<void>}>}}).wakeLock;wakeLock?.request("screen").then(value=>{lock=value}).catch(()=>{});return()=>{lock?.release().catch(()=>{})}},[fieldMode,preferencesLoaded]);
  useEffect(()=>{
    let current=true;const controller=new AbortController();
    const valid=new Date(); valid.setUTCMinutes(0,0,0); valid.setUTCHours(valid.getUTCHours()+time);
    const request=model==="OBS"?getObservedProfile(place.latitude,place.longitude,controller.signal):openMeteoHrrrProvider.getProfile({latitude:place.latitude,longitude:place.longitude,validTimeIso:valid.toISOString(),model,signal:controller.signal});
    request
      .then(next=>{if(current){next.location.name=placeLabel(place);cacheProfile(next,place.latitude,place.longitude);setProfile(next);setDataState("live")}})
      .catch(()=>{if(current){const fallback=cachedProfile(place.latitude,place.longitude,model);if(fallback){setProfile(fallback);setDataState("cached")}else setDataState("error")}});
    return()=>{current=false;controller.abort()};
  },[time,model,place,refreshKey]);
  useEffect(()=>{if(!compare||model==="OBS"){return}let current=true;const controller=new AbortController();const valid=new Date();valid.setUTCMinutes(0,0,0);valid.setUTCHours(valid.getUTCHours()+time+3);openMeteoHrrrProvider.getProfile({latitude:place.latitude,longitude:place.longitude,validTimeIso:valid.toISOString(),model,signal:controller.signal}).then(next=>{if(current)setComparison(next)}).catch(()=>{if(current)setComparison(undefined)});return()=>{current=false;controller.abort()}},[compare,time,model,place,refreshKey]);
  const display=(value:number|undefined,digits=0)=>Number.isFinite(value)?Number(value).toFixed(digits):"—";
  const riskScore=profile?.indices.fixedStp??0;
  const riskLabel=riskScore>=3?"Significant":riskScore>=1?"Elevated":riskScore>=.25?"Conditional":"Limited";
  const validLabel=profile?new Date(profile.validTimeIso).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"}):"Loading…";
  return <main className={fieldMode?"field-mode":""}>
    <header>
      <div className="brand"><span className="brandmark">S</span><div><b>SKEWED</b><small>ATMOSPHERIC INTELLIGENCE</small></div></div>
      <div className="header-actions"><button className="field-toggle" onClick={()=>setFieldMode(value=>!value)}>⌁ {fieldMode?"FIELD ON":"FIELD MODE"}</button><button className="live"><i className={!online?"offline":dataState}/>{dataState==="live"&&online?` LIVE ${model}`:dataState==="cached"||!online?` CACHED ${model}`:dataState==="loading"?` LOADING ${model}`:" DATA ERROR"}</button><button className="icon" aria-label="Settings">⌘</button><button className="avatar">TT</button></div>
    </header>

    <section className="toolbar glass">
      <div className="location" ref={locationPickerRef}><span>⌖</span><input aria-label="Location search" role="combobox" aria-expanded={searchOpen&&suggestions.length>0} aria-controls="location-suggestions" value={location} onChange={e=>{setLocation(e.target.value);setSearchOpen(true)}} onFocus={()=>{setSuggestions(recents);setSearchOpen(true)}} onKeyDown={event=>{if(event.key==="Escape"){setSearchOpen(false);event.currentTarget.blur()}}}/><small>{Math.abs(place.latitude).toFixed(3)}° {place.latitude>=0?"N":"S"} · {Math.abs(place.longitude).toFixed(3)}° {place.longitude>=0?"E":"W"}</small>{searchOpen&&suggestions.length>0&&<div className="suggestions" id="location-suggestions" role="listbox">{suggestions.map((item,index)=><button role="option" aria-selected="false" key={`${item.latitude}-${item.longitude}-${index}`} onClick={()=>choosePlace(item)}><b>{item.name}</b><span>{[item.admin,item.country].filter(Boolean).join(" · ")}</span></button>)}</div>}</div>
      <div className="divider"/>
      <div className="model"><span className="model-label">MODEL</span><div className="segmented">{models.map(m=><button className={model===m?"active":""} onClick={()=>{setDataState("loading");setModel(m);if(m==="OBS"){setTime(0);setCompare(false);setComparison(undefined)}}} key={m}>{m}</button>)}</div></div>
      <button className="map-button" onClick={()=>setMapOpen(true)}>◉ <span>MAP</span></button><button className="refresh" onClick={()=>{setDataState("loading");setTime(0);setRefreshKey(key=>key+1)}}>↻ <span>UPDATE</span></button>
    </section>

    <section className="workspace">
      <aside className={`summary glass ${layers?"":"collapsed"}`}>
        <div className="eyebrow"><span>{profile?.source==="observed"?"OBSERVED SOUNDING":"FORECAST SOUNDING"}</span><button onClick={toggleFavorite} aria-label="Favorite">{favorite?"★":"☆"}</button></div>
        <h1>{location || "Wichita, KS"}</h1><p>Valid {validLabel}</p>
        {profile?.observation&&<div className="obs-source"><b>{profile.observation.stationId} · {profile.observation.stationName}</b><span>{Math.round(profile.observation.distanceKm)} km from selected point · launched {validLabel}</span></div>}
        <div className="risk"><div><span className="pulse"/><b>COMPOSITE ENVIRONMENT</b></div><strong>{riskLabel}</strong><p>Objective category from the current parcel, shear, SRH, and LCL profile.</p></div>
        <div className="metrics">
          <article><span className="metric-label">SBCAPE</span><strong>{display(profile?.indices.sbcapeJkg)}</strong><small>J/kg</small><em>{profile?.source==="observed"?"SURFACE PARCEL · DERIVED":"LIVE MODEL"}</em></article>
          <article><span className="metric-label">0–6 KM SHEAR</span><strong>{display(profile?.indices.shear06Kt)}</strong><small>kt</small><em>DERIVED</em></article>
          <article><span className="metric-label">LCL HEIGHT</span><strong>{display(profile?.indices.lclM)}</strong><small>m AGL</small><em className="neutral">DERIVED</em></article>
          <article><span className="metric-label">STP (FIXED)</span><strong>{display(profile?.indices.fixedStp,1)}</strong><small>index</small><em>DERIVED</em></article>
        </div>
        <div className="analysis"><span>DATA PROVENANCE</span><p>{profile?`${profile.provider}. ${profile.levels.length} thermodynamic levels loaded${profile.source==="observed"?"; missing winds interpolated by height":""}. SBCAPE, shear, and LCL are derived in Skewed.`:"Connecting to the latest available HRRR profile…"}</p></div>
      </aside>

      <section className="plot glass">
        <div className="plot-head"><div><span>SKEW-T · LOG-P</span><b>{model} {model==="OBS"?"LATEST RELEASE":"LATEST RUN"} <i>•</i> {profile?.source==="forecast"?`F${String(profile.forecastHour).padStart(2,"0")}`:"RAOB"}</b></div><div className="plot-tools"><button disabled={model==="OBS"} onClick={()=>setCompare(value=>!value)} className={compare&&model!=="OBS"?"selected compare":""}>⇄ <span>COMPARE</span></button><button onClick={()=>setParcel(!parcel)} className={parcel?"selected":""}>◒ <span>PARCEL</span></button><button onClick={()=>setLayers(!layers)}>▤ <span>PANEL</span></button><button aria-label="Share sounding">↗</button></div></div>
        <div className="legend"><span className="red"/> Temperature <span className="green"/> Dew point {parcel&&<><span className="yellow"/> Parcel</>} {model!=="OBS"&&compare&&comparison&&<b className="compare-key">DASHED · +3H</b>}</div>
        <div className="chart"><SoundingChart hour={time} parcel={parcel} levels={profile?.levels} comparison={model!=="OBS"&&compare?comparison?.levels:undefined}/><div className="cape-label">CAPE<br/><b>{display(profile?.indices.sbcapeJkg)}</b></div>{model!=="OBS"&&compare&&comparison&&<div className="compare-card"><span>+3H COMPARISON</span><b>{new Date(comparison.validTimeIso).getUTCHours().toString().padStart(2,"0")}Z</b><div><small>CAPE</small><strong>{display(comparison.indices.sbcapeJkg)}</strong><em>{display(comparison.indices.sbcapeJkg-(profile?.indices.sbcapeJkg??0))}</em></div><div><small>SHEAR</small><strong>{display(comparison.indices.shear06Kt)} kt</strong><em>{display(comparison.indices.shear06Kt-(profile?.indices.shear06Kt??0))}</em></div><div><small>STP</small><strong>{display(comparison.indices.fixedStp,1)}</strong><em>{display(comparison.indices.fixedStp-(profile?.indices.fixedStp??0),1)}</em></div></div>}<div id="profile-summary" className="sr-only">{profile?`${profile.model} sounding with ${profile.levels.length} levels. Surface CAPE ${display(profile.indices.sbcapeJkg)} joules per kilogram, zero to six kilometer shear ${display(profile.indices.shear06Kt)} knots, LCL ${display(profile.indices.lclM)} meters above ground, storm relative helicity ${display(profile.indices.srh01M2s2)} square meters per square second.`:"Sounding profile loading."}</div></div>
      </section>

      <aside className="hodo glass">
        <div className="hodo-head"><span>HODOGRAPH</span><b>0–6 KM</b></div>
        <div className="hodo-plot"><Hodograph levels={profile?.levels}/></div>
        <div className="hodo-stats"><div><span>SRH 0–1 KM</span><b>{display(profile?.indices.srh01M2s2)} <small>m²/s²</small></b></div><div><span>SRH 0–3 KM</span><b>{display(profile?.indices.srh03M2s2)} <small>m²/s²</small></b></div><div><span>0–1 KM SHEAR</span><b>{display(profile?.indices.shear01Kt)} <small>kt</small></b></div></div>
      </aside>
    </section>

    <section className="timeline glass"><button className="play" disabled={model==="OBS"} onClick={()=>{setDataState("loading");setTime((time+1)%7)}}>▶</button><div className="time-track">{times.map((t,i)=><button key={t} disabled={model==="OBS"&&i>0} onClick={()=>{setDataState("loading");setTime(i)}} className={time===i?"active":""}><span>{profile?`${String((new Date(profile.validTimeIso).getUTCHours()-time+i+24)%24).padStart(2,"0")}Z`:"—"}</span><b>{model==="OBS"&&i>0?"—":t}</b></button>)}</div><div className="valid"><span>VALID</span><b>{validLabel.toUpperCase()}</b></div></section>
    <nav className="mobile-nav"><button className="active">⌁<span>Sounding</span></button><button onClick={()=>setMapOpen(true)}>◉<span>Map</span></button><button onClick={()=>setPlacesOpen(true)}>◇<span>Favorites</span></button><button onClick={()=>setFieldMode(value=>!value)}>⚙<span>Field mode</span></button></nav>
    {mapOpen&&<div className="map-modal" role="dialog" aria-modal="true" aria-label="Location map" tabIndex={-1}><div className="map-sheet glass"><div className="map-title"><div><small>SOUNDING LOCATION</small><b>{placeLabel(place)}</b></div><div><button onClick={()=>navigator.geolocation?.getCurrentPosition(position=>choosePlace({name:"Current location",latitude:position.coords.latitude,longitude:position.coords.longitude}))}>⌖ USE MY LOCATION</button><button aria-label="Close map" onClick={()=>setMapOpen(false)}>×</button></div></div><MapPicker place={place} onSelect={choosePlace}/><div className="map-footer"><span>Tap anywhere to sample the nearest {model==="OBS"?"radiosonde station":"HRRR grid point"}.</span><button onClick={()=>setMapOpen(false)}>USE THIS LOCATION</button></div></div></div>}
    {placesOpen&&<div className="map-modal" role="dialog" aria-modal="true" aria-label="Saved locations" tabIndex={-1}><div className="places-sheet glass"><div className="map-title"><div><small>PLACES</small><b>Saved & recent</b></div><button aria-label="Close saved locations" onClick={()=>setPlacesOpen(false)}>×</button></div><section><h2>Favorites</h2>{favorites.length?favorites.map(item=><button key={`${item.latitude}-${item.longitude}`} onClick={()=>{choosePlace(item);setPlacesOpen(false)}}><span>★</span><b>{placeLabel(item)}</b><small>{item.latitude.toFixed(2)} · {item.longitude.toFixed(2)}</small></button>):<p>Star a sounding to keep it here.</p>}</section><section><h2>Recent</h2>{recents.map(item=><button key={`${item.latitude}-${item.longitude}`} onClick={()=>{choosePlace(item);setPlacesOpen(false)}}><span>⌖</span><b>{placeLabel(item)}</b><small>{item.latitude.toFixed(2)} · {item.longitude.toFixed(2)}</small></button>)}</section><button className="clear-data" onClick={()=>{clearSkewedStorage();setRecents([]);setFavorites([])}}>CLEAR SAVED LOCATIONS & OFFLINE DATA</button></div></div>}
  </main>
}
