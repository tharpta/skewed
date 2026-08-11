export interface Place {
  name: string;
  latitude: number;
  longitude: number;
  admin?: string;
  country?: string;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const params = new URLSearchParams({ name: query.trim(), count: "6", language: "en", format: "json" });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!response.ok) throw new Error("Location search is unavailable");
  const payload = await response.json() as { results?: Array<{name:string;latitude:number;longitude:number;admin1?:string;country?:string}> };
  return (payload.results ?? []).map(result=>({name:result.name,latitude:result.latitude,longitude:result.longitude,admin:result.admin1,country:result.country}));
}

export function placeLabel(place: Place) {
  return [place.name, place.admin].filter(Boolean).join(", ");
}
