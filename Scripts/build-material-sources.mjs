import fs from 'node:fs/promises';
import path from 'node:path';

const TEAMCRAFT_BASE =
  'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json';
  const TEAMCRAFT_JSON_CATALOG_URL =
  'https://api.github.com/repos/ffxiv-teamcraft/ffxiv-teamcraft/contents/libs/data/src/lib/json?ref=staging';

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  nodes: `${TEAMCRAFT_BASE}/nodes.json`,
  gatheringItems: `${TEAMCRAFT_BASE}/gathering-items.json`,
  gatheringTypes: `${TEAMCRAFT_BASE}/gathering-types.json`,
  maps: `${TEAMCRAFT_BASE}/maps.json`,
  places: `${TEAMCRAFT_BASE}/places.json`,

  baits: `${TEAMCRAFT_BASE}/baits.json`,
  fishes: `${TEAMCRAFT_BASE}/fishes.json`,
  fishParameter: `${TEAMCRAFT_BASE}/fish-parameter.json`,
  fishingLog: `${TEAMCRAFT_BASE}/fishing-log.json`,
  fishingSources: `${TEAMCRAFT_BASE}/fishing-sources.json`,
  fishingSpots: `${TEAMCRAFT_BASE}/fishing-spots.json`,

  mobs: `${TEAMCRAFT_BASE}/mobs.json`,
  monsters: `${TEAMCRAFT_BASE}/monsters.json`,
  drops: `${TEAMCRAFT_BASE}/drops.json`,
  monsterDrops: `${TEAMCRAFT_BASE}/monster-drops.json`,
  dropSources: `${TEAMCRAFT_BASE}/drop-sources.json`,
  mobDrops: `${TEAMCRAFT_BASE}/mob-drops.json`,
  itemDrops: `${TEAMCRAFT_BASE}/item-drops.json`,
  loot: `${TEAMCRAFT_BASE}/loot.json`,

  shops: `${TEAMCRAFT_BASE}/shops.json`,
  shopsByNpc: `${TEAMCRAFT_BASE}/shops-by-npc.json`,
  npcs: `${TEAMCRAFT_BASE}/npcs.json`,
  vendors: `${TEAMCRAFT_BASE}/vendors.json`,
  ventures: `${TEAMCRAFT_BASE}/ventures.json`,
  desynth: `${TEAMCRAFT_BASE}/desynth.json`,
  reduction: `${TEAMCRAFT_BASE}/reduction.json`,
  itemsSources: `${TEAMCRAFT_BASE}/items-sources.json`,

  
};

const SAMPLE_MATERIALS = [
  'Copper Ore',
  'Tin Ore',
  'Maple Log',
  'Bone Chip',
  'Iron Ore',
  'Mythril Ore',
  'Cobalt Ore',
  'Darksteel Ore',
  'Spruce Log',
  'Fire Shard',
];

const USE_SAMPLE_MATERIALS = false;

const WRITE_DEBUG_FILES = false;
const WRITE_LOOKUP_DEBUG_FILES = false;
const WRITE_FISHING_DEBUG_FILES = false;
const WRITE_OPTIONAL_SOURCES_DEBUG_FILES = true;
const WRITE_UNRESOLVED_REPORT = true;

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchTeamcraftJsonCatalog() {
  try {
    const response = await fetch(TEAMCRAFT_JSON_CATALOG_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      console.log(
        `Could not load Teamcraft JSON catalog: ${response.status} ${response.statusText}`
      );
      return [];
    }

    const entries = await response.json();

    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter((entry) => entry.type === 'file' && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.log(`Could not load Teamcraft JSON catalog: ${error.message}`);
    return [];
  }
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([id, data]) => ({ id, ...data }));
  }

  return [];
}

async function writeTeamcraftJsonCatalogDebugFile() {
  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  const files = await fetchTeamcraftJsonCatalog();

  const interestingPatterns = [
    /drop/i,
    /loot/i,
    /mob/i,
    /monster/i,
    /enemy/i,
    /npc/i,
    /source/i,
    /reward/i,
    /venture/i,
    /instance/i,
    /supply/i,
  ];
  

  const interestingFiles = files.filter((file) =>
    interestingPatterns.some((pattern) => pattern.test(file))
  );

  const report = {
    generatedAt: new Date().toISOString(),
    totalJsonFiles: files.length,
    interestingFiles,
    allFiles: files,
  };

  await fs.writeFile(
    path.resolve('src/data/debug-teamcraft-json-catalog.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/debug-teamcraft-json-catalog.json');
}


function getLocalizedName(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value.en === 'string') {
    return value.en;
  }

  if (typeof value.en === 'object') {
    return getLocalizedName(value.en);
  }

  if (typeof value.name === 'string') {
    return value.name;
  }

  if (value.name) {
    return getLocalizedName(value.name);
  }

  if (typeof value.Name === 'string') {
    return value.Name;
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
    if (typeof value === 'string' && value.trim()) {
      return value;
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

async function fetchOptionalJson(label, url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`Skipped optional ${label}: ${response.status} ${response.statusText}`);
      return null;
    }

    console.log(`Loaded optional ${label}`);
    return response.json();
  } catch (error) {
    console.log(`Skipped optional ${label}: ${error.message}`);
    return null;
  }
}

