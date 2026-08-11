export type SoundingSource = "observed" | "forecast";

export interface SoundingLevel {
  pressureHpa: number;
  heightM: number;
  temperatureC: number;
  dewpointC: number;
  windDirectionDeg: number;
  windSpeedKt: number;
}

export interface SoundingIndices {
  sbcapeJkg: number;
  mlcapeJkg: number;
  cinJkg: number;
  lclM: number;
  shear01Kt: number;
  shear06Kt: number;
  srh01M2s2: number;
  srh03M2s2: number;
  fixedStp: number;
}

export interface SoundingProfile {
  id: string;
  source: SoundingSource;
  provider: string;
  model: string;
  runTimeIso: string;
  validTimeIso: string;
  forecastHour: number;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    elevationM: number;
  };
  levels: SoundingLevel[];
  indices: SoundingIndices;
}

export interface SoundingProvider {
  id: string;
  getProfile(input: {
    latitude: number;
    longitude: number;
    validTimeIso: string;
    model?: string;
  }): Promise<SoundingProfile>;
}

/** Returns the closest atmospheric level without silently extrapolating. */
export function nearestPressureLevel(
  levels: SoundingLevel[],
  pressureHpa: number,
): SoundingLevel | undefined {
  if (!levels.length) return undefined;
  return levels.reduce((closest, level) =>
    Math.abs(level.pressureHpa - pressureHpa) <
    Math.abs(closest.pressureHpa - pressureHpa)
      ? level
      : closest,
  );
}

/** Meteorological direction/speed to Cartesian wind components in knots. */
export function windComponents(directionDeg: number, speedKt: number) {
  const radians = (directionDeg * Math.PI) / 180;
  return {
    uKt: -speedKt * Math.sin(radians),
    vKt: -speedKt * Math.cos(radians),
  };
}

export function formatValidTime(iso: string, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(new Date(iso));
}
