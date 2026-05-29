import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  dropSources: `${TEAMCRAFT_BASE}/drop-sources.json`,
  lootSources: `${TEAMCRAFT_BASE}/loot-sources.json`,
  mobs: `${TEAMCRAFT_BASE}/mobs.json`,
  monsters: `${TEAMCRAFT_BASE}/monsters.json`,
  maps: `${TEAMCRAFT_BASE}/maps.json`,
  places: `${TEAMCRAFT_BASE}/places.json`,
};

const SAMPLE_MATERIALS = [
  "Animal Skin",
  "Aldgoat Skin",
  "Aldgoat Horn",
  "Diremite Web",
  "Hippogryph Sinew",
  "Raptor Skin",
  "Toad Skin",
  "Fleece",
  "Snurble Tufts",
  "Bomb Ash",
  "Beastkin Blood",
];

const USE_SAMPLE_MATERIALS = true;
const MAX_MONSTERS_PER_MATERIAL = 25;
const MAX_POSITIONS_PER_MONSTER = 8;

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, data]) => {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return { id, ...data };
      }

      return { id, value: data };
    });
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

  if (typeof value.en === "object") {
    return getLocalizedName(value.en);
  }

  if (typeof value.name === "string") {
    return value.name.trim() || null;
  }

  if (value.name) {
    return getLocalizedName(value.name);
  }

  if (typeof value.Name === "string") {
    return value.Name.trim() || null;
  }

  if (value.Name) {
    return getLocalizedName(value.Name);
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

async function fetchJson(label, url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not fetch ${label}: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

async function readRecipes() {
  const recipeDirectory = path.resolve("src/data/recipes");
  const files = await fs.readdir(recipeDirectory);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  if (jsonFiles.length === 0) {
    throw new Error("No recipe JSON files found in src/data/recipes.");
  }

  const mergedRecipes = {};

  for (const file of jsonFiles) {
    const filePath = path.join(recipeDirectory, file);
    const text = await fs.readFile(filePath, "utf8");
    const recipesForClass = JSON.parse(text);

    Object.assign(mergedRecipes, recipesForClass);
  }

  return mergedRecipes;
}

function getRawMaterialsFromRecipes(recipes) {
  const names = new Set();

  for (const recipe of Object.values(recipes)) {
    for (const ingredient of recipe.ingredients ?? []) {
      if (ingredient.type === "material") {
        names.add(ingredient.name);
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function buildItemNameIndex(itemsData) {
  const index = new Map();

  for (const item of asArray(itemsData)) {
    const id = Number(item.id ?? item.row_id ?? item.rowId ?? item.ID);
    const name = getLocalizedName(item);

    if (Number.isFinite(id) && name) {
      index.set(name.toLowerCase(), {
        id,
        name,
        raw: item,
      });
    }
  }

  return index;
}

function buildMobIndex(mobsData) {
  const index = new Map();

  for (const mob of asArray(mobsData)) {
    const id = Number(mob.id ?? mob.row_id ?? mob.rowId ?? mob.ID);
    const name = getLocalizedName(mob);

    if (Number.isFinite(id)) {
      index.set(id, {
        id,
        name,
        raw: mob,
      });
    }
  }

  return index;
}

function buildMonsterPositionIndex(monstersData) {
  const index = new Map();

  for (const monster of asArray(monstersData)) {
    const monsterId = Number(monster.id ?? monster.row_id ?? monster.rowId);
    const baseId = Number(monster.baseid ?? monster.baseId ?? monster.base_id);

    const usableBaseId = Number.isFinite(baseId) ? baseId : monsterId;

    if (!Number.isFinite(usableBaseId)) {
      continue;
    }

    const positions = Array.isArray(monster.positions) ? monster.positions : [];

    if (!index.has(usableBaseId)) {
      index.set(usableBaseId, []);
    }

    for (const position of positions) {
      index.get(usableBaseId).push(position);
    }
  }

  return index;
}

function getEnglishPlaceName(placeId, placesData) {
  const id = Number(placeId);

  if (!Number.isFinite(id) || id === 0) {
    return null;
  }

  const entry = placesData?.[String(id)] ?? placesData?.[id];

  if (!entry) {
    return null;
  }

  return getLocalizedName(entry);
}

function getMapInfo(mapId, mapsData, placesData) {
  const id = Number(mapId);

  if (!Number.isFinite(id) || id === 0) {
    return {
      mapName: null,
      regionName: null,
      subPlaceName: null,
    };
  }

  const mapEntry = mapsData?.[String(id)] ?? mapsData?.[id];

  if (!mapEntry) {
    return {
      mapName: null,
      regionName: null,
      subPlaceName: null,
    };
  }

  return {
    mapName: getEnglishPlaceName(mapEntry.placename_id, placesData),
    regionName: getEnglishPlaceName(mapEntry.region_id, placesData),
    subPlaceName: getEnglishPlaceName(mapEntry.placename_sub_id, placesData),
  };
}

function normalizeMonsterPosition(position, mapsData, placesData) {
  const mapId = pickFirstNumber(position.map, position.mapId, position.map_id);
  const zoneId = pickFirstNumber(
    position.zoneid,
    position.zoneId,
    position.zone_id,
    position.territoryType,
    position.territoryTypeId
  );

  const x = pickFirstNumber(position.x, position.X, position.mapX, position.map_x);
  const y = pickFirstNumber(position.y, position.Y, position.mapY, position.map_y);
  const z = pickFirstNumber(position.z, position.Z);

  const mapInfo = getMapInfo(mapId, mapsData, placesData);

  return {
    region: mapInfo.regionName,
    zone: mapInfo.mapName,
    area: getEnglishPlaceName(zoneId, placesData) ?? mapInfo.subPlaceName,
    mapId,
    zoneId,
    level: pickFirstNumber(position.level, position.lvl),
    coordinates:
      x !== null || y !== null || z !== null
        ? {
            x,
            y,
            z,
          }
        : null,
    fate: Boolean(Number(position.fate)),
  };
}

function collectNumberIds(value, output = new Set()) {
  if (typeof value === "number" || typeof value === "string") {
    const number = Number(value);

    if (Number.isFinite(number)) {
      output.add(number);
    }

    return output;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNumberIds(entry, output);
    }

    return output;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      const keyNumber = Number(key);

      if (Number.isFinite(keyNumber)) {
        output.add(keyNumber);
      }

      collectNumberIds(entry, output);
    }
  }

  return output;
}

function getDropSourceMobIds(dropSourcesData, itemId) {
  const directEntry =
    dropSourcesData?.[String(itemId)] ?? dropSourcesData?.[itemId] ?? null;

  if (!directEntry) {
    return [];
  }

  return [...collectNumberIds(directEntry)].sort((a, b) => a - b);
}

function getLootSourceMatches(lootSourcesData, itemId) {
  const directEntry =
    lootSourcesData?.[String(itemId)] ?? lootSourcesData?.[itemId] ?? null;

  if (!directEntry) {
    return null;
  }

  return directEntry;
}

function resolveMonsterDropSources({
  materialName,
  item,
  dropSourcesData,
  lootSourcesData,
  mobIndex,
  monsterPositionIndex,
  mapsData,
  placesData,
}) {
  if (!item) {
    return {
      name: materialName,
      itemId: null,
      status: "item_name_not_found_in_teamcraft_items",
      sources: [],
      debug: {
        dropMobIds: [],
        lootSourceEntry: null,
      },
    };
  }

  const dropMobIds = getDropSourceMobIds(dropSourcesData, item.id);
  const lootSourceEntry = getLootSourceMatches(lootSourcesData, item.id);

  if (dropMobIds.length === 0 && !lootSourceEntry) {
    return {
      name: materialName,
      itemId: item.id,
      status: "no_monster_drop_source_found",
      sources: [],
      debug: {
        dropMobIds: [],
        lootSourceEntry: null,
      },
    };
  }

  const sources = dropMobIds.slice(0, MAX_MONSTERS_PER_MATERIAL).map((mobId) => {
    const mob = mobIndex.get(mobId) ?? null;
    const rawPositions = monsterPositionIndex.get(mobId) ?? [];

    const positions = rawPositions
      .slice(0, MAX_POSITIONS_PER_MONSTER)
      .map((position) => normalizeMonsterPosition(position, mapsData, placesData));

    return {
      type: "monsterDrop",
      monsterId: mobId,
      monsterName: mob?.name ?? null,
      positions,
      debug: {
        positionCount: rawPositions.length,
        rawMob: mob?.raw ?? null,
      },
    };
  });

  return {
    name: materialName,
    itemId: item.id,
    status: sources.length > 0 ? "ok" : "only_loot_source_found",
    sources,
    debug: {
      dropMobIds,
      dropMobIdCount: dropMobIds.length,
      lootSourceEntry,
      truncatedMonsterList: dropMobIds.length > MAX_MONSTERS_PER_MATERIAL,
    },
  };
}

async function main() {
  console.log("Reading local recipe JSON files...");
  const recipes = await readRecipes();
  const rawMaterials = getRawMaterialsFromRecipes(recipes);

  const targetMaterials = USE_SAMPLE_MATERIALS
    ? SAMPLE_MATERIALS.filter((name) => rawMaterials.includes(name))
    : rawMaterials;

  console.log(`Found ${rawMaterials.length} unique raw materials in recipes.`);
  console.log(`Resolving ${targetMaterials.length} target monster/drop materials.`);
  console.log("");

  console.log("Fetching Teamcraft data files...");
  const [
    itemsData,
    dropSourcesData,
    lootSourcesData,
    mobsData,
    monstersData,
    mapsData,
    placesData,
  ] = await Promise.all([
    fetchJson("items.json", DATA_URLS.items),
    fetchJson("drop-sources.json", DATA_URLS.dropSources),
    fetchJson("loot-sources.json", DATA_URLS.lootSources),
    fetchJson("mobs.json", DATA_URLS.mobs),
    fetchJson("monsters.json", DATA_URLS.monsters),
    fetchJson("maps.json", DATA_URLS.maps),
    fetchJson("places.json", DATA_URLS.places),
  ]);

  const itemNameIndex = buildItemNameIndex(itemsData);
  const mobIndex = buildMobIndex(mobsData);
  const monsterPositionIndex = buildMonsterPositionIndex(monstersData);

  const results = {};

  for (const materialName of targetMaterials) {
    const item = itemNameIndex.get(materialName.toLowerCase()) ?? null;

    results[materialName] = resolveMonsterDropSources({
      materialName,
      item,
      dropSourcesData,
      lootSourcesData,
      mobIndex,
      monsterPositionIndex,
      mapsData,
      placesData,
    });
  }

  const statusCounts = Object.values(results).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});

  const output = {
    metadata: {
      totalRawMaterialsInRecipes: rawMaterials.length,
      checkedMaterials: targetMaterials.length,
      useSampleMaterials: USE_SAMPLE_MATERIALS,
      maxMonstersPerMaterial: MAX_MONSTERS_PER_MATERIAL,
      maxPositionsPerMonster: MAX_POSITIONS_PER_MONSTER,
      note: "This resolves Teamcraft drop-sources.json item IDs into mob names and monster positions where possible.",
    },
    lookupSizes: {
      items: itemNameIndex.size,
      mobs: mobIndex.size,
      monsterPositionBaseIds: monsterPositionIndex.size,
    },
    statusCounts,
    results,
  };

  const outputDirectory = path.resolve("src/data");
  const outputPath = path.join(
    outputDirectory,
    "debug-resolved-monster-drops.json"
  );

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${outputPath}`);
  console.log("");
  console.log("Resolved monster/drop summary:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
  console.log("");
  console.log("Open src/data/debug-resolved-monster-drops.json next.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