async function readRecipes() {
  const recipeDirectory = path.resolve('src/data/recipes');

  try {
    const files = await fs.readdir(recipeDirectory);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    if (jsonFiles.length === 0) {
      throw new Error('No recipe JSON files found.');
    }

    const mergedRecipes = {};

    for (const file of jsonFiles) {
      const filePath = path.join(recipeDirectory, file);
      const text = await fs.readFile(filePath, 'utf8');
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
      if (ingredient.type === 'material') {
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
      index.set(name.toLowerCase(), { id, name });
    }
  }

  return index;
}

function buildItemIdIndex(itemsData) {
  const index = new Map();

  for (const item of asArray(itemsData)) {
    const id = Number(item.id ?? item.row_id ?? item.rowId ?? item.ID);
    const name = getLocalizedName(item);

    if (Number.isFinite(id) && name) {
      index.set(id, { id, name });
    }
  }

  return index;
}

function findItemIdOccurrences(value, targetItemId, pathParts = [], results = []) {
  if (!value) {
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      findItemIdOccurrences(entry, targetItemId, [...pathParts, `[${index}]`], results);
    });

    return results;
  }

  if (typeof value !== 'object') {
    return results;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const currentPath = [...pathParts, key];

    if (
      Number(nestedValue) === targetItemId &&
      /item|drop|reward|loot/i.test(key)
    ) {
      results.push({
        path: currentPath.join('.'),
        matchedKey: key,
        nearbyObject: value,
      });
    }

    if (nestedValue && typeof nestedValue === 'object') {
      findItemIdOccurrences(nestedValue, targetItemId, currentPath, results);
    }
  }

  return results;
}

function getMonsterDebugSourcePreview(sourceData, targetItemId) {
  const rows = asArray(sourceData);
  const matches = [];

  for (const row of rows) {
    const occurrences = findItemIdOccurrences(row, targetItemId);

    if (occurrences.length === 0) {
      continue;
    }

    matches.push({
      sourceRowId: row.id ?? row.row_id ?? row.rowId ?? row.ID ?? null,
      name: getLocalizedName(row),
      occurrenceCount: occurrences.length,
      occurrences: occurrences.slice(0, 8),
      rowPreview: row,
    });

    if (matches.length >= 25) {
      break;
    }
  }

  return {
    rowCount: rows.length,
    matchCount: matches.length,
    matches,
  };
}

