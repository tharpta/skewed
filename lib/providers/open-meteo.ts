import {
  type SoundingLevel,
  type SoundingProfile,
  type SoundingProvider,
} from "../sounding";
import { deriveSoundingIndices } from "../meteorology";

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

export const openMeteoHrrrProvider: SoundingProvider = {
  id: "open-meteo-hrrr",
  async getProfile(input): Promise<SoundingProfile> {
    const params = new URLSearchParams({
      latitude: String(input.latitude),
      longitude: String(input.longitude),
      models: "ncep_hrrr_conus",
      hourly: [
        "temperature_2m", "dew_point_2m", "wind_speed_10m", "wind_direction_10m",
        "surface_pressure", "cape", "convective_inhibition",
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
    const pressureLevels = PRESSURE_LEVELS.map((pressure): SoundingLevel | null => {
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
    const surface: SoundingLevel = {
      pressureHpa: value(payload.hourly, "surface_pressure", index),
      heightM: payload.elevation,
      temperatureC: value(payload.hourly, "temperature_2m", index),
      dewpointC: value(payload.hourly, "dew_point_2m", index),
      windDirectionDeg: value(payload.hourly, "wind_direction_10m", index),
      windSpeedKt: value(payload.hourly, "wind_speed_10m", index),
    };
    const levels = [surface, ...pressureLevels.filter(level =>
      level.heightM > payload.elevation + 25 && level.pressureHpa < surface.pressureHpa,
    )];
    if (levels.length < 5 || !Object.values(surface).every(Number.isFinite)) throw new Error("Forecast profile is incomplete");
    const validTimeIso = `${payload.hourly.time[index]}:00Z`;
    const indices = deriveSoundingIndices(
      levels,
      value(payload.hourly, "cape", index),
      value(payload.hourly, "convective_inhibition", index),
    );
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
      indices,
    };
  },
};
