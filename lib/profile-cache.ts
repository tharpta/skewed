import type { SoundingProfile } from "./sounding";

const PREFIX = "skewed:profile:";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const key = (latitude:number,longitude:number) => `${PREFIX}${latitude.toFixed(2)}:${longitude.toFixed(2)}`;

export function cacheProfile(profile:SoundingProfile) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key(profile.location.latitude,profile.location.longitude),JSON.stringify({savedAt:Date.now(),profile}));
}

export function cachedProfile(latitude:number,longitude:number):SoundingProfile|undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const stored=JSON.parse(localStorage.getItem(key(latitude,longitude))||"null") as {savedAt:number;profile:SoundingProfile}|null;
    if(!stored||Date.now()-stored.savedAt>MAX_AGE_MS)return undefined;
    return stored.profile;
  } catch { return undefined; }
}
