import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve("src/data/materialSources.json");

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withTeamcraftMonsterLocations.poc.json"
);

const REPORT_PATH = path.resolve(
  "src/data/debug/debug-teamcraft-monster-location-enrichment-report.json"
);

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const MONSTERS_URL = `${TEAMCRAFT_BASE}/monsters.json`;
const MAPS_URL = `${TEAMCRAFT_BASE}/maps.json`;

const MAX_POSITIONS_PER_MONSTER_SOURCE = 12;

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

function getLocalizedName(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value.en === "string") {
    return value.en.trim() || null;
  }

  if (value.name) {
    return getLocalizedName(value.name);
  }

  if (value.Name) {
    return getLocalizedName(value.Name);
  }

  if (value.placeName) {
    return getLocalizedName(value.placeName);
  }

  if (value.PlaceName) {
    return getLocalizedName(value.PlaceName);
  }

  if (value.region) {
    return getLocalizedName(value.region);
  }

  return null;
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

function buildMapNameIndex(mapsData) {
  const mapNames = new Map();

  for (const entry of asArrayWithIds(mapsData)) {
    const mapId = pickFirstNumber(entry.id, entry.map, entry.mapId, entry.ID);

    if (mapId === null) {
      continue;
    }

    const name =
      getLocalizedName(entry) ||
      getLocalizedName(entry.name) ||
      getLocalizedName(entry.placeName) ||
      getLocalizedName(entry.PlaceName);

    if (name) {
      mapNames.set(mapId, name);
    }
  }

  return mapNames;
}

function hasUsefulPosition(source) {
  if (!Array.isArray(source.positions) || source.positions.length === 0) {
    return false;
  }

  return source.positions.some((position) => {
    return (
      position &&
      (position.zone ||
        position.area ||
        position.region ||
        position.mapId ||
        position.zoneId ||
        position.coordinates)
    );
  });
}

function normalizePosition(rawPosition, mapNames) {
  const mapId = pickFirstNumber(
    rawPosition.map,
    rawPosition.mapId,
    rawPosition.map_id
  );

  const zoneId = pickFirstNumber(
    rawPosition.zoneid,
    rawPosition.zoneId,
    rawPosition.zone_id
  );

  const level = pickFirstNumber(rawPosition.level, rawPosition.lvl);
  const hp = pickFirstNumber(rawPosition.hp, rawPosition.HP);

  const x = pickFirstNumber(rawPosition.x, rawPosition.X);
  const y = pickFirstNumber(rawPosition.y, rawPosition.Y);
  const z = pickFirstNumber(rawPosition.z, rawPosition.Z);

  if (x === null || y === null) {
    return null;
  }

  const mapName = mapId !== null ? mapNames.get(mapId) : null;

  return {
    region: null,
    zone: mapName ?? null,
    area: mapName ?? null,
    mapId,
    zoneId,
    level: level && level > 0 ? level : null,
    hp: hp && hp > 0 ? hp : null,
    coordinates: {
      x,
      y,
      z: z ?? null,
    },
    fate: Boolean(rawPosition.fate),
  };
}

function positionSignature(position) {
  return [
    position.region ?? "",
    position.zone ?? "",
    position.area ?? "",
    position.mapId ?? "",
    position.zoneId ?? "",
    position.level ?? "",
    position.coordinates?.x ?? "",
    position.coordinates?.y ?? "",
    position.coordinates?.z ?? "",
    position.fate ? "fate" : "normal",
  ].join("|");
}

function dedupePositions(positions) {
  const seen = new Set();
  const output = [];

  for (const position of positions) {
    const signature = positionSignature(position);

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    output.push(position);
  }

  return output;
}

function sortPositions(positions) {
  return [...positions].sort((a, b) => {
    if (a.fate !== b.fate) {
      return a.fate ? 1 : -1;
    }

    const levelA = a.level ?? 9999;
    const levelB = b.level ?? 9999;

    if (levelA !== levelB) {
      return levelA - levelB;
    }

    const mapA = a.mapId ?? 9999;
    const mapB = b.mapId ?? 9999;

    if (mapA !== mapB) {
      return mapA - mapB;
    }

    const xA = a.coordinates?.x ?? 9999;
    const xB = b.coordinates?.x ?? 9999;

    if (xA !== xB) {
      return xA - xB;
    }

    return (a.coordinates?.y ?? 9999) - (b.coordinates?.y ?? 9999);
  });
}

function addPositionsToIndex(index, key, positions) {
  const normalizedKey = pickFirstNumber(key);

  if (normalizedKey === null) {
    return;
  }

  const existing = index.get(normalizedKey) ?? [];
  index.set(normalizedKey, dedupePositions([...existing, ...positions]));
}

function buildMonsterPositionIndex(monstersData, mapNames) {
  const index = new Map();

  for (const entry of asArrayWithIds(monstersData)) {
    const rawPositions = Array.isArray(entry.positions) ? entry.positions : [];

    const positions = rawPositions
      .map((position) => normalizePosition(position, mapNames))
      .filter(Boolean);

    if (positions.length === 0) {
      continue;
    }

    const possibleMonsterIds = [
      entry.id,
      entry.baseid,
      entry.baseId,
      entry.base_id,
      entry.monsterId,
      entry.monster_id,
      entry.bnpcName,
      entry.bnpcNameId,
      entry.bnpc_name,
      entry.bnpcBase,
      entry.bnpcBaseId,
      entry.bnpc_base,
    ];

    for (const possibleMonsterId of possibleMonsterIds) {
      addPositionsToIndex(index, possibleMonsterId, positions);
    }
  }

  for (const [monsterId, positions] of index.entries()) {
    index.set(
      monsterId,
      sortPositions(positions).slice(0, MAX_POSITIONS_PER_MONSTER_SOURCE)
    );
  }

  return index;
}

