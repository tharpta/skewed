import type { SoundingProfile } from "./sounding";

const PREFIX = "skewed:profile:";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const key = (latitude:number,longitude:number,model:string) => `${PREFIX}${model}:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;

export function cacheProfile(profile:SoundingProfile, latitude=profile.location.latitude, longitude=profile.location.longitude) {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(key(latitude,longitude,profile.model),JSON.stringify({savedAt:Date.now(),profile})); } catch { /* Storage can be unavailable in private or quota-limited contexts. */ }
}

export function clearSkewedStorage(){if(typeof localStorage==="undefined")return;for(let index=localStorage.length-1;index>=0;index--){const item=localStorage.key(index);if(item?.startsWith("skewed:"))localStorage.removeItem(item)}}

export function cachedProfile(latitude:number,longitude:number,model:string):SoundingProfile|undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const stored=JSON.parse(localStorage.getItem(key(latitude,longitude,model))||"null") as {savedAt:number;profile:SoundingProfile}|null;
    if(!stored||Date.now()-stored.savedAt>MAX_AGE_MS)return undefined;
    return stored.profile;
  } catch { return undefined; }
}
