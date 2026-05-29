import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve("src/data/materialSources.json");

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withTeamcraftMapNames.poc.json"
);

const REPORT_PATH = path.resolve(
  "src/data/debug/debug-teamcraft-map-name-enrichment-report.json"
);

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const MAPS_URL = `${TEAMCRAFT_BASE}/maps.json`;
const PLACES_URL = `${TEAMCRAFT_BASE}/places.json`;

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

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

function pickFirstNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function getLocalizedName(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value.en === "string" && value.en.trim()) {
    return value.en.trim();
  }

  if (typeof value.name === "string" && value.name.trim()) {
    return value.name.trim();
  }

  if (value.name) {
    return getLocalizedName(value.name);
  }

  if (typeof value.Name === "string" && value.Name.trim()) {
    return value.Name.trim();
  }

  if (value.Name) {
    return getLocalizedName(value.Name);
  }

  if (typeof value.value === "string" && value.value.trim()) {
    return value.value.trim();
  }

  if (value.value) {
    return getLocalizedName(value.value);
  }

  return null;
}

function buildPlaceNameIndex(placesData) {
  const placeNames = new Map();

  for (const entry of asArrayWithIds(placesData)) {
    const id = pickFirstNumber(entry.id, entry.ID, entry.rowId, entry.row_id);

    if (id === null) {
      continue;
    }

    const name = getLocalizedName(entry);

    if (name) {
      placeNames.set(id, name);
    }
  }

  return placeNames;
}

function getMapPlaceNameId(mapEntry) {
  return pickFirstNumber(
    mapEntry.placename_id,
    mapEntry.placenameId,
    mapEntry.placeName,
    mapEntry.placeNameId,
    mapEntry.place_name,
    mapEntry.placename,
    mapEntry.PlaceName,
    mapEntry.PlaceNameTargetID,
    mapEntry.place,
    mapEntry.placeId
  );
}

function getMapTerritoryId(mapEntry) {
  return pickFirstNumber(
    mapEntry.territory_id,
    mapEntry.territory,
    mapEntry.territoryId,
    mapEntry.territoryType,
    mapEntry.territoryTypeId,
    mapEntry.TerritoryType,
    mapEntry.TerritoryTypeTargetID,
    mapEntry.zoneid,
    mapEntry.zoneId,
    mapEntry.zone_id
  );
}

function buildMapIndexes(mapsData, placeNameIndex) {
  const byMapId = new Map();
  const byTerritoryId = new Map();
  const byPlaceNameId = new Map();
  const unresolvedMaps = [];

  for (const entry of asArrayWithIds(mapsData)) {
    const mapId = pickFirstNumber(entry.id, entry.ID, entry.map, entry.mapId);

    if (mapId === null) {
      continue;
    }

    const placeNameId = getMapPlaceNameId(entry);
    const territoryId = getMapTerritoryId(entry);
    const regionId = pickFirstNumber(entry.region_id, entry.regionId, entry.region);
    const zoneId = pickFirstNumber(entry.zone_id, entry.zoneId, entry.zoneid);

    const name =
      getLocalizedName(entry) ||
      getLocalizedName(entry.name) ||
      (placeNameId !== null ? placeNameIndex.get(placeNameId) : null);

    const regionName =
      regionId !== null ? placeNameIndex.get(regionId) ?? null : null;

    const subPlaceName =
      entry.placename_sub_id && Number(entry.placename_sub_id) > 0
        ? placeNameIndex.get(Number(entry.placename_sub_id)) ?? null
        : null;

    if (!name) {
      unresolvedMaps.push({
        mapId,
        placeNameId,
        territoryId,
        regionId,
        zoneId,
        sampleKeys: Object.keys(entry).slice(0, 25),
      });
      continue;
    }

    const record = {
      mapId,
      territoryId,
      placeNameId,
      regionId,
      zoneId,
      name,
      regionName,
      subPlaceName,
    };

    byMapId.set(mapId, record);

    if (territoryId !== null && !byTerritoryId.has(territoryId)) {
      byTerritoryId.set(territoryId, record);
    }

    if (placeNameId !== null && !byPlaceNameId.has(placeNameId)) {
      byPlaceNameId.set(placeNameId, record);
    }
  }

  return {
    byMapId,
    byTerritoryId,
    byPlaceNameId,
    unresolvedMaps,
  };
}

