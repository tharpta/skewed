import { windComponents, type SoundingIndices, type SoundingLevel } from "./sounding";

const G = 9.80665;
const RD = 287.05;
const CP = 1004;
const EPSILON = 0.622;
const LV = 2.5e6;

const kelvin = (celsius: number) => celsius + 273.15;
const celsius = (temperatureK: number) => temperatureK - 273.15;

function saturationVaporPressureHpa(temperatureC: number) {
  return 6.112 * Math.exp((17.67 * temperatureC) / (temperatureC + 243.5));
}

function mixingRatio(pressureHpa: number, dewpointC: number) {
  const vaporPressure = saturationVaporPressureHpa(dewpointC);
  return (EPSILON * vaporPressure) / Math.max(1, pressureHpa - vaporPressure);
}

function saturationMixingRatio(pressureHpa: number, temperatureK: number) {
  return mixingRatio(pressureHpa, celsius(temperatureK));
}

function virtualTemperature(temperatureK: number, waterMixingRatio: number) {
  return temperatureK * (1 + 0.61 * waterMixingRatio);
}

export function calculateLcl(pressureHpa: number, temperatureC: number, dewpointC: number) {
  const temperatureK = kelvin(temperatureC);
  const dewpointK = kelvin(Math.min(dewpointC, temperatureC));
  const temperatureKAtLcl = 1 / (1 / (dewpointK - 56) + Math.log(temperatureK / dewpointK) / 800) + 56;
  const pressureHpaAtLcl = pressureHpa * Math.pow(temperatureKAtLcl / temperatureK, CP / RD);
  return { temperatureK: temperatureKAtLcl, pressureHpa: pressureHpaAtLcl };
}

function moistTemperatureStep(temperatureK: number, fromPressureHpa: number, toPressureHpa: number) {
  const midpointPressurePa = ((fromPressureHpa + toPressureHpa) / 2) * 100;
  const saturationRatio = saturationMixingRatio(midpointPressurePa / 100, temperatureK);
  const lapseRate = G * (1 + (LV * saturationRatio) / (RD * temperatureK)) /
    (CP + (LV * LV * saturationRatio * EPSILON) / (RD * temperatureK * temperatureK));
  const virtual = virtualTemperature(temperatureK, saturationRatio);
  const heightChange = -(RD * virtual / G) * Math.log(toPressureHpa / fromPressureHpa);
  return temperatureK - lapseRate * heightChange;
}

export interface ParcelPoint {
  pressureHpa: number;
  heightM: number;
  temperatureC: number;
  buoyancyMs2: number;
}

export function surfaceParcelProfile(levels: SoundingLevel[]) {
  if (levels.length < 2) return { points: [] as ParcelPoint[], capeJkg: 0, cinJkg: 0, lclM: Number.NaN };
  const ordered = [...levels].sort((a, b) => b.pressureHpa - a.pressureHpa);
  const surface = ordered[0];
  const initialTemperatureK = kelvin(surface.temperatureC);
  const initialMixingRatio = mixingRatio(surface.pressureHpa, surface.dewpointC);
  const lcl = calculateLcl(surface.pressureHpa, surface.temperatureC, surface.dewpointC);
  const points: ParcelPoint[] = [];
  let previousPressure = surface.pressureHpa;
  let parcelTemperatureK = initialTemperatureK;
  for (const level of ordered) {
    if (level.pressureHpa >= lcl.pressureHpa) {
      parcelTemperatureK = initialTemperatureK * Math.pow(level.pressureHpa / surface.pressureHpa, RD / CP);
    } else {
      const stepStart = Math.min(previousPressure, lcl.pressureHpa);
      if (previousPressure >= lcl.pressureHpa) parcelTemperatureK = lcl.temperatureK;
      parcelTemperatureK = moistTemperatureStep(parcelTemperatureK, stepStart, level.pressureHpa);
    }
    const parcelRatio = level.pressureHpa >= lcl.pressureHpa
      ? initialMixingRatio
      : saturationMixingRatio(level.pressureHpa, parcelTemperatureK);
    const environmentRatio = mixingRatio(level.pressureHpa, level.dewpointC);
    const environmentVirtual = virtualTemperature(kelvin(level.temperatureC), environmentRatio);
    const parcelVirtual = virtualTemperature(parcelTemperatureK, parcelRatio);
    points.push({
      pressureHpa: level.pressureHpa,
      heightM: level.heightM,
      temperatureC: celsius(parcelTemperatureK),
      buoyancyMs2: G * (parcelVirtual - environmentVirtual) / environmentVirtual,
    });
    previousPressure = level.pressureHpa;
  }
  let capeJkg = 0; let cinJkg = 0; let positiveParcel = false; let equilibriumReached = false;
  for (let index = 1; index < points.length; index++) {
    const lower = points[index - 1], upper = points[index];
    const energy = ((lower.buoyancyMs2 + upper.buoyancyMs2) / 2) * Math.max(0, upper.heightM - lower.heightM);
    if (energy > 0 && !equilibriumReached) { positiveParcel = true; capeJkg += energy; }
    else if (energy <= 0 && !positiveParcel) cinJkg += energy;
    else if (energy <= 0 && positiveParcel) equilibriumReached = true;
  }
  const lclM = surface.heightM + (RD * initialTemperatureK / G) * Math.log(surface.pressureHpa / lcl.pressureHpa);
  return { points, capeJkg, cinJkg, lclM: lclM - surface.heightM };
}

