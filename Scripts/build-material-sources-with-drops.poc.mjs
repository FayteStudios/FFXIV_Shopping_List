import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  nodes: `${TEAMCRAFT_BASE}/nodes.json`,
  gatheringItems: `${TEAMCRAFT_BASE}/gathering-items.json`,
  gatheringTypes: `${TEAMCRAFT_BASE}/gathering-types.json`,
  maps: `${TEAMCRAFT_BASE}/maps.json`,
  places: `${TEAMCRAFT_BASE}/places.json`,
  dropSources: `${TEAMCRAFT_BASE}/drop-sources.json`,
  lootSources: `${TEAMCRAFT_BASE}/loot-sources.json`,
  mobs: `${TEAMCRAFT_BASE}/mobs.json`,
  monsters: `${TEAMCRAFT_BASE}/monsters.json`,
};

// Keep false now that the sample monster-drop test worked.
const USE_SAMPLE_MATERIALS = false;

const SAMPLE_MATERIALS = [
  "Copper Ore",
  "Tin Ore",
  "Maple Log",
  "Bone Chip",
  "Iron Ore",
  "Mythril Ore",
  "Cobalt Ore",
  "Darksteel Ore",
  "Spruce Log",
  "Fire Shard",
  "Animal Skin",
  "Diremite Web",
  "Aldgoat Horn",
  "Bomb Ash",
];

const MAX_MONSTERS_PER_MATERIAL = 50;
const MAX_POSITIONS_PER_MONSTER = 12;

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
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

  try {
    const files = await fs.readdir(recipeDirectory);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    if (jsonFiles.length === 0) {
      throw new Error("No recipe JSON files found.");
    }

    const mergedRecipes = {};

    for (const file of jsonFiles) {
      const filePath = path.join(recipeDirectory, file);
      const text = await fs.readFile(filePath, "utf8");
      const recipesForClass = JSON.parse(text);

      Object.assign(mergedRecipes, recipesForClass);
    }

    return mergedRecipes;
  } catch (error) {
    throw new Error(
      `Could not read recipe JSON files from src/data/recipes. ${error.message}`
    );
  }
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
      });
    }
  }

  return index;
}

