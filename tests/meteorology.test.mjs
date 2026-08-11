import assert from "node:assert/strict";
import test from "node:test";
import { calculateLcl, deriveSoundingIndices, surfaceParcelProfile } from "../lib/meteorology.ts";

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
