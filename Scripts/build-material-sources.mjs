import fs from 'node:fs/promises';
import path from 'node:path';

const TEAMCRAFT_BASE =
  'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json';

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  nodes: `${TEAMCRAFT_BASE}/nodes.json`,
  gatheringItems: `${TEAMCRAFT_BASE}/gathering-items.json`,
  gatheringTypes: `${TEAMCRAFT_BASE}/gathering-types.json`,
  maps: `${TEAMCRAFT_BASE}/maps.json`,
  places: `${TEAMCRAFT_BASE}/places.json`,
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

// Set this to true for the small 10-material test.
// Set this to false to build all raw materials from your recipes.
const USE_SAMPLE_MATERIALS = false;

// Set this to true when you want debug files for Spruce Log.
const WRITE_DEBUG_FILES = false;

// Set this to true while we inspect the map/place lookup file shapes.
const WRITE_LOOKUP_DEBUG_FILES = true;

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

  return null;
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

    // These readable names need lookup files in the next pass.
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

    // Temporary: useful while we finish the lookup mapping.
    debug: {
      rawType: node.type ?? null,
      gatheringType,
      base: node.base ?? null,
      radius: node.radius ?? null,
      hiddenItems: node.hiddenItems ?? [],
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
  ] = await Promise.all([
    fetchJson('items.json', DATA_URLS.items),
    fetchJson('nodes.json', DATA_URLS.nodes),
    fetchJson('gathering-items.json', DATA_URLS.gatheringItems),
    fetchJson('gathering-types.json', DATA_URLS.gatheringTypes),
    fetchJson('maps.json', DATA_URLS.maps),
    fetchJson('places.json', DATA_URLS.places),
  ]);

  const itemNameIndex = buildItemNameIndex(itemsData);
  const gatheringItemIndex = buildGatheringItemIndex(gatheringItemsData);
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

    const matchingNodes = nodes.filter((node) =>
      findNodeItemIds(node).has(item.id)
    );

    const gatheringItem = gatheringItemIndex.get(item.id);

    const sources = matchingNodes
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

  const okCount = Object.values(materialSources).filter(
    (entry) => entry.status === 'ok'
  ).length;

  const noGatheringCount = Object.values(materialSources).filter(
    (entry) => entry.status === 'no_gathering_source_found'
  ).length;

  const unusableCount = Object.values(materialSources).filter(
    (entry) =>
      entry.status === 'only_unusable_or_placeholder_gathering_sources_found'
  ).length;

  const itemNameNotFoundCount = Object.values(materialSources).filter(
    (entry) => entry.status === 'item_name_not_found_in_teamcraft_items'
  ).length;

  console.log('');
  console.log('Build summary:');
  console.log(`  OK: ${okCount}`);
  console.log(`  No gathering source found: ${noGatheringCount}`);
  console.log(`  Placeholder/unusable gathering sources only: ${unusableCount}`);
  console.log(`  Item name not found in Teamcraft items: ${itemNameNotFoundCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});