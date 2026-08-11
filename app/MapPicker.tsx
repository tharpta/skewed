"use client";
import { useEffect, useRef } from "react";
import type { Place } from "../lib/locations";

export function MapPicker({place,onSelect}:{place:Place;onSelect:(place:Place)=>void}){
  const element=useRef<HTMLDivElement>(null);
  useEffect(()=>{let map:{remove:()=>void}|undefined;let active=true;(async()=>{
    const L=await import("leaflet");if(!active||!element.current)return;
    map=L.map(element.current,{zoomControl:true,attributionControl:true}).setView([place.latitude,place.longitude],6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:18,attribution:"© OpenStreetMap"}).addTo(map);
    const marker=L.circleMarker([place.latitude,place.longitude],{radius:8,color:"#74d9ee",fillColor:"#74d9ee",fillOpacity:.35,weight:2}).addTo(map);
    map.on("click",(event:L.LeafletMouseEvent)=>{marker.setLatLng(event.latlng);onSelect({name:`${event.latlng.lat.toFixed(3)}°, ${event.latlng.lng.toFixed(3)}°`,latitude:event.latlng.lat,longitude:event.latlng.lng})});
  })();return()=>{active=false;map?.remove()}},[place.latitude,place.longitude,onSelect]);
  return <div className="map-canvas" ref={element} aria-label="Choose a sounding location on the map"/>;
}
