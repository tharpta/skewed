"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openMeteoHrrrProvider } from "../lib/providers/open-meteo";
import type { SoundingLevel, SoundingProfile } from "../lib/sounding";
import { bunkersRightMover, surfaceParcelProfile } from "../lib/meteorology";
import { MapPicker } from "./MapPicker";
import { placeLabel, searchPlaces, type Place } from "../lib/locations";

const models = ["HRRR"];
const times = ["NOW", "+1H", "+2H", "+3H", "+4H", "+5H", "+6H"];

function SoundingChart({ hour, parcel, levels }: { hour: number; parcel: boolean; levels?: SoundingLevel[] }) {
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
        c.beginPath(); c.setLineDash(dash); pts.forEach(([x,y],i)=>{ const px=left+x*(right-left), py=top+y*(bottom-top); i?c.lineTo(px,py):c.moveTo(px,py)});
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
  },[hour,parcel,levels]);
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
  const [layers,setLayers]=useState(true); const [favorite,setFavorite]=useState(false);
  const [place,setPlace]=useState<Place>({name:"Wichita",admin:"Kansas",latitude:37.687,longitude:-97.330});
  const [mapOpen,setMapOpen]=useState(false); const [suggestions,setSuggestions]=useState<Place[]>([]);
  const [recents,setRecents]=useState<Place[]>([]); const [favorites,setFavorites]=useState<Place[]>([]);
  const [profile,setProfile]=useState<SoundingProfile>(); const [dataState,setDataState]=useState<"loading"|"live"|"error">("loading");
  useEffect(()=>{try{setRecents(JSON.parse(localStorage.getItem("skewed:recents")||"[]"));setFavorites(JSON.parse(localStorage.getItem("skewed:favorites")||"[]"))}catch{}},[]);
  useEffect(()=>setFavorite(favorites.some(item=>Math.abs(item.latitude-place.latitude)<.001&&Math.abs(item.longitude-place.longitude)<.001)),[favorites,place]);
  useEffect(()=>{const id=setTimeout(()=>searchPlaces(location).then(setSuggestions).catch(()=>setSuggestions([])),350);return()=>clearTimeout(id)},[location]);
  const choosePlace=useCallback((next:Place)=>{setPlace(next);setLocation(placeLabel(next));setSuggestions([]);setRecents(previous=>{const updated=[next,...previous.filter(item=>Math.abs(item.latitude-next.latitude)>.001||Math.abs(item.longitude-next.longitude)>.001)].slice(0,5);localStorage.setItem("skewed:recents",JSON.stringify(updated));return updated})},[]);
  const toggleFavorite=()=>{setFavorites(previous=>{const exists=previous.some(item=>Math.abs(item.latitude-place.latitude)<.001&&Math.abs(item.longitude-place.longitude)<.001);const updated=exists?previous.filter(item=>Math.abs(item.latitude-place.latitude)>.001||Math.abs(item.longitude-place.longitude)>.001):[place,...previous];localStorage.setItem("skewed:favorites",JSON.stringify(updated));setFavorite(!exists);return updated})};
  useEffect(()=>{
    let current=true; setDataState("loading");
    const valid=new Date(); valid.setUTCMinutes(0,0,0); valid.setUTCHours(valid.getUTCHours()+time);
    openMeteoHrrrProvider.getProfile({latitude:place.latitude,longitude:place.longitude,validTimeIso:valid.toISOString(),model})
      .then(next=>{if(current){next.location.name=placeLabel(place);setProfile(next);setDataState("live")}})
      .catch(()=>{if(current)setDataState("error")});
    return()=>{current=false};
  },[time,model,place]);
  const display=(value:number|undefined,digits=0)=>Number.isFinite(value)?Number(value).toFixed(digits):"—";
  return <main>
    <header>
      <div className="brand"><span className="brandmark">S</span><div><b>SKEWED</b><small>ATMOSPHERIC INTELLIGENCE</small></div></div>
      <div className="header-actions"><button className="live"><i className={dataState}/>{dataState==="live"?" LIVE HRRR":dataState==="loading"?" LOADING":" DATA ERROR"}</button><button className="icon" aria-label="Settings">⌘</button><button className="avatar">TT</button></div>
    </header>

    <section className="toolbar glass">
      <div className="location"><span>⌖</span><input aria-label="Location search" value={location} onChange={e=>setLocation(e.target.value)} onFocus={()=>setSuggestions(recents)}/><small>{Math.abs(place.latitude).toFixed(3)}° {place.latitude>=0?"N":"S"} · {Math.abs(place.longitude).toFixed(3)}° {place.longitude>=0?"E":"W"}</small>{suggestions.length>0&&<div className="suggestions">{suggestions.map((item,index)=><button key={`${item.latitude}-${item.longitude}-${index}`} onClick={()=>choosePlace(item)}><b>{item.name}</b><span>{[item.admin,item.country].filter(Boolean).join(" · ")}</span></button>)}</div>}</div>
      <div className="divider"/>
      <div className="model"><label>MODEL</label><div className="segmented">{models.map(m=><button className={model===m?"active":""} onClick={()=>setModel(m)} key={m}>{m}</button>)}</div></div>
      <button className="map-button" onClick={()=>setMapOpen(true)}>◉ <span>MAP</span></button><button className="refresh" onClick={()=>setTime(0)}>↻ <span>UPDATE</span></button>
    </section>

    <section className="workspace">
      <aside className={`summary glass ${layers?"":"collapsed"}`}>
        <div className="eyebrow"><span>FORECAST SOUNDING</span><button onClick={toggleFavorite} aria-label="Favorite">{favorite?"★":"☆"}</button></div>
        <h1>{location || "Wichita, KS"}</h1><p>{profile?`Valid ${new Date(profile.validTimeIso).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC",timeZoneName:"short"})}`:"Loading forecast profile…"}</p>
        <div className="risk"><div><span className="pulse"/><b>SEVERE POTENTIAL</b></div><strong>Elevated</strong><p>Conditional supercell environment after 23Z</p></div>
        <div className="metrics">
          <article><label>SBCAPE</label><strong>{display(profile?.indices.sbcapeJkg)}</strong><small>J/kg</small><em>LIVE MODEL</em></article>
          <article><label>0–6 KM SHEAR</label><strong>{display(profile?.indices.shear06Kt)}</strong><small>kt</small><em>DERIVED</em></article>
          <article><label>LCL HEIGHT</label><strong>{display(profile?.indices.lclM)}</strong><small>m AGL</small><em className="neutral">ESTIMATED</em></article>
          <article><label>STP (FIXED)</label><strong>{display(profile?.indices.fixedStp,1)}</strong><small>index</small><em>COMING NEXT</em></article>
        </div>
        <div className="analysis"><span>DATA PROVENANCE</span><p>{profile?`${profile.provider}. ${profile.levels.length} pressure levels loaded. Shear and LCL are derived in Skewed.`:"Connecting to the latest available HRRR profile…"}</p></div>
      </aside>

      <section className="plot glass">
        <div className="plot-head"><div><span>SKEW-T · LOG-P</span><b>{model} 18Z RUN <i>•</i> F0{time+2}</b></div><div className="plot-tools"><button onClick={()=>setParcel(!parcel)} className={parcel?"selected":""}>◒ <span>PARCEL</span></button><button onClick={()=>setLayers(!layers)}>▤ <span>PANEL</span></button><button>↗</button></div></div>
        <div className="legend"><span className="red"/> Temperature <span className="green"/> Dew point {parcel&&<><span className="yellow"/> Parcel</>}</div>
        <div className="chart"><SoundingChart hour={time} parcel={parcel} levels={profile?.levels}/><div className="cape-label">CAPE<br/><b>{display(profile?.indices.sbcapeJkg)}</b></div></div>
      </section>

      <aside className="hodo glass">
        <div className="hodo-head"><span>HODOGRAPH</span><b>0–6 KM</b></div>
        <div className="hodo-plot"><Hodograph levels={profile?.levels}/></div>
        <div className="hodo-stats"><div><span>SRH 0–1 KM</span><b>{display(profile?.indices.srh01M2s2)} <small>m²/s²</small></b></div><div><span>SRH 0–3 KM</span><b>{display(profile?.indices.srh03M2s2)} <small>m²/s²</small></b></div><div><span>0–1 KM SHEAR</span><b>{display(profile?.indices.shear01Kt)} <small>kt</small></b></div></div>
      </aside>
    </section>

    <section className="timeline glass"><button className="play" onClick={()=>setTime((time+1)%7)}>▶</button><div className="time-track">{times.map((t,i)=><button key={t} onClick={()=>setTime(i)} className={time===i?"active":""}><span>{i===0?"18Z":`${18+i>23?18+i-24:18+i}Z`}</span><b>{t}</b></button>)}</div><div className="valid"><span>VALID</span><b>AUG 10 · 21:00Z</b></div></section>
    <nav className="mobile-nav"><button className="active">⌁<span>Sounding</span></button><button>◉<span>Map</span></button><button>◇<span>Favorites</span></button><button>⚙<span>Settings</span></button></nav>
    {mapOpen&&<div className="map-modal" role="dialog" aria-modal="true" aria-label="Location map"><div className="map-sheet glass"><div className="map-title"><div><small>SOUNDING LOCATION</small><b>{placeLabel(place)}</b></div><div><button onClick={()=>navigator.geolocation?.getCurrentPosition(position=>choosePlace({name:"Current location",latitude:position.coords.latitude,longitude:position.coords.longitude}))}>⌖ USE MY LOCATION</button><button aria-label="Close map" onClick={()=>setMapOpen(false)}>×</button></div></div><MapPicker place={place} onSelect={choosePlace}/><div className="map-footer"><span>Tap anywhere to sample the nearest HRRR grid point.</span><button onClick={()=>setMapOpen(false)}>USE THIS LOCATION</button></div></div></div>}
  </main>
}