function buildGatheringItemIndex(gatheringItemsData) {
  const index = new Map();

  for (const entry of asArray(gatheringItemsData)) {
    const itemId = Number(
      entry.itemId ??
        entry.item_id ??
        entry.item ??
        entry.Item ??
        entry.id ??
        entry.row_id ??
        entry.rowId
    );

    if (Number.isFinite(itemId)) {
      index.set(itemId, entry);
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

function findNodeItemIds(node) {
  const itemContainers = [
    node.items,
    node.itemIds,
    node.item_ids,
    node.gatheringItems,
    node.gathering_items,
    node.bonusItems,
  ].filter(Boolean);

  const ids = new Set();

  for (const container of itemContainers) {
    if (Array.isArray(container)) {
      for (const value of container) {
        if (typeof value === "number" || typeof value === "string") {
          const id = Number(value);

          if (Number.isFinite(id)) {
            ids.add(id);
          }
        } else if (value && typeof value === "object") {
          const id = Number(
            value.id ?? value.itemId ?? value.item_id ?? value.item
          );

          if (Number.isFinite(id)) {
            ids.add(id);
          }
        }
      }
    } else if (container && typeof container === "object") {
      for (const [key, value] of Object.entries(container)) {
        const keyId = Number(key);

        if (Number.isFinite(keyId)) {
          ids.add(keyId);
        }

        if (value && typeof value === "object") {
          const id = Number(
            value.id ?? value.itemId ?? value.item_id ?? value.item
          );

          if (Number.isFinite(id)) {
            ids.add(id);
          }
        }
      }
    }
  }

  return ids;
}

function getSpawnTimes(node) {
  const times =
    node.spawns ??
    node.times ??
    node.spawnTimes ??
    node.spawn_times ??
    node.hours ??
    node.uptime;

  if (Array.isArray(times)) {
    return times;
  }

  if (times == null) {
    return [];
  }

  return [times];
}

function formatEorzeaSpawnTime(hour) {
  const number = Number(hour);

  if (!Number.isFinite(number)) {
    return null;
  }

  return `${String(number).padStart(2, "0")}:00`;
}

function formatDuration(duration) {
  const number = Number(duration);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  if (number % 60 === 0) {
    const hours = number / 60;
    return `${hours} Eorzea hour${hours === 1 ? "" : "s"}`;
  }

  return `${number} Eorzea minutes`;
}

function getGatheringTypeName(typeId, gatheringTypesData) {
  const entry = gatheringTypesData?.[String(typeId)] ?? gatheringTypesData?.[typeId];

  return entry?.en ?? null;
}

function getGatheringClassFromType(typeId) {
  const number = Number(typeId);

  if (number === 1) {
    return "Miner";
  }

  if (number === 2 || number === 3) {
    return "Botanist";
  }

  return null;
}

function getNodeTypeName(typeId, node) {
  if (node.ephemeral) {
    return "Ephemeral Node";
  }

  if (node.legendary) {
    return "Legendary Node";
  }

  if (node.limited) {
    return "Timed Node";
  }

  const typeMap = {
    0: "Unknown Node",
    1: "Regular Node",
    2: "Unspoiled/Legendary Node",
  };

  return typeMap[typeId] ?? null;
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

function normalizeSourceFromNode(
  node,
  gatheringItem,
  gatheringTypesData,
  mapsData,
  placesData
) {
  const x = pickFirstNumber(
    node.x,
    node.X,
    node.mapX,
    node.map_x,
    node.coords?.x,
    node.coordinates?.x
  );

  const y = pickFirstNumber(
    node.y,
    node.Y,
    node.mapY,
    node.map_y,
    node.coords?.y,
    node.coordinates?.y
  );

  const spawnTimes = getSpawnTimes(node)
    .map(formatEorzeaSpawnTime)
    .filter(Boolean);

  const rawDuration = pickFirstNumber(
    node.duration,
    node.uptime,
    node.durationHours
  );

  const rawType = pickFirstNumber(node.type);
  const gatheringType = getGatheringTypeName(rawType, gatheringTypesData);

  const zoneId = pickFirstNumber(
    node.zoneid,
    node.zoneId,
    node.zone_id,
    node.territoryType,
    node.territoryTypeId,
    node.areaId
  );

  const mapId = pickFirstNumber(node.map, node.mapId, node.map_id);
  const mapInfo = getMapInfo(mapId, mapsData, placesData);
  const areaName = getEnglishPlaceName(zoneId, placesData);

  return {
    type: "gathering",
    gatheringClass: getGatheringClassFromType(rawType),
    gatheringType,
    level: pickFirstNumber(
      node.level,
      node.lvl,
      node.gatheringLevel,
      gatheringItem?.level,
      gatheringItem?.lvl
    ),
    region: mapInfo.regionName,
    zone: mapInfo.mapName,
    zoneId,
    area: areaName,
    map: mapInfo.mapName,
    mapId,
    coordinates: x !== null || y !== null ? { x, y } : null,
    nodeType: getNodeTypeName(rawType, node),
    timed: Boolean(
      node.limited ||
        node.legendary ||
        node.ephemeral ||
        spawnTimes.length > 0
    ),
    spawnTimes,
    duration: formatDuration(rawDuration),
    hidden: Boolean(gatheringItem?.hidden || node.hiddenItems?.length),
    folklore:
      pickFirstString(node.folklore, node.folkloreBook, node.folklore_book) ??
      null,
    debug: {
      rawType: node.type ?? null,
      gatheringType,
      base: node.base ?? null,
      radius: node.radius ?? null,
      hiddenItems: node.hiddenItems ?? [],
    },
  };
}

function isUsefulGatheringSource(source) {
  const hasCoordinates =
    source.coordinates &&
    Number.isFinite(source.coordinates.x) &&
    Number.isFinite(source.coordinates.y);

  const hasRealZone = source.zoneId !== null && source.zoneId !== 0;
  const hasRealMap = source.mapId !== null && source.mapId !== 0;

  return hasCoordinates && (hasRealZone || hasRealMap);
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

function getLootSourceEntry(lootSourcesData, itemId) {
  return lootSourcesData?.[String(itemId)] ?? lootSourcesData?.[itemId] ?? null;
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

function resolveMonsterDropSources({
  itemId,
  dropSourcesData,
  lootSourcesData,
  mobIndex,
  monsterPositionIndex,
  mapsData,
  placesData,
}) {
  const dropMobIds = getDropSourceMobIds(dropSourcesData, itemId);
  const lootSourceEntry = getLootSourceEntry(lootSourcesData, itemId);

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
      },
    };
  });

  return {
    sources,
    debug: {
      dropMobIds,
      dropMobIdCount: dropMobIds.length,
      lootSourceEntry,
      truncatedMonsterList: dropMobIds.length > MAX_MONSTERS_PER_MATERIAL,
    },
  };
}

function getCombinedStatus({
  gatheringSources,
  matchingNodes,
  monsterSources,
  itemFound,
}) {
  if (!itemFound) {
    return "item_name_not_found_in_teamcraft_items";
  }

  if (gatheringSources.length > 0 && monsterSources.length > 0) {
    return "ok_gathering_and_monster_drop_sources_found";
  }

  if (gatheringSources.length > 0) {
    return "ok_gathering_source_found";
  }

  if (monsterSources.length > 0) {
    return "ok_monster_drop_source_found";
  }

  if (matchingNodes.length > 0) {
    return "only_unusable_or_placeholder_gathering_sources_found";
  }

  return "no_source_found";
}

async function main() {
  const recipes = await readRecipes();
  const rawMaterials = getRawMaterialsFromRecipes(recipes);

  const targetMaterials = USE_SAMPLE_MATERIALS
    ? SAMPLE_MATERIALS.filter((name) => rawMaterials.includes(name))
    : rawMaterials;

  console.log(`Found ${rawMaterials.length} unique raw materials in recipes.`);
  console.log(
    `Building combined gathering + monster-drop sources for ${targetMaterials.length} ${
      USE_SAMPLE_MATERIALS ? "sample" : "total"
    } materials.`
  );

  console.log("");
  console.log("Fetching Teamcraft data files...");

  const [
    itemsData,
    nodesData,
    gatheringItemsData,
    gatheringTypesData,
    mapsData,
    placesData,
    dropSourcesData,
    lootSourcesData,
    mobsData,
    monstersData,
  ] = await Promise.all([
    fetchJson("items.json", DATA_URLS.items),
    fetchJson("nodes.json", DATA_URLS.nodes),
    fetchJson("gathering-items.json", DATA_URLS.gatheringItems),
    fetchJson("gathering-types.json", DATA_URLS.gatheringTypes),
    fetchJson("maps.json", DATA_URLS.maps),
    fetchJson("places.json", DATA_URLS.places),
    fetchJson("drop-sources.json", DATA_URLS.dropSources),
    fetchJson("loot-sources.json", DATA_URLS.lootSources),
    fetchJson("mobs.json", DATA_URLS.mobs),
    fetchJson("monsters.json", DATA_URLS.monsters),
  ]);

  const itemNameIndex = buildItemNameIndex(itemsData);
  const gatheringItemIndex = buildGatheringItemIndex(gatheringItemsData);
  const mobIndex = buildMobIndex(mobsData);
  const monsterPositionIndex = buildMonsterPositionIndex(monstersData);
  const nodes = asArray(nodesData);

  const materialSources = {};

  for (const materialName of targetMaterials) {
    const item = itemNameIndex.get(materialName.toLowerCase()) ?? null;
    const key = slugify(materialName);

    if (!item) {
      materialSources[key] = {
        name: materialName,
        itemId: null,
        sources: [],
        status: getCombinedStatus({
          gatheringSources: [],
          matchingNodes: [],
          monsterSources: [],
          itemFound: false,
        }),
      };

      continue;
    }

    const matchingNodes = nodes.filter((node) => findNodeItemIds(node).has(item.id));
    const gatheringItem = gatheringItemIndex.get(item.id);

    const gatheringSources = matchingNodes
      .map((node) =>
        normalizeSourceFromNode(
          node,
          gatheringItem,
          gatheringTypesData,
          mapsData,
          placesData
        )
      )
      .filter(isUsefulGatheringSource);

    const monsterDropResult = resolveMonsterDropSources({
      itemId: item.id,
      dropSourcesData,
      lootSourcesData,
      mobIndex,
      monsterPositionIndex,
      mapsData,
      placesData,
    });

    const sources = [...gatheringSources, ...monsterDropResult.sources];

    materialSources[key] = {
      name: materialName,
      itemId: item.id,
      sources,
      status: getCombinedStatus({
        gatheringSources,
        matchingNodes,
        monsterSources: monsterDropResult.sources,
        itemFound: true,
      }),
      debug: {
        matchingGatheringNodeCount: matchingNodes.length,
        usefulGatheringSourceCount: gatheringSources.length,
        monsterDropSourceCount: monsterDropResult.sources.length,
        monsterDrop: monsterDropResult.debug,
      },
    };
  }

  const statusCounts = Object.values(materialSources).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});

  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      [
        "item_name_not_found_in_teamcraft_items",
        "only_unusable_or_placeholder_gathering_sources_found",
        "no_source_found",
      ].includes(entry.status)
    )
  );

  const outputDirectory = path.resolve("src/data");

  await fs.mkdir(outputDirectory, { recursive: true });

  await fs.writeFile(
    path.join(outputDirectory, "materialSources.withDrops.poc.json"),
    JSON.stringify(materialSources, null, 2),
    "utf8"
  );

  await fs.writeFile(
    path.join(outputDirectory, "materialSources.withDrops.unresolved-report.json"),
    JSON.stringify(
      {
        metadata: {
          totalRawMaterialsInRecipes: rawMaterials.length,
          checkedMaterials: targetMaterials.length,
          useSampleMaterials: USE_SAMPLE_MATERIALS,
        },
        statusCounts,
        unresolved,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log("Wrote src/data/materialSources.withDrops.poc.json");
  console.log("Wrote src/data/materialSources.withDrops.unresolved-report.json");
  console.log("");
  console.log("Combined source summary:");

  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});