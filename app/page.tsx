"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openMeteoHrrrProvider } from "../lib/providers/open-meteo";
import type { SoundingLevel, SoundingProfile } from "../lib/sounding";
import { bunkersRightMover, surfaceParcelProfile } from "../lib/meteorology";
import { MapPicker } from "./MapPicker";
import { placeLabel, searchPlaces, type Place } from "../lib/locations";
import { cacheProfile, cachedProfile } from "../lib/profile-cache";
import { getObservedProfile } from "../lib/providers/observed";

const models = ["HRRR", "OBS"];
const times = ["NOW", "+1H", "+2H", "+3H", "+4H", "+5H", "+6H"];
function storedPlaces(key:string):Place[]{if(typeof localStorage==="undefined")return[];try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value:[]}catch{return[]}}

function SoundingChart({ hour, parcel, levels, comparison }: { hour: number; parcel: boolean; levels?: SoundingLevel[]; comparison?: SoundingLevel[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

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
        const angle=(wind.windDirectionDeg-90)*Math.PI/180, length=24;
        const tailX=x+Math.cos(angle)*length,tailY=y+Math.sin(angle)*length;
        c.strokeStyle="#75c8ff";c.lineWidth=1.4;c.beginPath();c.moveTo(x,y);c.lineTo(tailX,tailY);
        let remaining=Math.round(wind.windSpeedKt/5)*5,offset=0;
        while(remaining>=10){const bx=tailX-Math.cos(angle)*offset,by=tailY-Math.sin(angle)*offset;c.moveTo(bx,by);c.lineTo(bx+Math.cos(angle-Math.PI/3)*8,by+Math.sin(angle-Math.PI/3)*8);remaining-=10;offset+=4}
        if(remaining>=5){const bx=tailX-Math.cos(angle)*offset,by=tailY-Math.sin(angle)*offset;c.moveTo(bx,by);c.lineTo(bx+Math.cos(angle-Math.PI/3)*5,by+Math.sin(angle-Math.PI/3)*5)}c.stroke();
      });
    };
    draw(); const obs=new ResizeObserver(draw); obs.observe(canvas); return()=>obs.disconnect();
  },[hour,parcel,levels,comparison]);
  return <canvas ref={ref} aria-label="Skew-T log-P sounding chart" />;
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
  const [mapOpen,setMapOpen]=useState(false); const [suggestions,setSuggestions]=useState<Place[]>([]);
  const [placesOpen,setPlacesOpen]=useState(false);
  const [recents,setRecents]=useState<Place[]>(()=>storedPlaces("skewed:recents"));
  const [favorites,setFavorites]=useState<Place[]>(()=>storedPlaces("skewed:favorites"));
  const [profile,setProfile]=useState<SoundingProfile>(); const [dataState,setDataState]=useState<"loading"|"live"|"cached"|"error">("loading");
  const [refreshKey,setRefreshKey]=useState(0);
  const [compare,setCompare]=useState(false); const [comparison,setComparison]=useState<SoundingProfile>();
  const [online,setOnline]=useState(()=>typeof navigator==="undefined"?true:navigator.onLine);
  const [fieldMode,setFieldMode]=useState(()=>typeof window!=="undefined"&&localStorage.getItem("skewed:field-mode")==="true");
  const favorite=favorites.some(item=>Math.abs(item.latitude-place.latitude)<.001&&Math.abs(item.longitude-place.longitude)<.001);
  const searchSequence=useRef(0);
  useEffect(()=>{const sequence=++searchSequence.current;const id=setTimeout(()=>searchPlaces(location).then(results=>{if(sequence===searchSequence.current)setSuggestions(results)}).catch(()=>{if(sequence===searchSequence.current)setSuggestions([])}),350);return()=>clearTimeout(id)},[location]);
  const choosePlace=useCallback((next:Place)=>{setDataState("loading");setPlace(next);setLocation(placeLabel(next));setSuggestions([]);setRecents(previous=>{const updated=[next,...previous.filter(item=>Math.abs(item.latitude-next.latitude)>.001||Math.abs(item.longitude-next.longitude)>.001)].slice(0,5);localStorage.setItem("skewed:recents",JSON.stringify(updated));return updated})},[]);
  const toggleFavorite=()=>{setFavorites(previous=>{const exists=previous.some(item=>Math.abs(item.latitude-place.latitude)<.001&&Math.abs(item.longitude-place.longitude)<.001);const updated=exists?previous.filter(item=>Math.abs(item.latitude-place.latitude)>.001||Math.abs(item.longitude-place.longitude)>.001):[place,...previous];localStorage.setItem("skewed:favorites",JSON.stringify(updated));return updated})};
  useEffect(()=>{const connected=()=>setOnline(true),disconnected=()=>setOnline(false);window.addEventListener("online",connected);window.addEventListener("offline",disconnected);return()=>{window.removeEventListener("online",connected);window.removeEventListener("offline",disconnected)}},[]);
  useEffect(()=>{localStorage.setItem("skewed:field-mode",String(fieldMode));if(!fieldMode)return;let lock:{release:()=>Promise<void>}|undefined;const wakeLock=(navigator as Navigator&{wakeLock?:{request:(type:"screen")=>Promise<{release:()=>Promise<void>}>}}).wakeLock;wakeLock?.request("screen").then(value=>{lock=value}).catch(()=>{});return()=>{lock?.release().catch(()=>{})}},[fieldMode]);
  useEffect(()=>{
    let current=true;
    const valid=new Date(); valid.setUTCMinutes(0,0,0); valid.setUTCHours(valid.getUTCHours()+time);
    const request=model==="OBS"?getObservedProfile(place.latitude,place.longitude):openMeteoHrrrProvider.getProfile({latitude:place.latitude,longitude:place.longitude,validTimeIso:valid.toISOString(),model});
    request
      .then(next=>{if(current){next.location.name=placeLabel(place);cacheProfile(next);setProfile(next);setDataState("live")}})
      .catch(()=>{if(current){const fallback=cachedProfile(place.latitude,place.longitude);if(fallback){setProfile(fallback);setDataState("cached")}else setDataState("error")}});
    return()=>{current=false};
  },[time,model,place,refreshKey]);
  useEffect(()=>{if(!compare||model==="OBS"){return}let current=true;const valid=new Date();valid.setUTCMinutes(0,0,0);valid.setUTCHours(valid.getUTCHours()+time+3);openMeteoHrrrProvider.getProfile({latitude:place.latitude,longitude:place.longitude,validTimeIso:valid.toISOString(),model}).then(next=>{if(current)setComparison(next)}).catch(()=>{if(current)setComparison(undefined)});return()=>{current=false}},[compare,time,model,place,refreshKey]);
  const display=(value:number|undefined,digits=0)=>Number.isFinite(value)?Number(value).toFixed(digits):"—";
  const riskScore=profile?.indices.fixedStp??0;
  const riskLabel=riskScore>=3?"Significant":riskScore>=1?"Elevated":riskScore>=.25?"Conditional":"Limited";
  const validLabel=profile?new Date(profile.validTimeIso).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"}):"Loading…";
  return <main className={fieldMode?"field-mode":""}>
    <header>
      <div className="brand"><span className="brandmark">S</span><div><b>SKEWED</b><small>ATMOSPHERIC INTELLIGENCE</small></div></div>
      <div className="header-actions"><button className="field-toggle" onClick={()=>setFieldMode(value=>!value)}>⌁ {fieldMode?"FIELD ON":"FIELD MODE"}</button><button className="live"><i className={!online?"offline":dataState}/>{dataState==="live"&&online?" LIVE HRRR":dataState==="cached"||!online?" CACHED":dataState==="loading"?" LOADING":" DATA ERROR"}</button><button className="icon" aria-label="Settings">⌘</button><button className="avatar">TT</button></div>
    </header>

    <section className="toolbar glass">
      <div className="location"><span>⌖</span><input aria-label="Location search" value={location} onChange={e=>setLocation(e.target.value)} onFocus={()=>setSuggestions(recents)}/><small>{Math.abs(place.latitude).toFixed(3)}° {place.latitude>=0?"N":"S"} · {Math.abs(place.longitude).toFixed(3)}° {place.longitude>=0?"E":"W"}</small>{suggestions.length>0&&<div className="suggestions">{suggestions.map((item,index)=><button key={`${item.latitude}-${item.longitude}-${index}`} onClick={()=>choosePlace(item)}><b>{item.name}</b><span>{[item.admin,item.country].filter(Boolean).join(" · ")}</span></button>)}</div>}</div>
      <div className="divider"/>
      <div className="model"><span className="model-label">MODEL</span><div className="segmented">{models.map(m=><button className={model===m?"active":""} onClick={()=>{setDataState("loading");setModel(m)}} key={m}>{m}</button>)}</div></div>
      <button className="map-button" onClick={()=>setMapOpen(true)}>◉ <span>MAP</span></button><button className="refresh" onClick={()=>{setDataState("loading");setTime(0);setRefreshKey(key=>key+1)}}>↻ <span>UPDATE</span></button>
    </section>

    <section className="workspace">
      <aside className={`summary glass ${layers?"":"collapsed"}`}>
        <div className="eyebrow"><span>{profile?.source==="observed"?"OBSERVED SOUNDING":"FORECAST SOUNDING"}</span><button onClick={toggleFavorite} aria-label="Favorite">{favorite?"★":"☆"}</button></div>
        <h1>{location || "Wichita, KS"}</h1><p>Valid {validLabel}</p>
        <div className="risk"><div><span className="pulse"/><b>COMPOSITE ENVIRONMENT</b></div><strong>{riskLabel}</strong><p>Objective category from the current parcel, shear, SRH, and LCL profile.</p></div>
        <div className="metrics">
          <article><span className="metric-label">SBCAPE</span><strong>{display(profile?.indices.sbcapeJkg)}</strong><small>J/kg</small><em>LIVE MODEL</em></article>
          <article><span className="metric-label">0–6 KM SHEAR</span><strong>{display(profile?.indices.shear06Kt)}</strong><small>kt</small><em>DERIVED</em></article>
          <article><span className="metric-label">LCL HEIGHT</span><strong>{display(profile?.indices.lclM)}</strong><small>m AGL</small><em className="neutral">DERIVED</em></article>
          <article><span className="metric-label">STP (FIXED)</span><strong>{display(profile?.indices.fixedStp,1)}</strong><small>index</small><em>DERIVED</em></article>
        </div>
        <div className="analysis"><span>DATA PROVENANCE</span><p>{profile?`${profile.provider}. ${profile.levels.length} pressure levels loaded. Shear and LCL are derived in Skewed.`:"Connecting to the latest available HRRR profile…"}</p></div>
      </aside>

      <section className="plot glass">
        <div className="plot-head"><div><span>SKEW-T · LOG-P</span><b>{model} {model==="OBS"?"LATEST RELEASE":"LATEST RUN"} <i>•</i> {profile?.source==="forecast"?`F${String(profile.forecastHour).padStart(2,"0")}`:"RAOB"}</b></div><div className="plot-tools"><button disabled={model==="OBS"} onClick={()=>setCompare(value=>!value)} className={compare&&model!=="OBS"?"selected compare":""}>⇄ <span>COMPARE</span></button><button onClick={()=>setParcel(!parcel)} className={parcel?"selected":""}>◒ <span>PARCEL</span></button><button onClick={()=>setLayers(!layers)}>▤ <span>PANEL</span></button><button>↗</button></div></div>
        <div className="legend"><span className="red"/> Temperature <span className="green"/> Dew point {parcel&&<><span className="yellow"/> Parcel</>} {compare&&comparison&&<b className="compare-key">DASHED · +3H</b>}</div>
        <div className="chart"><SoundingChart hour={time} parcel={parcel} levels={profile?.levels} comparison={compare?comparison?.levels:undefined}/><div className="cape-label">CAPE<br/><b>{display(profile?.indices.sbcapeJkg)}</b></div>{compare&&comparison&&<div className="compare-card"><span>+3H COMPARISON</span><b>{new Date(comparison.validTimeIso).getUTCHours().toString().padStart(2,"0")}Z</b><div><small>CAPE</small><strong>{display(comparison.indices.sbcapeJkg)}</strong><em>{display(comparison.indices.sbcapeJkg-(profile?.indices.sbcapeJkg??0))}</em></div><div><small>SHEAR</small><strong>{display(comparison.indices.shear06Kt)} kt</strong><em>{display(comparison.indices.shear06Kt-(profile?.indices.shear06Kt??0))}</em></div><div><small>STP</small><strong>{display(comparison.indices.fixedStp,1)}</strong><em>{display(comparison.indices.fixedStp-(profile?.indices.fixedStp??0),1)}</em></div></div>}</div>
      </section>

      <aside className="hodo glass">
        <div className="hodo-head"><span>HODOGRAPH</span><b>0–6 KM</b></div>
        <div className="hodo-plot"><Hodograph levels={profile?.levels}/></div>
        <div className="hodo-stats"><div><span>SRH 0–1 KM</span><b>{display(profile?.indices.srh01M2s2)} <small>m²/s²</small></b></div><div><span>SRH 0–3 KM</span><b>{display(profile?.indices.srh03M2s2)} <small>m²/s²</small></b></div><div><span>0–1 KM SHEAR</span><b>{display(profile?.indices.shear01Kt)} <small>kt</small></b></div></div>
      </aside>
    </section>

    <section className="timeline glass"><button className="play" onClick={()=>{setDataState("loading");setTime((time+1)%7)}}>▶</button><div className="time-track">{times.map((t,i)=><button key={t} onClick={()=>{setDataState("loading");setTime(i)}} className={time===i?"active":""}><span>{profile?`${String((new Date(profile.validTimeIso).getUTCHours()-time+i+24)%24).padStart(2,"0")}Z`:"—"}</span><b>{t}</b></button>)}</div><div className="valid"><span>VALID</span><b>{validLabel.toUpperCase()}</b></div></section>
    <nav className="mobile-nav"><button className="active">⌁<span>Sounding</span></button><button onClick={()=>setMapOpen(true)}>◉<span>Map</span></button><button onClick={()=>setPlacesOpen(true)}>◇<span>Favorites</span></button><button onClick={()=>setFieldMode(value=>!value)}>⚙<span>Field mode</span></button></nav>
    {mapOpen&&<div className="map-modal" role="dialog" aria-modal="true" aria-label="Location map"><div className="map-sheet glass"><div className="map-title"><div><small>SOUNDING LOCATION</small><b>{placeLabel(place)}</b></div><div><button onClick={()=>navigator.geolocation?.getCurrentPosition(position=>choosePlace({name:"Current location",latitude:position.coords.latitude,longitude:position.coords.longitude}))}>⌖ USE MY LOCATION</button><button aria-label="Close map" onClick={()=>setMapOpen(false)}>×</button></div></div><MapPicker place={place} onSelect={choosePlace}/><div className="map-footer"><span>Tap anywhere to sample the nearest HRRR grid point.</span><button onClick={()=>setMapOpen(false)}>USE THIS LOCATION</button></div></div></div>}
    {placesOpen&&<div className="map-modal" role="dialog" aria-modal="true" aria-label="Saved locations"><div className="places-sheet glass"><div className="map-title"><div><small>PLACES</small><b>Saved & recent</b></div><button aria-label="Close saved locations" onClick={()=>setPlacesOpen(false)}>×</button></div><section><h2>Favorites</h2>{favorites.length?favorites.map(item=><button key={`${item.latitude}-${item.longitude}`} onClick={()=>{choosePlace(item);setPlacesOpen(false)}}><span>★</span><b>{placeLabel(item)}</b><small>{item.latitude.toFixed(2)} · {item.longitude.toFixed(2)}</small></button>):<p>Star a sounding to keep it here.</p>}</section><section><h2>Recent</h2>{recents.map(item=><button key={`${item.latitude}-${item.longitude}`} onClick={()=>{choosePlace(item);setPlacesOpen(false)}}><span>⌖</span><b>{placeLabel(item)}</b><small>{item.latitude.toFixed(2)} · {item.longitude.toFixed(2)}</small></button>)}</section></div></div>}
  </main>
}