function countMonsterStats(materialSources) {
  const stats = {
    totalMaterialsWithMonsterDrops: 0,
    totalMonsterDropSources: 0,
    sourcesWithUsefulPositions: 0,
    sourcesWithoutUsefulPositions: 0,
  };

  for (const material of Object.values(materialSources)) {
    const monsterSources = (material.sources ?? []).filter(
      (source) => source.type === "monsterDrop"
    );

    if (monsterSources.length === 0) {
      continue;
    }

    stats.totalMaterialsWithMonsterDrops += 1;
    stats.totalMonsterDropSources += monsterSources.length;

    for (const source of monsterSources) {
      if (hasUsefulPosition(source)) {
        stats.sourcesWithUsefulPositions += 1;
      } else {
        stats.sourcesWithoutUsefulPositions += 1;
      }
    }
  }

  return stats;
}

function enrichMonsterDropLocations(materialSources, monsterPositionIndex) {
  const output = structuredClone(materialSources);
  const enriched = {};
  const stillMissing = {};

  for (const [materialKey, material] of Object.entries(output)) {
    let materialChanged = false;

    for (const [sourceIndex, source] of (material.sources ?? []).entries()) {
      if (source.type !== "monsterDrop") {
        continue;
      }

      if (hasUsefulPosition(source)) {
        continue;
      }

      const monsterId = pickFirstNumber(source.monsterId);

      if (monsterId === null) {
        continue;
      }

      const positions = monsterPositionIndex.get(monsterId) ?? [];

      if (positions.length === 0) {
        if (!stillMissing[materialKey]) {
          stillMissing[materialKey] = {
            name: material.name,
            itemId: material.itemId ?? null,
            missingSources: [],
          };
        }

        stillMissing[materialKey].missingSources.push({
          monsterId: source.monsterId ?? null,
          monsterName: source.monsterName ?? null,
        });

        continue;
      }

      output[materialKey].sources[sourceIndex] = {
        ...source,
        positions,
        debug: {
          ...(source.debug ?? {}),
          teamcraftMonsterLocationEnriched: true,
          teamcraftMonsterLocationPositionCount: positions.length,
        },
      };

      materialChanged = true;

      if (!enriched[materialKey]) {
        enriched[materialKey] = {
          name: material.name,
          itemId: material.itemId ?? null,
          enrichedSources: [],
        };
      }

      enriched[materialKey].enrichedSources.push({
        monsterId: source.monsterId ?? null,
        monsterName: source.monsterName ?? null,
        positionCount: positions.length,
        samplePositions: positions.slice(0, 3),
      });
    }

    if (materialChanged) {
      output[materialKey] = {
        ...output[materialKey],
        debug: {
          ...(output[materialKey].debug ?? {}),
          teamcraftMonsterLocationEnrichmentApplied: true,
        },
      };
    }
  }

  return {
    materialSources: output,
    enriched,
    stillMissing,
  };
}

async function main() {
  console.log("Reading promoted material sources...");
  const materialSources = await readJson(INPUT_PATH);

  console.log("Fetching Teamcraft monsters.json...");
  const monstersData = await fetchJson(MONSTERS_URL);

  console.log("Fetching Teamcraft maps.json...");
  let mapsData = {};
  try {
    mapsData = await fetchJson(MAPS_URL);
  } catch (error) {
    console.warn("Could not fetch maps.json. Continuing with map IDs only.");
    console.warn(error.message);
  }

  const mapNames = buildMapNameIndex(mapsData);
  const monsterPositionIndex = buildMonsterPositionIndex(monstersData, mapNames);

  const beforeStats = countMonsterStats(materialSources);

  const { materialSources: enrichedSources, enriched, stillMissing } =
    enrichMonsterDropLocations(materialSources, monsterPositionIndex);

  const afterStats = countMonsterStats(enrichedSources);

  const report = {
    metadata: {
      inputFile: "src/data/materialSources.json",
      outputFile: "src/data/materialSources.withTeamcraftMonsterLocations.poc.json",
      reportFile:
        "src/data/debug/debug-teamcraft-monster-location-enrichment-report.json",
      generatedAt: new Date().toISOString(),
      monstersUrl: MONSTERS_URL,
      mapsUrl: MAPS_URL,
      monsterPositionIndexCount: monsterPositionIndex.size,
      mapNameIndexCount: mapNames.size,
    note:
      "Enriches monster-drop sources by matching source.monsterId to Teamcraft monsters.json entry id, baseid, and other plausible monster identifier fields.",
    },
    beforeStats,
    afterStats,
    enrichmentSummary: {
      materialsEnriched: Object.keys(enriched).length,
      sourcesEnriched: Object.values(enriched).reduce(
        (sum, material) => sum + material.enrichedSources.length,
        0
      ),
      materialsStillMissing: Object.keys(stillMissing).length,
      sourcesStillMissing: Object.values(stillMissing).reduce(
        (sum, material) => sum + material.missingSources.length,
        0
      ),
    },
    enriched,
    stillMissing,
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});