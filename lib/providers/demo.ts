import type { SoundingProfile, SoundingProvider } from "../sounding";

// Deterministic provider used while live adapters are connected. Keeping it behind
// the same interface means the plot will not need to change when real data lands.
export const demoSoundingProvider: SoundingProvider = {
  id: "demo-hrrr",
  async getProfile(input): Promise<SoundingProfile> {
    return {
      id: `hrrr-${input.validTimeIso}`,
      source: "forecast",
      provider: "Prototype dataset",
      model: input.model ?? "HRRR",
      runTimeIso: "2026-08-10T18:00:00Z",
      validTimeIso: input.validTimeIso,
      forecastHour: 3,
      location: {
        name: "Wichita, KS",
        latitude: input.latitude,
        longitude: input.longitude,
        elevationM: 408,
      },
      levels: [
        [1000, 408, 31, 22, 165, 14], [925, 1100, 25, 19, 175, 20],
        [850, 1580, 20, 15, 190, 27], [700, 3100, 7, -1, 215, 35],
        [500, 5750, -10, -24, 235, 47], [300, 9300, -36, -50, 250, 62],
        [200, 11900, -54, -65, 260, 74], [100, 16100, -68, -76, 270, 54],
      ].map(([pressureHpa,heightM,temperatureC,dewpointC,windDirectionDeg,windSpeedKt]) => ({
        pressureHpa,heightM,temperatureC,dewpointC,windDirectionDeg,windSpeedKt,
      })),
      indices: {
        sbcapeJkg: 2312, mlcapeJkg: 1840, cinJkg: -38, lclM: 944,
        shear01Kt: 24, shear06Kt: 46, srh01M2s2: 186, srh03M2s2: 284,
        fixedStp: 1.9,
      },
    };
  },
};
