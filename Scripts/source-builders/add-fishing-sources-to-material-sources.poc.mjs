import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  fishingSpots: `${TEAMCRAFT_BASE}/fishing-spots.json`,
  maps: `${TEAMCRAFT_BASE}/maps.json`,
  places: `${TEAMCRAFT_BASE}/places.json`,
};

const MATERIAL_SOURCES_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootAndSpecial.poc.json"
);

const CATEGORY_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootAndSpecial.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishing.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishing.unresolved-report.json"
);

const FISH_CATEGORY_KEY = "fish_or_ocean_items";

const MAX_FISHING_SOURCES_PER_MATERIAL = 25;

const UNRESOLVED_STATUSES = new Set([
  "item_name_not_found_in_teamcraft_items",
  "only_unusable_or_placeholder_gathering_sources_found",
  "no_source_found",
]);

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, data]) => {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return {
          id,
          ...data,
        };
      }

      return {
        id,
        value: data,
      };
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

  if (typeof value.singular === "string") {
    return value.singular.trim() || null;
  }

  if (value.singular) {
    return getLocalizedName(value.singular);
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

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
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

function getFishingSpotCategoryName(categoryId) {
  const id = Number(categoryId);

  const categoryNames = {
    1: "Ocean Fishing",
    2: "Freshwater Fishing",
    3: "Dunefishing",
    4: "Skyfishing",
    5: "Cloudfishing",
    6: "Aetherfishing",
    7: "Hellfishing",
    8: "Magma Fishing",
    9: "Aetherochemical Fishing",
    10: "Saltfishing",
    11: "Spearfishing",
  };

  return categoryNames[id] ?? "Fishing";
}

function normalizeFishingSpotLocation(spot, mapsData, placesData) {
  const mapId = pickFirstNumber(spot.mapId, spot.map_id, spot.map);
  const placeId = pickFirstNumber(spot.placeId, spot.place_id, spot.place);
  const zoneId = pickFirstNumber(spot.zoneId, spot.zone_id, spot.zone);

  const x = pickFirstNumber(spot.coords?.x, spot.x, spot.mapX, spot.map_x);
  const y = pickFirstNumber(spot.coords?.y, spot.y, spot.mapY, spot.map_y);

  const mapInfo = getMapInfo(mapId, mapsData, placesData);

  return {
    region: mapInfo.regionName,
    zone: mapInfo.mapName ?? getEnglishPlaceName(placeId, placesData),
    area:
      getEnglishPlaceName(zoneId, placesData) ??
      getEnglishPlaceName(placeId, placesData) ??
      mapInfo.subPlaceName,
    mapId,
    placeId,
    zoneId,
    coordinates:
      x !== null || y !== null
        ? {
            x,
            y,
          }
        : null,
  };
}

function buildFishingSourceIndex(fishingSpotsData, mapsData, placesData) {
  const sourceIndex = new Map();
  const fishingSpots = asArray(fishingSpotsData);

  for (const spot of fishingSpots) {
    const fishIds = Array.isArray(spot.fishes)
      ? spot.fishes.map((fishId) => Number(fishId)).filter(Number.isFinite)
      : [];

    if (fishIds.length === 0) {
      continue;
    }

    const location = normalizeFishingSpotLocation(spot, mapsData, placesData);
    const fishingCategory = getFishingSpotCategoryName(spot.category);

    for (const fishId of fishIds) {
      if (!sourceIndex.has(fishId)) {
        sourceIndex.set(fishId, []);
      }

      sourceIndex.get(fishId).push({
        type: "fishing",
        gatheringClass: "Fisher",
        gatheringType: fishingCategory,
        level: pickFirstNumber(spot.level),
        region: location.region,
        zone: location.zone,
        zoneId: location.zoneId,
        area: location.area,
        map: location.zone,
        mapId: location.mapId,
        coordinates: location.coordinates,
        nodeType: "Fishing Spot",
        timed: false,
        spawnTimes: [],
        duration: null,
        hidden: false,
        folklore: null,

        fishingSpotId: pickFirstNumber(spot.id),
        fishingSpotCategory: fishingCategory,
        placeId: location.placeId,
        radius: pickFirstNumber(spot.radius),
        fishItemId: fishId,
      });
    }
  }

  return sourceIndex;
}

function getFishingCategoryTargets(categoryReport) {
  const category = categoryReport.categories?.[FISH_CATEGORY_KEY];

  if (!category?.items) {
    return [];
  }

  return Object.entries(category.items)
    .map(([materialKey, material]) => ({
      materialKey,
      name: material.name,
      itemId: Number(material.itemId),
      status: material.status,
    }))
    .filter((item) => Number.isFinite(item.itemId));
}

function getFishingSourcesForMaterial(material, fishingSourceIndex) {
  const itemId = Number(material.itemId);

  if (!Number.isFinite(itemId)) {
    return [];
  }

  return (fishingSourceIndex.get(itemId) ?? []).slice(
    0,
    MAX_FISHING_SOURCES_PER_MATERIAL
  );
}

function hasSourceType(sources, type) {
  return sources.some((source) => source.type === type);
}

function getSourceTypeLabels(sources) {
  return [
    hasSourceType(sources, "gathering") ? "gathering" : null,
    hasSourceType(sources, "monsterDrop") ? "monster_drop" : null,
    hasSourceType(sources, "shop") ? "shop" : null,
    hasSourceType(sources, "loot") ? "loot" : null,
    hasSourceType(sources, "special") ? "special" : null,
    hasSourceType(sources, "fishing") ? "fishing" : null,
  ].filter(Boolean);
}

function getCombinedStatus(material) {
  const sources = Array.isArray(material.sources) ? material.sources : [];

  if (!material.itemId) {
    return "item_name_not_found_in_teamcraft_items";
  }

  const sourceTypeLabels = getSourceTypeLabels(sources);

  if (sourceTypeLabels.length > 0) {
    return `ok_${sourceTypeLabels.join("_and_")}_sources_found`;
  }

  if (material.status === "only_unusable_or_placeholder_gathering_sources_found") {
    return "only_unusable_or_placeholder_gathering_sources_found";
  }

  return "no_source_found";
}

function sourceSignature(source) {
  if (source.type === "fishing") {
    return [
      "fishing",
      source.fishingSpotId,
      source.fishItemId,
      source.mapId,
      source.zoneId,
      source.coordinates?.x,
      source.coordinates?.y,
    ].join("|");
  }

  if (source.type === "special") {
    return [
      "special",
      source.sourceCategory,
      source.gatheringType,
      source.nodeType,
    ].join("|");
  }

  if (source.type === "loot") {
    return ["loot", source.sourceItemId, source.sourceItemName].join("|");
  }

  if (source.type === "shop") {
    return [
      "shop",
      source.shopType,
      source.shopId,
      source.tradeIndex,
      source.purchasedItem?.itemId,
      source.priceText,
    ].join("|");
  }

  if (source.type === "monsterDrop") {
    return ["monsterDrop", source.monsterId, source.monsterName].join("|");
  }

  if (source.type === "gathering") {
    return [
      "gathering",
      source.gatheringClass,
      source.mapId,
      source.zoneId,
      source.coordinates?.x,
      source.coordinates?.y,
    ].join("|");
  }

  return JSON.stringify(source);
}

function mergeSources(existingSources, newSources) {
  const output = [];
  const seen = new Set();

  for (const source of [...existingSources, ...newSources]) {
    const signature = sourceSignature(source);

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    output.push(source);
  }

  return output;
}

function addFishingSources(materialSources, categoryReport, fishingSourceIndex) {
  const output = structuredClone(materialSources);
  const fishingAdditions = {};
  const fishingMisses = {};

  const targets = getFishingCategoryTargets(categoryReport);

  for (const target of targets) {
    const existingMaterial = output[target.materialKey];

    if (!existingMaterial) {
      continue;
    }

    if (!UNRESOLVED_STATUSES.has(existingMaterial.status)) {
      continue;
    }

    const fishingSources = getFishingSourcesForMaterial(
      existingMaterial,
      fishingSourceIndex
    );

    if (fishingSources.length === 0) {
      fishingMisses[target.materialKey] = {
        name: existingMaterial.name,
        itemId: existingMaterial.itemId ?? null,
        status: existingMaterial.status,
      };

      continue;
    }

    const existingSources = Array.isArray(existingMaterial.sources)
      ? existingMaterial.sources
      : [];

    const mergedSources = mergeSources(existingSources, fishingSources);

    output[target.materialKey] = {
      ...existingMaterial,
      sources: mergedSources,
      status: getCombinedStatus({
        ...existingMaterial,
        sources: mergedSources,
      }),
      debug: {
        ...(existingMaterial.debug ?? {}),
        fishingSourceAdded: true,
        fishingSourceCount: fishingSources.length,
        addedFishingSourceCount: Math.max(
          0,
          mergedSources.length - existingSources.length
        ),
        fishingSourcesTruncated:
          (fishingSourceIndex.get(Number(existingMaterial.itemId)) ?? []).length >
          MAX_FISHING_SOURCES_PER_MATERIAL,
      },
    };

    fishingAdditions[target.materialKey] = {
      name: existingMaterial.name,
      itemId: existingMaterial.itemId ?? null,
      previousStatus: existingMaterial.status,
      newStatus: output[target.materialKey].status,
      fishingSourceCount: fishingSources.length,
      addedFishingSourceCount:
        output[target.materialKey].debug.addedFishingSourceCount,
      sampleFishingSources: fishingSources.slice(0, 5),
    };
  }

  return {
    materialSources: output,
    fishingAdditions,
    fishingMisses,
  };
}

function countStatuses(materialSources) {
  return Object.values(materialSources).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
}

function buildUnresolvedReport(
  materialSources,
  previousStatusCounts,
  fishingAdditions,
  fishingMisses
) {
  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      UNRESOLVED_STATUSES.has(entry.status)
    )
  );

  const statusCounts = countStatuses(materialSources);

  return {
    metadata: {
      sourceFile: "materialSources.withDropsShopsLootAndSpecial.poc.json",
      categorySourceFile:
        "materialSources.withDropsShopsLootAndSpecial.unresolved-categories.json",
      outputFile:
        "materialSources.withDropsShopsLootSpecialAndFishing.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      unresolvedCount: Object.keys(unresolved).length,
      fishingAdditionCount: Object.keys(fishingAdditions).length,
      fishingMissCount: Object.keys(fishingMisses).length,
      maxFishingSourcesPerMaterial: MAX_FISHING_SOURCES_PER_MATERIAL,
      note: "This report shows unresolved materials after adding fishing sources from Teamcraft fishing-spots.json.",
    },
    previousStatusCounts,
    statusCounts,
    unresolved,
    fishingAdditions,
    fishingMisses,
  };
}