function interpolateWind(levels: SoundingLevel[], heightAglM: number) {
  const surfaceHeight = Math.min(...levels.map((level) => level.heightM));
  const target = surfaceHeight + heightAglM;
  const ordered = [...levels].sort((a,b)=>a.heightM-b.heightM);
  const upperIndex = ordered.findIndex((level)=>level.heightM>=target);
  if (upperIndex < 0) return windComponents(ordered.at(-1)!.windDirectionDeg, ordered.at(-1)!.windSpeedKt);
  if (upperIndex === 0) return windComponents(ordered[0].windDirectionDeg, ordered[0].windSpeedKt);
  const lower = ordered[upperIndex-1], upper = ordered[upperIndex];
  const fraction = (target-lower.heightM)/(upper.heightM-lower.heightM);
  const a=windComponents(lower.windDirectionDeg,lower.windSpeedKt), b=windComponents(upper.windDirectionDeg,upper.windSpeedKt);
  return {uKt:a.uKt+(b.uKt-a.uKt)*fraction,vKt:a.vKt+(b.vKt-a.vKt)*fraction};
}

export function bunkersRightMover(levels: SoundingLevel[]) {
  const samples=[0,1000,2000,3000,4000,5000,6000].map(height=>interpolateWind(levels,height));
  const mean=samples.reduce((sum,wind)=>({uKt:sum.uKt+wind.uKt/samples.length,vKt:sum.vKt+wind.vKt/samples.length}),{uKt:0,vKt:0});
  const low=samples[0],high=samples.at(-1)!; const du=high.uKt-low.uKt,dv=high.vKt-low.vKt;
  const magnitude=Math.hypot(du,dv)||1; const deviationKt=14.58;
  return {uKt:mean.uKt+(deviationKt*dv)/magnitude,vKt:mean.vKt-(deviationKt*du)/magnitude};
}

export function stormRelativeHelicity(levels: SoundingLevel[], depthM: 1000|3000) {
  const storm=bunkersRightMover(levels); const increment=250;
  const winds=Array.from({length:depthM/increment+1},(_,i)=>interpolateWind(levels,i*increment));
  let helicityKt2=0;
  for(let i=0;i<winds.length-1;i++){
    const a=winds[i],b=winds[i+1];
    helicityKt2+=(a.uKt-storm.uKt)*(b.vKt-a.vKt)-(a.vKt-storm.vKt)*(b.uKt-a.uKt);
  }
  return helicityKt2*0.2648;
}

export function deriveSoundingIndices(levels: SoundingLevel[], providerCape?: number, providerCin?: number): SoundingIndices {
  const parcel=surfaceParcelProfile(levels);
  const wind0=interpolateWind(levels,0),wind1=interpolateWind(levels,1000),wind6=interpolateWind(levels,6000);
  const shear01Kt=Math.hypot(wind1.uKt-wind0.uKt,wind1.vKt-wind0.vKt);
  const shear06Kt=Math.hypot(wind6.uKt-wind0.uKt,wind6.vKt-wind0.vKt);
  const srh01M2s2=stormRelativeHelicity(levels,1000),srh03M2s2=stormRelativeHelicity(levels,3000);
  const cape=Number.isFinite(providerCape)?providerCape!:parcel.capeJkg;
  const capeTerm=Math.min(cape/1500,1.5),srhTerm=Math.min(Math.max(srh01M2s2,0)/150,1.5);
  const shearTerm=Math.max(0,Math.min((shear06Kt-12.5)/17.5,1.5));
  const lclTerm=Math.max(0,Math.min((2000-parcel.lclM)/1000,1));
  return {sbcapeJkg:cape,mlcapeJkg:Number.NaN,cinJkg:Number.isFinite(providerCin)?providerCin!:parcel.cinJkg,lclM:parcel.lclM,shear01Kt,shear06Kt,srh01M2s2,srh03M2s2,fixedStp:capeTerm*srhTerm*shearTerm*lclTerm};
}
