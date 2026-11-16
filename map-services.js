"use strict";

const coordinate = point => Number.isFinite(point?.lat) && Number.isFinite(point.lon) &&
  Math.abs(point.lat) <= 85.05112878 && Math.abs(point.lon) <= 180;

function createMapServices({
  fetcher = fetch,
  geocoder = process.env.SAFESTRIDE_GEOCODER ?? "https://photon.komoot.io/api/",
  router = process.env.SAFESTRIDE_ROUTER ?? "https://routing.openstreetmap.de/routed-foot/route/v1/driving/"
} = {}) {
  const headers = { "User-Agent": "SafeStrideCollegeDemo/1.0", Accept: "application/json" };
  const nextRequest = new Map();

  async function request(url, service) {
    const time = Date.now();
    if (time < (nextRequest.get(service) ?? 0)) {
      throw new MapError(429, "Please wait a second before trying again.");
    }
    nextRequest.set(service, time + 1100);
    const error = new MapError(503, service === "search" ?
      "Place search is temporarily unavailable. You can still choose a point on the map." :
      "Walking directions are temporarily unavailable. Try again in a moment.");
    try {
      const response = await fetcher(url, { headers, signal: AbortSignal.timeout(9000) });
      const data = await response.json();
      if (response.ok || (service === "route" && ["NoSegment", "NoRoute"].includes(data?.code))) return data;
    } catch {
      throw error;
    }
    throw error;
  }

  async function search({ query, near }) {
    const term = typeof query === "string" ? query.trim() : "";
    if (term.length < 2 || term.length > 160) throw new MapError(400, "Enter between 2 and 160 characters.");
    const url = new URL(geocoder);
    url.searchParams.set("q", term);
    url.searchParams.set("limit", "6");
    if (coordinate(near)) {
      url.searchParams.set("lat", near.lat.toFixed(4));
      url.searchParams.set("lon", near.lon.toFixed(4));
    }
    const data = await request(url, "search");
    const features = Array.isArray(data?.features) ? data.features : [];
    return features.flatMap(feature => {
      const properties = feature.properties ?? {};
      const [lon, lat] = feature.geometry?.coordinates ?? [];
      if (!coordinate({ lat, lon })) return [];
      const street = [properties.housenumber, properties.street].filter(Boolean).join(" ");
      const parts = [...new Set([properties.name, street, properties.district, properties.city, properties.state, properties.country].filter(Boolean))];
      return [{
        lat, lon,
        label: String(parts[0] ?? properties.type ?? "Map location"),
        detail: parts.slice(1).join(", ")
      }];
    }).slice(0, 6);
  }

  async function walking({ from, to }) {
    if (!coordinate(from) || !coordinate(to)) throw new MapError(400, "Choose a valid start and destination.");
    const coords = [from, to].map(point => `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`);
    if (coords[0] === coords[1]) throw new MapError(400, "Choose two different points.");
    const url = new URL(coords.join(";"), router.endsWith("/") ? router : router + "/");
    url.search = new URLSearchParams({
      alternatives: "true", overview: "full", geometries: "geojson", steps: "false",
      radiuses: "150;150", generate_hints: "false"
    });
    const data = await request(url, "route");
    if (["NoRoute", "NoSegment"].includes(data?.code)) {
      throw new MapError(422, "No walking route was found. Try pins closer to a mapped path.");
    }
    const choices = Array.isArray(data?.routes) ? data.routes : [];
    const routes = choices.flatMap(route => {
      const shape = route.geometry?.coordinates;
      if (route.geometry?.type !== "LineString" || !Array.isArray(shape) || shape.length < 2 ||
          !shape.every(pair => Array.isArray(pair) && coordinate({ lon: pair[0], lat: pair[1] })) ||
          !Number.isFinite(route.duration) || route.duration < 0 ||
          !Number.isFinite(route.distance) || route.distance < 0) return [];
      return [{
        shape: shape.map(([lon, lat]) => [lat, lon]),
        minutes: Math.max(1, Math.round(route.duration / 60)),
        metres: Math.round(route.distance),
        seconds: route.duration
      }];
    }).sort((a, b) => a.seconds - b.seconds).slice(0, 3);
    if (!routes.length) throw new MapError(503, "Walking directions are temporarily unavailable.");
    return routes.map(({ seconds, ...route }) => route);
  }

  return { search, walking };
}

class MapError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { createMapServices, coordinate, MapError };