async function writeMonsterDropDebugFile({
  itemNameIndex,
  optionalSourcesData,
}) {
  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  const targetMaterialNames = [
    'Ahriman Wing',
    'Aldgoat Skin',
    'Aldgoat Chuck',
    'Animal Sinew',
    'Antelope Horn',
    'Diremite Web',
    'Hippogryph Sinew',
    'Raptor Skin',
    'Acidic Secretions',
    'Aldgoat Leather',
  ];

  const sourceBuckets = {
    mobsData: optionalSourcesData.mobsData,
    monstersData: optionalSourcesData.monstersData,
    dropSourcesData: optionalSourcesData.dropSourcesData,
    dropsData: optionalSourcesData.dropsData,
    monsterDropsData: optionalSourcesData.monsterDropsData,
    mobDropsData: optionalSourcesData.mobDropsData,
    itemDropsData: optionalSourcesData.itemDropsData,
    lootData: optionalSourcesData.lootData,
  };

  const targets = targetMaterialNames.map((name) => {
    const item = itemNameIndex.get(name.toLowerCase());

    if (!item) {
      return {
        name,
        itemId: null,
        foundInItems: false,
        sources: {},
      };
    }

    const sources = Object.fromEntries(
      Object.entries(sourceBuckets).map(([sourceName, data]) => [
        sourceName,
        data
          ? getMonsterDebugSourcePreview(data, item.id)
          : {
              rowCount: 0,
              matchCount: 0,
              matches: [],
              unavailable: true,
            },
      ])
    );

    return {
      name,
      itemId: item.id,
      foundInItems: true,
      sources,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    note: 'This report searches likely monster/drop source files for known monster-drop material item IDs.',
    targets,
  };

  await fs.writeFile(
    path.resolve('src/data/debug-monster-drop-targets.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/debug-monster-drop-targets.json');
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

function buildFishParameterIndex(fishParameterData) {
  const index = new Map();

  for (const entry of asArray(fishParameterData)) {
    const itemId = Number(entry.itemId ?? entry.item_id ?? entry.item);

    if (Number.isFinite(itemId)) {
      index.set(itemId, entry);
    }
  }

  return index;
}

function buildFishingSpotIndex(fishingSpotsData) {
  const index = new Map();

  for (const spot of asArray(fishingSpotsData)) {
    const id = Number(spot.id ?? spot.row_id ?? spot.rowId ?? spot.ID);

    if (Number.isFinite(id)) {
      index.set(id, spot);
    }
  }

  return index;
}

function buildFishingSourceIndex(fishingSourcesData) {
  const index = new Map();

  for (const entry of asArray(fishingSourcesData)) {
    const itemId = Number(entry.id ?? entry.itemId ?? entry.item_id);

    if (!Number.isFinite(itemId)) {
      continue;
    }

    const sources = Object.entries(entry)
      .filter(([key, value]) => {
        return (
          key !== 'id' &&
          Number.isFinite(Number(key)) &&
          value &&
          typeof value === 'object'
        );
      })
      .map(([, value]) => value);

    index.set(itemId, sources);
  }

  return index;
}

function buildFishingLogIndex(fishingLogData) {
  const index = new Map();

  for (const entry of asArray(fishingLogData)) {
    const itemId = Number(entry.itemId ?? entry.item_id ?? entry.item);

    if (!Number.isFinite(itemId)) {
      continue;
    }

    if (!index.has(itemId)) {
      index.set(itemId, []);
    }

    index.get(itemId).push(entry);
  }

  return index;
}

async function writeVendorLocationDebugFile({ optionalSourcesData }) {
  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  const targetNpcIds = [1027564, 1033780];

  const npcs = asArray(optionalSourcesData.npcsData);
  const shopsByNpc = optionalSourcesData.shopsByNpcData;

  const debugPayload = {
    targetNpcIds,

    matchingNpcs: targetNpcIds.map((targetNpcId) => {
      return (
        npcs.find((npc) => Number(npc.id) === targetNpcId) ?? null
      );
    }),

    shopsByNpcEntries: Object.fromEntries(
      targetNpcIds.map((targetNpcId) => [
        String(targetNpcId),
        shopsByNpc?.[String(targetNpcId)] ?? shopsByNpc?.[targetNpcId] ?? null,
      ])
    ),

    shopsByNpcSample: asArray(shopsByNpc).slice(0, 30),
  };

  await fs.writeFile(
    path.resolve('src/data/debug-vendor-location-targets.json'),
    JSON.stringify(debugPayload, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/debug-vendor-location-targets.json');
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
        if (typeof value === 'number' || typeof value === 'string') {
          const id = Number(value);

          if (Number.isFinite(id)) {
            ids.add(id);
          }
        } else if (value && typeof value === 'object') {
          const id = Number(
            value.id ?? value.itemId ?? value.item_id ?? value.item
          );

          if (Number.isFinite(id)) {
            ids.add(id);
          }
        }
      }
    } else if (container && typeof container === 'object') {
      for (const [key, value] of Object.entries(container)) {
        const keyId = Number(key);

        if (Number.isFinite(keyId)) {
          ids.add(keyId);
        }

        if (value && typeof value === 'object') {
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

  return `${String(number).padStart(2, '0')}:00`;
}

function formatDuration(duration) {
  const number = Number(duration);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  if (number % 60 === 0) {
    const hours = number / 60;
    return `${hours} Eorzea hour${hours === 1 ? '' : 's'}`;
  }

  return `${number} Eorzea minutes`;
}

function formatFishingDuration(durationHours) {
  const number = Number(durationHours);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return `${number} Eorzea hour${number === 1 ? '' : 's'}`;
}

function getGatheringTypeName(typeId, gatheringTypesData) {
  const entry = gatheringTypesData?.[String(typeId)] ?? gatheringTypesData?.[typeId];

  return entry?.en ?? null;
}

function getGatheringClassFromType(typeId) {
  const number = Number(typeId);

  if (number === 1) {
    return 'Miner';
  }

  if (number === 2 || number === 3) {
    return 'Botanist';
  }

  if (number === 4 || number === 5) {
    return 'Fisher';
  }

  return null;
}

function getFishingCategoryName(categoryId) {
  const category = Number(categoryId);

  const categoryMap = {
    1: 'Freshwater Fishing',
    2: 'Ocean Fishing',
    3: 'Dunefishing',
    4: 'Skyfishing',
    5: 'Cloudfishing',
    6: 'Aetherfishing',
    7: 'Spearfishing',
  };

  return categoryMap[category] ?? 'Fishing';
}

function getNodeTypeName(typeId, node) {
  if (node.ephemeral) {
    return 'Ephemeral Node';
  }

  if (node.legendary) {
    return 'Legendary Node';
  }

  if (node.limited) {
    return 'Timed Node';
  }

  const typeMap = {
    0: 'Unknown Node',
    1: 'Regular Node',
    2: 'Unspoiled/Legendary Node',
  };

  return typeMap[typeId] ?? null;
}

function getEnglishPlaceName(placeId, placesData) {
  const id = Number(placeId);

  if (!Number.isFinite(id) || id === 0) {
    return null;
  }

  const entry = placesData?.[String(id)] ?? placesData?.[id];

  if (!entry?.en || !entry.en.trim()) {
    return null;
  }

  return entry.en;
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

function normalizeLocationFromPosition(position, mapsData, placesData) {
  const mapId = pickFirstNumber(
    position.map,
    position.mapId,
    position.map_id
  );

  const zoneId = pickFirstNumber(
    position.zoneid,
    position.zoneId,
    position.zone_id,
    position.territoryType,
    position.territoryTypeId
  );

  const x = pickFirstNumber(
    position.x,
    position.X,
    position.mapX,
    position.map_x,
    position.coords?.x,
    position.coordinates?.x
  );

  const y = pickFirstNumber(
    position.y,
    position.Y,
    position.mapY,
    position.map_y,
    position.coords?.y,
    position.coordinates?.y
  );

  const mapInfo = getMapInfo(mapId, mapsData, placesData);
  const areaName = getEnglishPlaceName(zoneId, placesData);

  return {
    region: mapInfo.regionName,
    zone: mapInfo.mapName,
    area: areaName,
    map: mapInfo.mapName,
    mapId,
    zoneId,
    coordinates: x !== null || y !== null ? { x, y } : null,
    level: pickFirstNumber(position.level),
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
    type: 'gathering',
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
    folklore: pickFirstString(node.folklore, node.folkloreBook, node.folklore_book) ?? null,

    debug: {
      rawType: node.type ?? null,
      gatheringType,
      base: node.base ?? null,
      radius: node.radius ?? null,
      hiddenItems: node.hiddenItems ?? [],
    },
  };
}

function normalizeFishingSource({
  itemId,
  source,
  fishParameter,
  fishingSpot,
  itemIdIndex,
  mapsData,
  placesData,
}) {
  if (!fishingSpot) {
    return null;
  }

  const mapId = pickFirstNumber(
    fishingSpot.mapId,
    fishingSpot.map_id,
    fishParameter?.mapId,
    fishParameter?.map_id
  );

  const zoneId = pickFirstNumber(
    fishingSpot.zoneId,
    fishingSpot.zone_id,
    fishParameter?.zoneId,
    fishParameter?.zone_id
  );

  const mapInfo = getMapInfo(mapId, mapsData, placesData);
  const spotName = getEnglishPlaceName(zoneId, placesData);
  const placeName = getEnglishPlaceName(fishingSpot.placeId, placesData);

  const x = pickFirstNumber(
    fishingSpot.coords?.x,
    fishingSpot.coordinates?.x,
    fishingSpot.x,
    fishingSpot.X
  );

  const y = pickFirstNumber(
    fishingSpot.coords?.y,
    fishingSpot.coordinates?.y,
    fishingSpot.y,
    fishingSpot.Y
  );

  const baitId = pickFirstNumber(source.bait);
  const bait = baitId !== null ? itemIdIndex.get(baitId) : null;

  const spawnTime = formatEorzeaSpawnTime(source.spawn);
  const spawnTimes = spawnTime ? [spawnTime] : [];

  const weatherIds = Array.isArray(source.weathers)
    ? source.weathers.filter((weatherId) => Number.isFinite(Number(weatherId)))
    : [];

  return {
    type: 'fishing',
    gatheringClass: 'Fisher',
    gatheringType: getFishingCategoryName(fishingSpot.category),
    fishingType: getFishingCategoryName(fishingSpot.category),

    level: pickFirstNumber(fishingSpot.level, fishParameter?.level, source.level),

    region: mapInfo.regionName,
    zone: mapInfo.mapName ?? placeName,
    zoneId,

    area: spotName,
    map: mapInfo.mapName ?? placeName,
    mapId,

    coordinates: x !== null || y !== null ? { x, y } : null,

    nodeType: 'Fishing Spot',
    fishingSpot: spotName,
    spotId: pickFirstNumber(fishingSpot.id),

    timed: Boolean(source.spawn != null || fishParameter?.timed),
    spawnTimes,
    duration: formatFishingDuration(source.duration),

    hidden: false,
    folklore: null,

    baitId,
    bait: bait?.name ?? null,
    baits: bait?.name ? [bait.name] : [],

    weatherIds,
    weather: [],

    hookset: source.hookset ?? null,
    tug: source.tug ?? null,
    snagging: Boolean(source.snagging),

    debug: {
      itemId,
      rawSpotCategory: fishingSpot.category ?? null,
      minGathering: source.minGathering ?? null,
      aLure: source.aLure ?? null,
      mLure: source.mLure ?? null,
    },
  };
}

function isUsefulSource(source) {
  const hasCoordinates =
    source.coordinates &&
    Number.isFinite(source.coordinates.x) &&
    Number.isFinite(source.coordinates.y);

  const hasRealZone = source.zoneId !== null && source.zoneId !== 0;
  const hasRealMap = source.mapId !== null && source.mapId !== 0;

  return hasCoordinates && (hasRealZone || hasRealMap);
}

function isUsefulFishingSource(source) {
  if (!source) {
    return false;
  }

  const hasCoordinates =
    source.coordinates &&
    Number.isFinite(source.coordinates.x) &&
    Number.isFinite(source.coordinates.y);

  return hasCoordinates || source.spotId !== null;
}

function findFishingSourcesForItem({
  itemId,
  fishingSourceIndex,
  fishParameterIndex,
  fishingSpotIndex,
  itemIdIndex,
  mapsData,
  placesData,
}) {
  const fishingSources = fishingSourceIndex.get(itemId) ?? [];
  const fishParameter = fishParameterIndex.get(itemId);

  return fishingSources
    .map((source) => {
      const spotId = pickFirstNumber(source.spot);
      const fishingSpot = spotId !== null ? fishingSpotIndex.get(spotId) : null;

      return normalizeFishingSource({
        itemId,
        source,
        fishParameter,
        fishingSpot,
        itemIdIndex,
        mapsData,
        placesData,
      });
    })
    .filter(isUsefulFishingSource);
}

function findItemLikeObjects(value, results = []) {
  if (!value) {
    return results;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      findItemLikeObjects(entry, results);
    }

    return results;
  }

  if (typeof value !== 'object') {
    return results;
  }

  const itemId = pickFirstNumber(
    value.itemId,
    value.item_id,
    value.item,
    value.id,
    value.item_id_1,
    value.reward,
    value.rewardId
  );

  const amount = pickFirstNumber(
    value.amount,
    value.quantity,
    value.qty,
    value.count,
    value.value
  );

  if (itemId !== null) {
    results.push({
      itemId,
      amount: amount ?? 1,
      raw: value,
    });
  }

  for (const nestedValue of Object.values(value)) {
    if (nestedValue && typeof nestedValue === 'object') {
      findItemLikeObjects(nestedValue, results);
    }
  }

  return results;
}

function getShopReceivedItems(shop, trade) {
  const likelyReceivedContainers = [
    trade.items,
    trade.rewards,
    trade.receives,
    trade.receive,
    trade.outputs,
    trade.output,
    trade.result,
    trade.results,
  ].filter(Boolean);

  const received = [];

  for (const container of likelyReceivedContainers) {
    received.push(...findItemLikeObjects(container));
  }

  if (received.length > 0) {
    return received;
  }

  return [];
}

function getShopCurrencyItems(trade) {
  const likelyCurrencyContainers = [
    trade.currencies,
    trade.currency,
    trade.costs,
    trade.cost,
    trade.requiredItems,
    trade.required_items,
    trade.ingredients,
  ].filter(Boolean);

  const currencies = [];

  for (const container of likelyCurrencyContainers) {
    currencies.push(...findItemLikeObjects(container));
  }

  return currencies;
}
function buildNpcIndex(npcsData, mapsData, placesData) {
  const index = new Map();

  for (const npc of asArray(npcsData)) {
    const id = pickFirstNumber(npc.id, npc.row_id, npc.rowId);
    const name = getLocalizedName(npc);

    if (id === null) {
      continue;
    }

    const rawPositions = [
      ...(Array.isArray(npc.positions) ? npc.positions : []),
      ...(npc.position && typeof npc.position === 'object' ? [npc.position] : []),
      ...(pickFirstNumber(npc.map, npc.mapId, npc.map_id) !== null ? [npc] : []),
    ];

    const locations = rawPositions
      .map((position) =>
        normalizeLocationFromPosition(position, mapsData, placesData)
      )
      .filter((location) => {
        const hasMap = location.mapId !== null && location.mapId !== 0;
        const hasZone = location.zoneId !== null && location.zoneId !== 0;
        const hasCoordinates =
          location.coordinates &&
          Number.isFinite(location.coordinates.x) &&
          Number.isFinite(location.coordinates.y);

        return hasMap || hasZone || hasCoordinates;
      });

    index.set(id, {
      id,
      name: name || `NPC #${id}`,
      locations,
    });
  }

  return index;
}
function buildShopSourceIndex(shopsData, itemIdIndex, npcIndex) {
  const index = new Map();

  for (const shop of asArray(shopsData)) {
    const shopId = pickFirstNumber(shop.id, shop.row_id, shop.rowId);
    const shopType = pickFirstString(shop.type, shop.shopType, shop.name) ?? 'Shop';

    const possibleTrades = [
      ...(Array.isArray(shop.trades) ? shop.trades : []),
      ...(Array.isArray(shop.listings) ? shop.listings : []),
      ...(Array.isArray(shop.items) ? shop.items : []),
    ];

    for (const trade of possibleTrades) {
      if (!trade || typeof trade !== 'object') {
        continue;
      }

      const receivedItems = getShopReceivedItems(shop, trade);
      const currencies = getShopCurrencyItems(trade);

      for (const receivedItem of receivedItems) {
        const itemId = receivedItem.itemId;

        if (itemId === null) {
          continue;
        }

        const costText = currencies
          .map((currency) => {
            const currencyItem = itemIdIndex.get(currency.itemId);
            return `${currency.amount ?? 1} ${currencyItem?.name ?? `Currency #${currency.itemId}`}`;
          })
          .filter(Boolean)
          .join(', ');

        if (!index.has(itemId)) {
          index.set(itemId, []);
        }

        const npcIds = Array.isArray(shop.npcs) ? shop.npcs : [];

        const vendors = npcIds
          .map((npcId) => npcIndex.get(Number(npcId)))
          .filter(Boolean);

        const vendorLocations = vendors.flatMap((vendor) =>
          (vendor.locations ?? []).map((location) => ({
            npcId: vendor.id,
            npcName: vendor.name,
            ...location,
          }))
        );

        const firstVendorLocation = vendorLocations[0] ?? null;

        index.get(itemId).push({
          shopId,
          shopType,
          amount: receivedItem.amount ?? 1,
          costText: costText || null,
          npcIds,
          vendors: vendors.map((vendor) => ({
            id: vendor.id,
            name: vendor.name,
          })),
          vendorLocations,
          firstVendorLocation,
        });
      }
    }
  }

  return index;
}

function normalizeShopSource(shopSource) {
  const firstLocation = shopSource.firstVendorLocation ?? null;

  return {
    type: 'shop',
    gatheringClass: 'Vendor',
    gatheringType: shopSource.shopType ?? 'Shop',

    level: firstLocation?.level ?? null,

    region: firstLocation?.region ?? null,
    zone: firstLocation?.zone ?? null,
    zoneId: firstLocation?.zoneId ?? null,

    area: firstLocation?.area ?? null,
    map: firstLocation?.map ?? null,
    mapId: firstLocation?.mapId ?? null,

    coordinates: firstLocation?.coordinates ?? null,

    nodeType: 'Shop Purchase',

    timed: false,
    spawnTimes: [],
    duration: null,

    hidden: false,
    folklore: null,

    shopId: shopSource.shopId,
    shopType: shopSource.shopType,
    cost: shopSource.costText,

    npcIds: shopSource.npcIds,
    vendors: shopSource.vendors ?? [],
    vendorLocations: shopSource.vendorLocations ?? [],

    vendorName: firstLocation?.npcName ?? shopSource.vendors?.[0]?.name ?? null,
    vendorLocationCount: shopSource.vendorLocations?.length ?? 0,

    debug: {
      amountReceived: shopSource.amount,
    },
  };
}

function findShopSourcesForItem({ itemId, shopSourceIndex }) {
  return (shopSourceIndex.get(itemId) ?? []).map(normalizeShopSource);
}

async function writeDebugFiles({
  itemNameIndex,
  gatheringItemIndex,
  nodes,
  materialName,
}) {
  const debugItem = itemNameIndex.get(materialName.toLowerCase());

  if (!debugItem) {
    console.log(`Could not write debug files. ${materialName} was not found.`);
    return;
  }

  const debugNode = nodes.find((node) => findNodeItemIds(node).has(debugItem.id));
  const debugGatheringItem = gatheringItemIndex.get(debugItem.id);

  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  await fs.writeFile(
    path.resolve('src/data/debug-spruce-node.json'),
    JSON.stringify(debugNode, null, 2),
    'utf8'
  );

  await fs.writeFile(
    path.resolve('src/data/debug-spruce-gathering-item.json'),
    JSON.stringify(debugGatheringItem, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/debug-spruce-node.json');
  console.log('Wrote src/data/debug-spruce-gathering-item.json');
}

async function writeLookupDebugFiles({ mapsData, placesData }) {
  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  await fs.writeFile(
    path.resolve('src/data/debug-maps.json'),
    JSON.stringify(mapsData, null, 2),
    'utf8'
  );

  await fs.writeFile(
    path.resolve('src/data/debug-places.json'),
    JSON.stringify(placesData, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/debug-maps.json');
  console.log('Wrote src/data/debug-places.json');
}

async function writeFishingDebugFiles({
  baitsData,
  fishesData,
  fishParameterData,
  fishingLogData,
  fishingSourcesData,
  fishingSpotsData,
}) {
  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  const debugPayload = {
    baitsSample: asArray(baitsData).slice(0, 30),
    fishesSample: asArray(fishesData).slice(0, 30),
    fishParameterSample: asArray(fishParameterData).slice(0, 30),
    fishingLogSample: asArray(fishingLogData).slice(0, 30),
    fishingSourcesSample: asArray(fishingSourcesData).slice(0, 60),
    fishingSpotsSample: asArray(fishingSpotsData).slice(0, 60),
  };

  await fs.writeFile(
    path.resolve('src/data/debug-fishing-data.json'),
    JSON.stringify(debugPayload, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/debug-fishing-data.json');
}

async function writeOptionalSourcesDebugFiles(optionalSourcesData) {
  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  const debugPayload = Object.fromEntries(
    Object.entries(optionalSourcesData).map(([label, data]) => [
      label,
      data
        ? {
            available: true,
            sample: asArray(data).slice(0, 50),
          }
        : {
            available: false,
            sample: [],
          },
    ])
  );

  await fs.writeFile(
    path.resolve('src/data/debug-optional-sources.json'),
    JSON.stringify(debugPayload, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/debug-optional-sources.json');
}

async function writeUnresolvedReport({
  materialSources,
  targetMaterials,
  itemNameIndex,
  gatheringItemIndex,
  fishingSourceIndex,
  fishParameterIndex,
  fishingLogIndex,
  shopSourceIndex,
  nodes,
}) {
  const unresolvedRows = [];

  for (const materialName of targetMaterials) {
    const slug = slugify(materialName);
    const materialSource = materialSources[slug];
    const item = itemNameIndex.get(materialName.toLowerCase());

    if (!materialSource || materialSource.status === 'ok') {
      continue;
    }

    if (!item) {
      unresolvedRows.push({
        name: materialName,
        slug,
        itemId: null,
        status: 'item_name_not_found_in_teamcraft_items',
        classification: 'item_name_not_found',
        hasGatheringItemEntry: false,
        matchingGatheringNodeCount: 0,
        hasFishParameter: false,
        detailedFishingSourceCount: 0,
        fishingLogEntryCount: 0,
        shopSourceCount: 0,
        notes: [
          'The material name from recipes did not match Teamcraft items.json.',
        ],
      });

      continue;
    }

    const matchingNodes = nodes.filter((node) => findNodeItemIds(node).has(item.id));
    const gatheringItem = gatheringItemIndex.get(item.id);
    const detailedFishingSources = fishingSourceIndex.get(item.id) ?? [];
    const fishParameter = fishParameterIndex.get(item.id);
    const fishingLogEntries = fishingLogIndex.get(item.id) ?? [];
    const shopSources = shopSourceIndex.get(item.id) ?? [];

    const notes = [];

    if (gatheringItem && matchingNodes.length === 0) {
      notes.push('Has a gathering-items entry but no matching node was found.');
    }

    if (matchingNodes.length > 0) {
      notes.push(
        'Has matching gathering node data, but the source was filtered as unusable or placeholder.'
      );
    }

    if (fishParameter && detailedFishingSources.length === 0) {
      notes.push('Looks like a fish, but no detailed fishing-sources entry was found.');
    }

    if (fishingLogEntries.length > 0 && detailedFishingSources.length === 0) {
      notes.push('Has fishing-log location data and is a good fallback candidate.');
    }

    if (detailedFishingSources.length > 0) {
      notes.push(
        'Has detailed fishing-sources data, but no usable normalized source was produced.'
      );
    }

    if (shopSources.length > 0) {
      notes.push('Has shop/vendor purchase data.');
    }

    let classification = 'unknown_or_non_gathering';

    if (shopSources.length > 0) {
      classification = 'shop_vendor_source';
    } else if (fishingLogEntries.length > 0 && detailedFishingSources.length === 0) {
      classification = 'fishing_log_fallback_candidate';
    } else if (fishParameter) {
      classification = 'fish_missing_or_unusable_detailed_source';
    } else if (gatheringItem && matchingNodes.length === 0) {
      classification = 'gathering_item_without_node';
    } else if (matchingNodes.length > 0) {
      classification = 'unusable_gathering_node';
    }

    unresolvedRows.push({
      name: materialName,
      slug,
      itemId: item.id,
      status: materialSource.status,
      classification,
      hasGatheringItemEntry: Boolean(gatheringItem),
      matchingGatheringNodeCount: matchingNodes.length,
      hasFishParameter: Boolean(fishParameter),
      detailedFishingSourceCount: detailedFishingSources.length,
      fishingLogEntryCount: fishingLogEntries.length,
      shopSourceCount: shopSources.length,
      notes,
    });
  }

  const summary = unresolvedRows.reduce((counts, row) => {
    counts[row.classification] = (counts[row.classification] ?? 0) + 1;
    return counts;
  }, {});

  const report = {
    generatedAt: new Date().toISOString(),
    totalUnresolved: unresolvedRows.length,
    summary,
    unresolved: unresolvedRows.sort((a, b) => {
      if (a.classification !== b.classification) {
        return a.classification.localeCompare(b.classification);
      }

      return a.name.localeCompare(b.name);
    }),
  };

  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  await fs.writeFile(
    path.resolve('src/data/materialSources.unresolved-report.json'),
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/materialSources.unresolved-report.json');
}

async function main() {
  const recipes = await readRecipes();
  const rawMaterials = getRawMaterialsFromRecipes(recipes);

  const targetMaterials = USE_SAMPLE_MATERIALS
    ? SAMPLE_MATERIALS.filter((name) => rawMaterials.includes(name))
    : rawMaterials;

  console.log(`Found ${rawMaterials.length} unique raw materials in recipes.json.`);
  console.log(
    `Building proof-of-concept sources for ${targetMaterials.length} ${
      USE_SAMPLE_MATERIALS ? 'sample' : 'total'
    } materials.`
  );

  const [
    itemsData,
    nodesData,
    gatheringItemsData,
    gatheringTypesData,
    mapsData,
    placesData,
    baitsData,
    fishesData,
    fishParameterData,
    fishingLogData,
    fishingSourcesData,
    fishingSpotsData,
  ] = await Promise.all([
    fetchJson('items.json', DATA_URLS.items),
    fetchJson('nodes.json', DATA_URLS.nodes),
    fetchJson('gathering-items.json', DATA_URLS.gatheringItems),
    fetchJson('gathering-types.json', DATA_URLS.gatheringTypes),
    fetchJson('maps.json', DATA_URLS.maps),
    fetchJson('places.json', DATA_URLS.places),
    fetchJson('baits.json', DATA_URLS.baits),
    fetchJson('fishes.json', DATA_URLS.fishes),
    fetchJson('fish-parameter.json', DATA_URLS.fishParameter),
    fetchJson('fishing-log.json', DATA_URLS.fishingLog),
    fetchJson('fishing-sources.json', DATA_URLS.fishingSources),
    fetchJson('fishing-spots.json', DATA_URLS.fishingSpots),
  ]);

  const optionalSourcesData = {
    mobsData: await fetchOptionalJson('mobs.json', DATA_URLS.mobs),
    monstersData: await fetchOptionalJson('monsters.json', DATA_URLS.monsters),
    dropsData: await fetchOptionalJson('drops.json', DATA_URLS.drops),
    monsterDropsData: await fetchOptionalJson('monster-drops.json', DATA_URLS.monsterDrops),
    mobDropsData: await fetchOptionalJson('mob-drops.json', DATA_URLS.mobDrops),
    itemDropsData: await fetchOptionalJson('item-drops.json', DATA_URLS.itemDrops),
    lootData: await fetchOptionalJson('loot.json', DATA_URLS.loot),
    dropSourcesData: await fetchOptionalJson('drop-sources.json', DATA_URLS.dropSources),

    shopsData: await fetchOptionalJson('shops.json', DATA_URLS.shops),
    shopsByNpcData: await fetchOptionalJson('shops-by-npc.json', DATA_URLS.shopsByNpc),
    npcsData: await fetchOptionalJson('npcs.json', DATA_URLS.npcs),
    vendorsData: await fetchOptionalJson('vendors.json', DATA_URLS.vendors),
    venturesData: await fetchOptionalJson('ventures.json', DATA_URLS.ventures),
    desynthData: await fetchOptionalJson('desynth.json', DATA_URLS.desynth),
    reductionData: await fetchOptionalJson('reduction.json', DATA_URLS.reduction),
    itemsSourcesData: await fetchOptionalJson(
      'items-sources.json',
      DATA_URLS.itemsSources
    ),
  };

  const itemNameIndex = buildItemNameIndex(itemsData);
  const itemIdIndex = buildItemIdIndex(itemsData);
  const gatheringItemIndex = buildGatheringItemIndex(gatheringItemsData);
  const fishParameterIndex = buildFishParameterIndex(fishParameterData);
  const fishingSpotIndex = buildFishingSpotIndex(fishingSpotsData);
  const fishingSourceIndex = buildFishingSourceIndex(fishingSourcesData);
  const fishingLogIndex = buildFishingLogIndex(fishingLogData);
  const npcIndex = buildNpcIndex(optionalSourcesData.npcsData, mapsData, placesData);
  const shopSourceIndex = buildShopSourceIndex(
    optionalSourcesData.shopsData,
    itemIdIndex,
    npcIndex
  );
  const nodes = asArray(nodesData);

  if (WRITE_DEBUG_FILES) {
    await writeDebugFiles({
      itemNameIndex,
      gatheringItemIndex,
      nodes,
      materialName: 'Spruce Log',
    });
  }

  if (WRITE_LOOKUP_DEBUG_FILES) {
    await writeLookupDebugFiles({
      mapsData,
      placesData,
    });
  }

  if (WRITE_FISHING_DEBUG_FILES) {
    await writeFishingDebugFiles({
      baitsData,
      fishesData,
      fishParameterData,
      fishingLogData,
      fishingSourcesData,
      fishingSpotsData,
    });
  }

if (WRITE_OPTIONAL_SOURCES_DEBUG_FILES) {
  await writeOptionalSourcesDebugFiles(optionalSourcesData);
}

await writeTeamcraftJsonCatalogDebugFile();

await writeMonsterDropDebugFile({
  itemNameIndex,
  optionalSourcesData,
});

  const materialSources = {};

  for (const materialName of targetMaterials) {
    const item = itemNameIndex.get(materialName.toLowerCase());

    if (!item) {
      materialSources[slugify(materialName)] = {
        name: materialName,
        itemId: null,
        sources: [],
        status: 'item_name_not_found_in_teamcraft_items',
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
      .filter(isUsefulSource);

    const fishingSources = findFishingSourcesForItem({
      itemId: item.id,
      fishingSourceIndex,
      fishParameterIndex,
      fishingSpotIndex,
      itemIdIndex,
      mapsData,
      placesData,
    });

    const shopSources = findShopSourcesForItem({
      itemId: item.id,
      shopSourceIndex,
    });

    const sources = [...gatheringSources, ...fishingSources, ...shopSources];

    materialSources[slugify(materialName)] = {
      name: materialName,
      itemId: item.id,
      sources,
      status:
        sources.length > 0
          ? 'ok'
          : matchingNodes.length > 0
            ? 'only_unusable_or_placeholder_gathering_sources_found'
            : 'no_gathering_source_found',
    };
  }

  await fs.mkdir(path.resolve('src/data'), { recursive: true });

  await fs.writeFile(
    path.resolve('src/data/materialSources.poc.json'),
    JSON.stringify(materialSources, null, 2),
    'utf8'
  );

  console.log('Wrote src/data/materialSources.poc.json');

  if (WRITE_UNRESOLVED_REPORT) {
    await writeUnresolvedReport({
      materialSources,
      targetMaterials,
      itemNameIndex,
      gatheringItemIndex,
      fishingSourceIndex,
      fishParameterIndex,
      fishingLogIndex,
      shopSourceIndex,
      nodes,
    });
  }

  const okCount = Object.values(materialSources).filter(
    (entry) => entry.status === 'ok'
  ).length;

  const noGatheringCount = Object.values(materialSources).filter(
    (entry) => entry.status === 'no_gathering_source_found'
  ).length;

  const unusableCount = Object.values(materialSources).filter(
    (entry) => entry.status === 'only_unusable_or_placeholder_gathering_sources_found'
  ).length;

  const itemNameNotFoundCount = Object.values(materialSources).filter(
    (entry) => entry.status === 'item_name_not_found_in_teamcraft_items'
  ).length;

  console.log('');
  console.log('Build summary:');
  console.log(` OK: ${okCount}`);
  console.log(` No gathering source found: ${noGatheringCount}`);
  console.log(` Placeholder/unusable gathering sources only: ${unusableCount}`);
  console.log(` Item name not found in Teamcraft items: ${itemNameNotFoundCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});