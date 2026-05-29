import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.resolve(
  "src/data/debug/debug-teamcraft-map-schema.json"
);

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const MAPS_URL = `${TEAMCRAFT_BASE}/maps.json`;
const PLACES_URL = `${TEAMCRAFT_BASE}/places.json`;

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function asArrayWithIds(value) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      id: String(index),
      ...(entry && typeof entry === "object" ? entry : { value: entry }),
    }));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, entry]) => ({
      id,
      ...(entry && typeof entry === "object" ? entry : { value: entry }),
    }));
  }

  return [];
}

function collectKeys(entries, limit = 100) {
  const keys = new Set();

  for (const entry of entries.slice(0, limit)) {
    for (const key of Object.keys(entry)) {
      keys.add(key);
    }
  }

  return [...keys].sort();
}

function findEntriesWithAnyField(entries, fieldNames) {
  return entries
    .filter((entry) =>
      fieldNames.some(
        (fieldName) =>
          entry[fieldName] !== undefined &&
          entry[fieldName] !== null &&
          entry[fieldName] !== ""
      )
    )
    .slice(0, 25);
}

function findEntriesMentioningKnownMapIds(entries) {
  const knownMapIds = new Set([
    20, 21, 22, 211, 212, 213, 214, 215, 216, 367, 695, 696, 699, 857, 859, 861,
    862,
  ]);

  return entries
    .filter((entry) => knownMapIds.has(Number(entry.id)))
    .slice(0, 50);
}

function summarizeValueTypes(entries) {
  const summary = {};

  for (const entry of entries.slice(0, 200)) {
    for (const [key, value] of Object.entries(entry)) {
      const type = Array.isArray(value) ? "array" : typeof value;

      if (!summary[key]) {
        summary[key] = {};
      }

      summary[key][type] = (summary[key][type] ?? 0) + 1;
    }
  }

  return summary;
}

async function main() {
  console.log("Fetching Teamcraft maps.json...");
  const mapsData = await fetchJson(MAPS_URL);

  console.log("Fetching Teamcraft places.json...");
  const placesData = await fetchJson(PLACES_URL);

  const mapEntries = asArrayWithIds(mapsData);
  const placeEntries = asArrayWithIds(placesData);

  const report = {
    metadata: {
      mapsUrl: MAPS_URL,
      placesUrl: PLACES_URL,
      outputFile: "src/data/debug/debug-teamcraft-map-schema.json",
      generatedAt: new Date().toISOString(),
      mapEntryCount: mapEntries.length,
      placeEntryCount: placeEntries.length,
    },

    mapKeysFromFirst100: collectKeys(mapEntries, 100),
    placeKeysFromFirst100: collectKeys(placeEntries, 100),

    mapValueTypesFromFirst200: summarizeValueTypes(mapEntries),
    placeValueTypesFromFirst200: summarizeValueTypes(placeEntries),

    firstMapEntries: mapEntries.slice(0, 20),
    firstPlaceEntries: placeEntries.slice(0, 20),

    knownMapIdEntries: findEntriesMentioningKnownMapIds(mapEntries),

    mapEntriesWithPlaceLikeFields: findEntriesWithAnyField(mapEntries, [
      "placeName",
      "placeNameId",
      "PlaceName",
      "PlaceNameTargetID",
      "place_name",
      "placename",
      "place",
      "placeId",
      "name",
      "Name",
      "region",
      "Region",
      "territory",
      "territoryId",
      "territoryType",
      "TerritoryType",
      "TerritoryTypeTargetID",
      "zoneid",
      "zoneId",
      "zone_id",
    ]),
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("");
  console.log(`Map entries: ${mapEntries.length}`);
  console.log(`Place entries: ${placeEntries.length}`);
  console.log("");
  console.log("Map keys from first 100:");
  console.log(report.mapKeysFromFirst100);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});