function getReadableLocationForIds(mapId, zoneId, indexes) {
  const numericMapId = pickFirstNumber(mapId);
  const numericZoneId = pickFirstNumber(zoneId);

  if (numericMapId !== null) {
    const mapRecord = indexes.byMapId.get(numericMapId);

    if (mapRecord?.name) {
      return {
        name: mapRecord.name,
        regionName: mapRecord.regionName ?? null,
        subPlaceName: mapRecord.subPlaceName ?? null,
        matchedBy: "mapId",
        mapRecord,
      };
    }
  }

  if (numericZoneId !== null) {
    const territoryRecord = indexes.byTerritoryId.get(numericZoneId);

    if (territoryRecord?.name) {
      return {
        name: territoryRecord.name,
        regionName: territoryRecord.regionName ?? null,
        subPlaceName: territoryRecord.subPlaceName ?? null,
        matchedBy: "zoneId",
        mapRecord: territoryRecord,
      };
    }

    const placeRecord = indexes.byPlaceNameId.get(numericZoneId);

    if (placeRecord?.name) {
      return {
        name: placeRecord.name,
        regionName: placeRecord.regionName ?? null,
        subPlaceName: placeRecord.subPlaceName ?? null,
        matchedBy: "placeNameId",
        mapRecord: placeRecord,
      };
    }
  }

  return null;
}

function sourceHasReadableLocation(source) {
  return Boolean(source?.zone || source?.area || source?.region);
}

function positionHasReadableLocation(position) {
  return Boolean(position?.zone || position?.area || position?.region);
}

function enrichLocationObject(locationObject, indexes) {
  if (!locationObject || typeof locationObject !== "object") {
    return {
      value: locationObject,
      changed: false,
      matchedBy: null,
    };
  }

  if (positionHasReadableLocation(locationObject)) {
    return {
      value: locationObject,
      changed: false,
      matchedBy: null,
    };
  }

  const resolved = getReadableLocationForIds(
    locationObject.mapId,
    locationObject.zoneId,
    indexes
  );

  if (!resolved) {
    return {
      value: locationObject,
      changed: false,
      matchedBy: null,
    };
  }

  return {
    value: {
    ...locationObject,
    region: locationObject.region ?? resolved.regionName ?? null,
    zone: resolved.name,
    area: locationObject.area ?? resolved.subPlaceName ?? resolved.name,
    debug: {
        ...(locationObject.debug ?? {}),
        teamcraftMapNameEnriched: true,
        teamcraftMapNameMatchedBy: resolved.matchedBy,
    },
    },
    changed: true,
    matchedBy: resolved.matchedBy,
  };
}

function countLocationStats(materialSources) {
  const stats = {
    totalSources: 0,
    sourcesWithMapOrZoneId: 0,
    sourcesWithReadableLocation: 0,
    sourcesMissingReadableLocationWithMapOrZoneId: 0,

    totalMonsterDropPositions: 0,
    monsterDropPositionsWithMapOrZoneId: 0,
    monsterDropPositionsWithReadableLocation: 0,
    monsterDropPositionsMissingReadableLocationWithMapOrZoneId: 0,
  };

  for (const material of Object.values(materialSources)) {
    for (const source of material.sources ?? []) {
      stats.totalSources += 1;

      const sourceHasId = source.mapId || source.zoneId;

      if (sourceHasId) {
        stats.sourcesWithMapOrZoneId += 1;
      }

      if (sourceHasReadableLocation(source)) {
        stats.sourcesWithReadableLocation += 1;
      }

      if (sourceHasId && !sourceHasReadableLocation(source)) {
        stats.sourcesMissingReadableLocationWithMapOrZoneId += 1;
      }

      if (source.type === "monsterDrop" && Array.isArray(source.positions)) {
        for (const position of source.positions) {
          stats.totalMonsterDropPositions += 1;

          const positionHasId = position.mapId || position.zoneId;

          if (positionHasId) {
            stats.monsterDropPositionsWithMapOrZoneId += 1;
          }

          if (positionHasReadableLocation(position)) {
            stats.monsterDropPositionsWithReadableLocation += 1;
          }

          if (positionHasId && !positionHasReadableLocation(position)) {
            stats.monsterDropPositionsMissingReadableLocationWithMapOrZoneId += 1;
          }
        }
      }
    }
  }

  return stats;
}

