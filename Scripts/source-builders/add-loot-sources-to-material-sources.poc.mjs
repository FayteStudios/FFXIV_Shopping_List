import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  lootSources: `${TEAMCRAFT_BASE}/loot-sources.json`,
};

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsAndShops.poc.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsAndLoot.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsAndLoot.unresolved-report.json"
);

const MAX_LOOT_SOURCES_PER_MATERIAL = 25;

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

  if (typeof value.singular === "string") {
    return value.singular.trim() || null;
  }

  if (value.singular) {
    return getLocalizedName(value.singular);
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

function buildItemIndex(itemsData) {
  const index = new Map();

  for (const item of asArray(itemsData)) {
    const id = Number(item.id ?? item.row_id ?? item.rowId ?? item.ID);
    const name = getLocalizedName(item);

    if (Number.isFinite(id)) {
      index.set(id, {
        id,
        name,
        raw: item,
      });
    }
  }

  return index;
}

function getLootSourceIdsForMaterial(lootSourcesData, itemId) {
  const id = Number(itemId);

  if (!Number.isFinite(id)) {
    return [];
  }

  const directEntry =
    lootSourcesData?.[String(id)] ?? lootSourcesData?.[id] ?? null;

  if (!Array.isArray(directEntry)) {
    return [];
  }

  return directEntry
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function classifyLootSourceName(name) {
  const text = String(name ?? "").toLowerCase();

  if (text.includes("timeworn") && text.includes("map")) {
    return "Treasure Map";
  }

  if (text.includes("lockbox")) {
    return "Lockbox";
  }

  if (text.includes("sack")) {
    return "Deep Dungeon Sack";
  }

  if (text.includes("materiel container")) {
    return "Materiel Container";
  }

  if (text.includes("container")) {
    return "Container";
  }

  return "Loot Source";
}

function normalizeLootSource(lootSourceId, itemIndex) {
  const item = itemIndex.get(lootSourceId);

  return {
    type: "loot",
    gatheringClass: "Loot",
    gatheringType: classifyLootSourceName(item?.name),
    level: null,
    region: null,
    zone: null,
    zoneId: null,
    area: null,
    map: null,
    mapId: null,
    coordinates: null,
    nodeType: "Loot Source",
    timed: false,
    spawnTimes: [],
    duration: null,
    hidden: false,
    folklore: null,

    sourceItemId: lootSourceId,
    sourceItemName: item?.name ?? null,
    sourceCategory: classifyLootSourceName(item?.name),
  };
}

function getLootSourcesForMaterial(material, lootSourcesData, itemIndex) {
  const lootSourceIds = getLootSourceIdsForMaterial(
    lootSourcesData,
    material.itemId
  );

  return lootSourceIds
    .slice(0, MAX_LOOT_SOURCES_PER_MATERIAL)
    .map((lootSourceId) => normalizeLootSource(lootSourceId, itemIndex));
}

function sourceSignature(source) {
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

function mergeSources(existingSources, lootSources) {
  const output = [];
  const seen = new Set();

  for (const source of [...existingSources, ...lootSources]) {
    const signature = sourceSignature(source);

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    output.push(source);
  }

  return output;
}

function hasSourceType(sources, type) {
  return sources.some((source) => source.type === type);
}

function getCombinedStatus(material) {
  const sources = Array.isArray(material.sources) ? material.sources : [];

  if (!material.itemId) {
    return "item_name_not_found_in_teamcraft_items";
  }

  const sourceTypes = [
    hasSourceType(sources, "gathering") ? "gathering" : null,
    hasSourceType(sources, "monsterDrop") ? "monster_drop" : null,
    hasSourceType(sources, "shop") ? "shop" : null,
    hasSourceType(sources, "loot") ? "loot" : null,
  ].filter(Boolean);

  if (sourceTypes.length > 0) {
    return `ok_${sourceTypes.join("_and_")}_sources_found`;
  }

  if (material.status === "only_unusable_or_placeholder_gathering_sources_found") {
    return "only_unusable_or_placeholder_gathering_sources_found";
  }

  return "no_source_found";
}

function addLootSourcesToMaterialSources(
  existingMaterialSources,
  lootSourcesData,
  itemIndex
) {
  const output = {};
  const lootAdditions = {};

  for (const [materialKey, material] of Object.entries(existingMaterialSources)) {
    const existingSources = Array.isArray(material.sources)
      ? material.sources
      : [];

    const lootSources = getLootSourcesForMaterial(
      material,
      lootSourcesData,
      itemIndex
    );

    const mergedSources = mergeSources(existingSources, lootSources);

    output[materialKey] = {
      ...material,
      sources: mergedSources,
      status: getCombinedStatus({
        ...material,
        sources: mergedSources,
      }),
      debug: {
        ...(material.debug ?? {}),
        lootSourceCount: lootSources.length,
        addedLootSourceCount: Math.max(
          0,
          mergedSources.length - existingSources.length
        ),
        lootSourcesTruncated:
          getLootSourceIdsForMaterial(lootSourcesData, material.itemId).length >
          MAX_LOOT_SOURCES_PER_MATERIAL,
      },
    };

    if (lootSources.length > 0) {
      lootAdditions[materialKey] = {
        name: material.name,
        itemId: material.itemId,
        previousStatus: material.status,
        newStatus: output[materialKey].status,
        addedLootSourceCount: output[materialKey].debug.addedLootSourceCount,
        lootSourceCount: lootSources.length,
        sampleLootSources: lootSources.slice(0, 5),
      };
    }
  }

  return {
    materialSources: output,
    lootAdditions,
  };
}

function countStatuses(materialSources) {
  return Object.values(materialSources).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
}

function buildUnresolvedReport(materialSources, previousStatusCounts, lootAdditions) {
  const unresolvedStatuses = new Set([
    "item_name_not_found_in_teamcraft_items",
    "only_unusable_or_placeholder_gathering_sources_found",
    "no_source_found",
  ]);

  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      unresolvedStatuses.has(entry.status)
    )
  );

  const statusCounts = countStatuses(materialSources);

  return {
    metadata: {
      sourceFile: "materialSources.withDropsAndShops.poc.json",
      outputFile: "materialSources.withDropsShopsAndLoot.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      unresolvedCount: Object.keys(unresolved).length,
      lootAdditionCount: Object.keys(lootAdditions).length,
      maxLootSourcesPerMaterial: MAX_LOOT_SOURCES_PER_MATERIAL,
      note: "This report shows unresolved materials after adding loot/container/map/lockbox sources from Teamcraft loot-sources.json.",
    },
    previousStatusCounts,
    statusCounts,
    unresolved,
    lootAdditions,
  };
}

async function main() {
  console.log("Reading existing gathering + monster-drop + shop source POC...");
  const existingMaterialSources = await readJson(INPUT_PATH);
  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log(
    `Loaded ${Object.keys(existingMaterialSources).length} material source entries.`
  );

  console.log("");
  console.log("Fetching Teamcraft loot source and item data...");

  const [lootSourcesData, itemsData] = await Promise.all([
    fetchJson("loot-sources.json", DATA_URLS.lootSources),
    fetchJson("items.json", DATA_URLS.items),
  ]);

  const itemIndex = buildItemIndex(itemsData);

  const { materialSources, lootAdditions } = addLootSourcesToMaterialSources(
    existingMaterialSources,
    lootSourcesData,
    itemIndex
  );

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousStatusCounts,
    lootAdditions
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
  console.log(`Loot additions: ${Object.keys(lootAdditions).length}`);
  console.log(`Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});