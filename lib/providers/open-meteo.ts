import {
  nearestPressureLevel,
  windComponents,
  type SoundingLevel,
  type SoundingProfile,
  type SoundingProvider,
} from "../sounding";

export const PRESSURE_LEVELS = [
  1000, 975, 950, 925, 900, 875, 850, 825, 800, 775, 750, 725, 700,
  675, 650, 625, 600, 575, 550, 525, 500, 475, 450, 425, 400, 375,
  350, 325, 300, 275, 250, 225, 200, 175, 150, 125, 100,
] as const;

type HourlyPayload = {
  time: string[];
  [key: string]: Array<number | null> | string[];
};

type OpenMeteoResponse = {
  latitude: number;
  longitude: number;
  elevation: number;
  hourly: HourlyPayload;
};

const pressureVariables = PRESSURE_LEVELS.flatMap((pressure) => [
  `temperature_${pressure}hPa`,
  `dew_point_${pressure}hPa`,
  `wind_speed_${pressure}hPa`,
  `wind_direction_${pressure}hPa`,
  `geopotential_height_${pressure}hPa`,
]);

function value(hourly: HourlyPayload, key: string, index: number) {
  const candidate = hourly[key]?.[index];
  return typeof candidate === "number" ? candidate : Number.NaN;
}

function bulkShearKt(levels: SoundingLevel[], depthM: number) {
  const surface = levels.at(0);
  if (!surface) return Number.NaN;
  const top = levels.reduce((closest, level) =>
    Math.abs(level.heightM - surface.heightM - depthM) <
    Math.abs(closest.heightM - surface.heightM - depthM)
      ? level
      : closest,
  );
  const lowerWind = windComponents(surface.windDirectionDeg, surface.windSpeedKt);
  const upperWind = windComponents(top.windDirectionDeg, top.windSpeedKt);
  return Math.hypot(upperWind.uKt - lowerWind.uKt, upperWind.vKt - lowerWind.vKt);
}

export const openMeteoHrrrProvider: SoundingProvider = {
  id: "open-meteo-hrrr",
  async getProfile(input): Promise<SoundingProfile> {
    const params = new URLSearchParams({
      latitude: String(input.latitude),
      longitude: String(input.longitude),
      models: "ncep_hrrr_conus",
      hourly: [
        "temperature_2m", "dew_point_2m", "cape", "convective_inhibition",
        ...pressureVariables,
      ].join(","),
      wind_speed_unit: "kn",
      forecast_hours: "24",
      timezone: "GMT",
    });
    const response = await fetch(`https://api.open-meteo.com/v1/gfs?${params}`);
    if (!response.ok) throw new Error(`Forecast provider returned ${response.status}`);
    const payload = (await response.json()) as OpenMeteoResponse;
    const requested = new Date(input.validTimeIso).getTime();
    const index = payload.hourly.time.reduce(
      (closest, time, current) =>
        Math.abs(new Date(`${time}Z`).getTime() - requested) <
        Math.abs(new Date(`${payload.hourly.time[closest]}Z`).getTime() - requested)
          ? current
          : closest,
      0,
    );
    const levels = PRESSURE_LEVELS.map((pressure): SoundingLevel | null => {
      const level = {
        pressureHpa: pressure,
        heightM: value(payload.hourly, `geopotential_height_${pressure}hPa`, index),
        temperatureC: value(payload.hourly, `temperature_${pressure}hPa`, index),
        dewpointC: value(payload.hourly, `dew_point_${pressure}hPa`, index),
        windDirectionDeg: value(payload.hourly, `wind_direction_${pressure}hPa`, index),
        windSpeedKt: value(payload.hourly, `wind_speed_${pressure}hPa`, index),
      };
      return Object.values(level).every(Number.isFinite) ? level : null;
    }).filter((level): level is SoundingLevel => level !== null);
    if (levels.length < 5) throw new Error("Forecast profile is incomplete");
    const surface = nearestPressureLevel(levels, 1000) ?? levels[0];
    const surfaceT = value(payload.hourly, "temperature_2m", index);
    const surfaceTd = value(payload.hourly, "dew_point_2m", index);
    const validTimeIso = `${payload.hourly.time[index]}:00Z`;
    return {
      id: `hrrr-${payload.latitude}-${payload.longitude}-${validTimeIso}`,
      source: "forecast",
      provider: "Open-Meteo · NOAA HRRR",
      model: "HRRR",
      runTimeIso: new Date().toISOString(),
      validTimeIso,
      forecastHour: Math.max(0, Math.round((new Date(validTimeIso).getTime() - Date.now()) / 3_600_000)),
      location: {
        name: "Wichita, KS",
        latitude: payload.latitude,
        longitude: payload.longitude,
        elevationM: payload.elevation,
      },
      levels,
      indices: {
        sbcapeJkg: value(payload.hourly, "cape", index),
        mlcapeJkg: Number.NaN,
        cinJkg: value(payload.hourly, "convective_inhibition", index),
        lclM: Math.max(0, 125 * (surfaceT - surfaceTd)),
        shear01Kt: bulkShearKt(levels, 1000),
        shear06Kt: bulkShearKt(levels, 6000),
        srh01M2s2: Number.NaN,
        srh03M2s2: Number.NaN,
        fixedStp: Number.NaN,
      },
    };
  },
};
