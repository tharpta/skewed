export interface WindBarbParts { pennants:number; fullBarbs:number; halfBarbs:number; calm:boolean }

/** Decomposes wind speed using the WMO/NWS 50/10/5-knot convention. */
export function windBarbParts(speedKt:number):WindBarbParts {
  let remaining=Math.max(0,Math.round(speedKt/5)*5);
  if(remaining<5)return {pennants:0,fullBarbs:0,halfBarbs:0,calm:true};
  const pennants=Math.floor(remaining/50);remaining-=pennants*50;
  const fullBarbs=Math.floor(remaining/10);remaining-=fullBarbs*10;
  return {pennants,fullBarbs,halfBarbs:remaining>=5?1:0,calm:false};
}
