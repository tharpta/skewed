import { deriveSoundingIndices } from "../meteorology";
import type { SoundingLevel, SoundingProfile } from "../sounding";

const stations = [
  ["KDDC","Dodge City, KS",37.76,-99.97], ["KOUN","Norman, OK",35.18,-97.44],
  ["KTOP","Topeka, KS",39.07,-95.63], ["KAMA","Amarillo, TX",35.23,-101.71],
  ["KLBF","North Platte, NE",41.13,-100.70], ["KSGF","Springfield, MO",37.24,-93.40],
  ["KOAX","Omaha, NE",41.32,-96.37], ["KABR","Aberdeen, SD",45.46,-98.41],
] as const;

const radians=(degrees:number)=>degrees*Math.PI/180;
function distanceKm(aLat:number,aLon:number,bLat:number,bLon:number){const dLat=radians(bLat-aLat),dLon=radians(bLon-aLon);const value=Math.sin(dLat/2)**2+Math.cos(radians(aLat))*Math.cos(radians(bLat))*Math.sin(dLon/2)**2;return 6371*2*Math.atan2(Math.sqrt(value),Math.sqrt(1-value))}

export function nearestObservedStation(latitude:number,longitude:number){return [...stations].sort((a,b)=>distanceKm(latitude,longitude,a[2],a[3])-distanceKm(latitude,longitude,b[2],b[3]))[0]}

export async function getObservedProfile(latitude:number,longitude:number,signal?:AbortSignal):Promise<SoundingProfile>{
  const candidates=[...stations].sort((a,b)=>distanceKm(latitude,longitude,a[2],a[3])-distanceKm(latitude,longitude,b[2],b[3]));
  let lastError:unknown;
  for(const station of candidates.slice(0,4)){try{return await fetchStationProfile(station,signal)}catch(error){if(signal?.aborted)throw error;lastError=error}}
  throw lastError instanceof Error?lastError:new Error("No recent observed sounding nearby");
}

async function fetchStationProfile(station:typeof stations[number],signal?:AbortSignal):Promise<SoundingProfile>{
  const end=new Date(),start=new Date(end.getTime()-42*3_600_000);
  const params=new URLSearchParams({sts:start.toISOString(),ets:end.toISOString(),station:station[0],format:"comma"});
  const response=await fetch(`https://mesonet.agron.iastate.edu/cgi-bin/request/raob.py?${params}`,{signal});
  if(!response.ok)throw new Error(`Observed provider returned ${response.status}`);
  const lines=(await response.text()).trim().split("\n");if(lines.length<3)throw new Error("No recent observed sounding");
  const rows=lines.slice(1).map(line=>line.split(","));const latest=rows.map(row=>row[1]).sort().at(-1)!;
  const levels=rows.filter(row=>row[1]===latest).map((row):SoundingLevel|null=>{
    const values=row.slice(3,9).map(value=>value==="M"?Number.NaN:Number(value));
    if(!values.every(Number.isFinite))return null;
    return {pressureHpa:values[0],heightM:values[1],temperatureC:values[2],dewpointC:values[3],windDirectionDeg:values[4],windSpeedKt:values[5]};
  }).filter((level):level is SoundingLevel=>level!==null).sort((a,b)=>b.pressureHpa-a.pressureHpa);
  if(levels.length<8)throw new Error("Observed sounding is incomplete");
  const validTimeIso=`${latest.replace(" ","T")}Z`;
  return {id:`obs-${station[0]}-${validTimeIso}`,source:"observed",provider:`NWS RAOB via Iowa Environmental Mesonet · ${station[0]}`,model:"OBS",runTimeIso:validTimeIso,validTimeIso,forecastHour:0,location:{name:station[1],latitude:station[2],longitude:station[3],elevationM:levels[0].heightM},levels,indices:deriveSoundingIndices(levels)};
}