function enrichMapNames(materialSources, indexes) {
  const output = structuredClone(materialSources);

  const sourceEnriched = {};
  const positionEnriched = {};
  const stillMissing = {};
  const matchCounts = {};

  for (const [materialKey, material] of Object.entries(output)) {
    let materialChanged = false;

    for (const [sourceIndex, source] of (material.sources ?? []).entries()) {
      const sourceHasIds = source.mapId || source.zoneId;

      if (sourceHasIds && !sourceHasReadableLocation(source)) {
        const enrichedSource = enrichLocationObject(source, indexes);

        if (enrichedSource.changed) {
          output[materialKey].sources[sourceIndex] = {
            ...enrichedSource.value,
            debug: {
              ...(enrichedSource.value.debug ?? {}),
              teamcraftMapNameEnriched: true,
              teamcraftMapNameMatchedBy: enrichedSource.matchedBy,
            },
          };

          materialChanged = true;
          matchCounts[`source_${enrichedSource.matchedBy}`] =
            (matchCounts[`source_${enrichedSource.matchedBy}`] ?? 0) + 1;

          if (!sourceEnriched[materialKey]) {
            sourceEnriched[materialKey] = {
              name: material.name,
              itemId: material.itemId ?? null,
              sources: [],
            };
          }

          sourceEnriched[materialKey].sources.push({
            sourceIndex,
            type: source.type,
            mapId: source.mapId ?? null,
            zoneId: source.zoneId ?? null,
            resolvedName: enrichedSource.value.zone ?? null,
            matchedBy: enrichedSource.matchedBy,
          });
        }
      }

      const activeSource = output[materialKey].sources[sourceIndex];

      if (activeSource.type === "monsterDrop" && Array.isArray(activeSource.positions)) {
        const nextPositions = [];
        let positionsChanged = false;

        for (const [positionIndex, position] of activeSource.positions.entries()) {
          const positionHasIds = position.mapId || position.zoneId;

          if (!positionHasIds || positionHasReadableLocation(position)) {
            nextPositions.push(position);
            continue;
          }

          const enrichedPosition = enrichLocationObject(position, indexes);

          if (!enrichedPosition.changed) {
            nextPositions.push(position);

            if (!stillMissing[materialKey]) {
              stillMissing[materialKey] = {
                name: material.name,
                itemId: material.itemId ?? null,
                missing: [],
              };
            }

            stillMissing[materialKey].missing.push({
              type: activeSource.type,
              monsterName: activeSource.monsterName ?? null,
              monsterId: activeSource.monsterId ?? null,
              sourceIndex,
              positionIndex,
              mapId: position.mapId ?? null,
              zoneId: position.zoneId ?? null,
            });

            continue;
          }

          nextPositions.push(enrichedPosition.value);
          positionsChanged = true;
          materialChanged = true;

          matchCounts[`position_${enrichedPosition.matchedBy}`] =
            (matchCounts[`position_${enrichedPosition.matchedBy}`] ?? 0) + 1;

          if (!positionEnriched[materialKey]) {
            positionEnriched[materialKey] = {
              name: material.name,
              itemId: material.itemId ?? null,
              positions: [],
            };
          }

          positionEnriched[materialKey].positions.push({
            sourceIndex,
            positionIndex,
            monsterName: activeSource.monsterName ?? null,
            monsterId: activeSource.monsterId ?? null,
            mapId: position.mapId ?? null,
            zoneId: position.zoneId ?? null,
            resolvedName: enrichedPosition.value.zone ?? null,
            matchedBy: enrichedPosition.matchedBy,
          });
        }

        if (positionsChanged) {
          output[materialKey].sources[sourceIndex] = {
            ...activeSource,
            positions: nextPositions,
            debug: {
              ...(activeSource.debug ?? {}),
              teamcraftMapNameEnrichmentApplied: true,
            },
          };
        }
      }
    }

    if (materialChanged) {
      output[materialKey] = {
        ...output[materialKey],
        debug: {
          ...(output[materialKey].debug ?? {}),
          teamcraftMapNameEnrichmentApplied: true,
        },
      };
    }
  }

  return {
    materialSources: output,
    sourceEnriched,
    positionEnriched,
    stillMissing,
    matchCounts,
  };
}

