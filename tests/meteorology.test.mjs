import assert from "node:assert/strict";
import test from "node:test";
import { calculateLcl, deriveSoundingIndices, surfaceParcelProfile } from "../lib/meteorology.ts";
import { windBarbParts } from "../lib/wind-barb.ts";
import { parseObservedRows } from "../lib/providers/observed.ts";

const levels = [
  [960, 400, 29, 19], [900, 950, 23, 15], [800, 1900, 15, 7],
  [700, 3100, 6, -3], [600, 4300, -3, -14], [500, 5700, -13, -25],
  [400, 7300, -25, -38], [300, 9300, -40, -53], [200, 11800, -55, -66],
].map(([pressureHpa,heightM,temperatureC,dewpointC])=>({
  pressureHpa,heightM,temperatureC,dewpointC,windDirectionDeg:210,windSpeedKt:25,
}));

test("LCL and parcel calculations stay finite for a surface-based profile",()=>{
  const lcl=calculateLcl(960,29,19); const parcel=surfaceParcelProfile(levels);
  assert.ok(lcl.pressureHpa<960&&lcl.pressureHpa>700);
  assert.ok(parcel.lclM>500&&parcel.lclM<2000);
  assert.ok(parcel.points.every(point=>Number.isFinite(point.temperatureC)&&Number.isFinite(point.buoyancyMs2)));
});

test("uniform wind produces zero shear, SRH, and STP",()=>{
  const indices=deriveSoundingIndices(levels,1500,-20);
  assert.equal(indices.shear01Kt,0); assert.equal(indices.shear06Kt,0);
  assert.equal(indices.srh01M2s2,0); assert.equal(indices.srh03M2s2,0);
  assert.equal(indices.fixedStp,0);
});

test("wind barbs use standard 50, 10, and 5 knot components",()=>{
  assert.deepEqual(windBarbParts(2),{pennants:0,fullBarbs:0,halfBarbs:0,calm:true});
  assert.deepEqual(windBarbParts(5),{pennants:0,fullBarbs:0,halfBarbs:1,calm:false});
  assert.deepEqual(windBarbParts(25),{pennants:0,fullBarbs:2,halfBarbs:1,calm:false});
  assert.deepEqual(windBarbParts(75),{pennants:1,fullBarbs:2,halfBarbs:1,calm:false});
  assert.deepEqual(windBarbParts(105),{pennants:2,fullBarbs:0,halfBarbs:1,calm:false});
});

test("observed parser preserves thermodynamic levels without reported winds",()=>{
  const rows=[
    ["KMFL","2026-08-13 12:00:00","4","1000","100","30","24","120","10"],
    ["KMFL","2026-08-13 12:00:00","4","950","550","26","21","M","M"],
    ["KMFL","2026-08-13 12:00:00","4","900","1000","22","17","180","20"],
  ];
  const levels=parseObservedRows(rows);
  assert.equal(levels.length,3);assert.equal(levels[1].temperatureC,26);
  assert.ok(levels[1].windSpeedKt>10&&levels[1].windSpeedKt<20);
});