async function main() {
  console.log("Reading material source POC...");
  const existingMaterialSources = await readJson(MATERIAL_SOURCES_INPUT_PATH);

  console.log("Reading unresolved category report...");
  const categoryReport = await readJson(CATEGORY_REPORT_INPUT_PATH);

  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log("");
  console.log("Fetching Teamcraft fishing spot/map/place data...");

  const [fishingSpotsData, mapsData, placesData] = await Promise.all([
    fetchJson("fishing-spots.json", DATA_URLS.fishingSpots),
    fetchJson("maps.json", DATA_URLS.maps),
    fetchJson("places.json", DATA_URLS.places),
  ]);

  const fishingSourceIndex = buildFishingSourceIndex(
    fishingSpotsData,
    mapsData,
    placesData
  );

  console.log(
    `Indexed ${fishingSourceIndex.size} fish item IDs from fishing spots.`
  );

  const { materialSources, fishingAdditions, fishingMisses } =
    addFishingSources(existingMaterialSources, categoryReport, fishingSourceIndex);

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousStatusCounts,
    fishingAdditions,
    fishingMisses
  );

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(materialSources, null, 2), "utf8");

  await fs.writeFile(
    UNRESOLVED_REPORT_PATH,
    JSON.stringify(unresolvedReport, null, 2),
    "utf8"
  );

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${UNRESOLVED_REPORT_PATH}`);
  console.log("");
  console.log("Previous status summary:");

  for (const [status, count] of Object.entries(previousStatusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log("");
  console.log("New status summary:");

  for (const [status, count] of Object.entries(unresolvedReport.statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log("");
  console.log(`Fishing additions: ${Object.keys(fishingAdditions).length}`);
  console.log(`Fishing misses: ${Object.keys(fishingMisses).length}`);
  console.log(`Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});