async function main() {
  console.log("Reading material sources...");
  const materialSources = await readJson(INPUT_PATH);

  console.log("Fetching Teamcraft places.json...");
  const placesData = await fetchJson(PLACES_URL);

  console.log("Fetching Teamcraft maps.json...");
  const mapsData = await fetchJson(MAPS_URL);

  const placeNameIndex = buildPlaceNameIndex(placesData);
  const mapIndexes = buildMapIndexes(mapsData, placeNameIndex);

  const beforeStats = countLocationStats(materialSources);

  const {
    materialSources: enrichedSources,
    sourceEnriched,
    positionEnriched,
    stillMissing,
    matchCounts,
  } = enrichMapNames(materialSources, mapIndexes);

  const afterStats = countLocationStats(enrichedSources);

  const report = {
    metadata: {
      inputFile: "src/data/materialSources.json",
      outputFile: "src/data/materialSources.withTeamcraftMapNames.poc.json",
      reportFile: "src/data/debug/debug-teamcraft-map-name-enrichment-report.json",
      generatedAt: new Date().toISOString(),
      mapsUrl: MAPS_URL,
      placesUrl: PLACES_URL,
      placeNameIndexCount: placeNameIndex.size,
      mapNameIndexCount: mapIndexes.byMapId.size,
      territoryNameIndexCount: mapIndexes.byTerritoryId.size,
      placeNameMapIndexCount: mapIndexes.byPlaceNameId.size,
      unresolvedMapCount: mapIndexes.unresolvedMaps.length,
      note:
        "Adds readable zone/area names to sources and monster-drop positions using Teamcraft maps.json resolved through places.json.",
    },
    beforeStats,
    afterStats,
    matchCounts,
    enrichmentSummary: {
      materialsWithSourcesEnriched: Object.keys(sourceEnriched).length,
      sourcesEnriched: Object.values(sourceEnriched).reduce(
        (sum, material) => sum + material.sources.length,
        0
      ),
      materialsWithMonsterPositionsEnriched: Object.keys(positionEnriched).length,
      monsterPositionsEnriched: Object.values(positionEnriched).reduce(
        (sum, material) => sum + material.positions.length,
        0
      ),
      materialsStillMissingReadablePositions: Object.keys(stillMissing).length,
      missingReadablePositionCount: Object.values(stillMissing).reduce(
        (sum, material) => sum + material.missing.length,
        0
      ),
    },
    sourceEnriched,
    positionEnriched,
    stillMissing,
    unresolvedMaps: mapIndexes.unresolvedMaps.slice(0, 100),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(enrichedSources, null, 2), "utf8");
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${REPORT_PATH}`);

  console.log("");
  console.log("Before:");
  console.log(beforeStats);

  console.log("");
  console.log("After:");
  console.log(afterStats);

  console.log("");
  console.log("Enrichment summary:");
  console.log(report.enrichmentSummary);

  console.log("");
  console.log("Match counts:");
  console.log(matchCounts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});