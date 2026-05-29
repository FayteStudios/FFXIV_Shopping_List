import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  instanceSources: `${TEAMCRAFT_BASE}/instance-sources.json`,
  reverseInstanceSources: `${TEAMCRAFT_BASE}/reverse-instance-sources.json`,
  instances: `${TEAMCRAFT_BASE}/instances.json`,
};

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCrafted.poc.json"
);

const CATEGORY_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCrafted.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstances.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstances.unresolved-report.json"
);

const TARGET_CATEGORY_KEYS = new Set([
  "raid_trial_dungeon_or_special_loot",
  "uncategorized",
]);

const MAX_INSTANCE_SOURCES_PER_MATERIAL = 25;

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

function buildItemIndex(itemsData) {
  const index = new Map();

  for (const item of asArray(itemsData)) {
    const id = pickFirstNumber(item.id, item.row_id, item.rowId, item.ID);
    const name = getLocalizedName(item);

    if (id !== null) {
      index.set(id, {
        id,
        name,
        raw: item,
      });
    }
  }

  return index;
}

function buildInstanceIndex(instancesData) {
  const index = new Map();

  for (const instance of asArray(instancesData)) {
    const id = pickFirstNumber(instance.id, instance.row_id, instance.rowId, instance.ID);
    const name = getLocalizedName(instance);

    if (id !== null) {
      index.set(id, {
        id,
        name,
        level: pickFirstNumber(
          instance.level,
          instance.lvl,
          instance.minLevel,
          instance.min_level
        ),
        raw: instance,
      });
    }
  }

  return index;
}

function collectNumbersDeep(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNumbersDeep(entry, output);
    }

    return output;
  }

  if (typeof value === "number" || typeof value === "string") {
    const number = Number(value);

    if (Number.isFinite(number)) {
      output.push(number);
    }

    return output;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      collectNumbersDeep(nestedValue, output);
    }
  }

  return output;
}

function getDirectEntry(data, key) {
  return data?.[String(key)] ?? data?.[key] ?? null;
}

function getInstanceIdsFromReverseSources(reverseInstanceSourcesData, itemId) {
  const directEntry = getDirectEntry(reverseInstanceSourcesData, itemId);

  if (!directEntry) {
    return [];
  }

  return [...new Set(collectNumbersDeep(directEntry))];
}

function getInstanceIdsFromInstanceSources(instanceSourcesData, itemId) {
  const id = Number(itemId);

  if (!Number.isFinite(id)) {
    return [];
  }

  const instanceIds = new Set();

  const directEntry = getDirectEntry(instanceSourcesData, id);

  if (directEntry) {
    for (const instanceId of collectNumbersDeep(directEntry)) {
      instanceIds.add(instanceId);
    }
  }

  for (const [instanceIdText, sourceData] of Object.entries(
    instanceSourcesData ?? {}
  )) {
    const instanceId = Number(instanceIdText);

    if (!Number.isFinite(instanceId)) {
      continue;
    }

    const numbers = collectNumbersDeep(sourceData);

    if (numbers.includes(id)) {
      instanceIds.add(instanceId);
    }
  }

  return [...instanceIds];
}

function classifyInstanceName(name) {
  const text = String(name ?? "").toLowerCase();

  if (text.includes("savage")) {
    return "Raid";
  }

  if (text.includes("coil") || text.includes("alexander") || text.includes("omega")) {
    return "Raid";
  }

  if (text.includes("extreme") || text.includes("minstrel")) {
    return "Trial";
  }

  if (text.includes("ultimate")) {
    return "Ultimate";
  }

  if (text.includes("dungeon")) {
    return "Dungeon";
  }

  return "Instance";
}

function normalizeInstanceSource(instanceId, material, instanceIndex) {
  const instance = instanceIndex.get(instanceId);
  const instanceName = instance?.name ?? null;
  const instanceCategory = classifyInstanceName(instanceName);

  return {
    type: "instance",
    gatheringClass: "Instance",
    gatheringType: instanceCategory,
    level: instance?.level ?? null,
    region: null,
    zone: instanceName,
    zoneId: null,
    area: instanceName,
    map: instanceName,
    mapId: null,
    coordinates: null,
    nodeType: `${instanceCategory} Loot`,
    timed: false,
    spawnTimes: [],
    duration: null,
    hidden: false,
    folklore: null,

    instanceId,
    instanceName,
    instanceCategory,
    materialItemId: material.itemId ?? null,
    materialName: material.name ?? null,
  };
}

function getInstanceSourcesForMaterial(
  material,
  instanceSourcesData,
  reverseInstanceSourcesData,
  instanceIndex
) {
  const itemId = Number(material.itemId);

  if (!Number.isFinite(itemId)) {
    return [];
  }

  const instanceIds = new Set([
    ...getInstanceIdsFromReverseSources(reverseInstanceSourcesData, itemId),
    ...getInstanceIdsFromInstanceSources(instanceSourcesData, itemId),
  ]);

  return [...instanceIds]
    .slice(0, MAX_INSTANCE_SOURCES_PER_MATERIAL)
    .map((instanceId) => normalizeInstanceSource(instanceId, material, instanceIndex));
}

function getTargetMaterialsFromCategories(categoryReport) {
  const targets = [];

  for (const [categoryKey, category] of Object.entries(
    categoryReport.categories ?? {}
  )) {
    if (!TARGET_CATEGORY_KEYS.has(categoryKey)) {
      continue;
    }

    for (const [materialKey, material] of Object.entries(category.items ?? {})) {
      targets.push({
        categoryKey,
        materialKey,
        name: material.name,
        itemId: Number(material.itemId),
        status: material.status,
      });
    }
  }

  return targets.filter((target) => Number.isFinite(target.itemId));
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
    hasSourceType(sources, "crafted") ? "crafted" : null,
    hasSourceType(sources, "instance") ? "instance" : null,
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
  if (source.type === "instance") {
    return [
      "instance",
      source.instanceId,
      source.materialItemId,
      source.instanceCategory,
    ].join("|");
  }

  if (source.type === "crafted") {
    return [
      "crafted",
      source.recipeId,
      source.resultItemId,
      source.recipeJobId,
      source.amountCreated,
    ].join("|");
  }

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

function addInstanceSources(
  materialSources,
  categoryReport,
  instanceSourcesData,
  reverseInstanceSourcesData,
  instanceIndex
) {
  const output = structuredClone(materialSources);
  const instanceAdditions = {};
  const instanceMisses = {};

  const targets = getTargetMaterialsFromCategories(categoryReport);

  for (const target of targets) {
    const existingMaterial = output[target.materialKey];

    if (!existingMaterial) {
      continue;
    }

    if (!UNRESOLVED_STATUSES.has(existingMaterial.status)) {
      continue;
    }

    const instanceSources = getInstanceSourcesForMaterial(
      existingMaterial,
      instanceSourcesData,
      reverseInstanceSourcesData,
      instanceIndex
    );

    if (instanceSources.length === 0) {
      instanceMisses[target.materialKey] = {
        name: existingMaterial.name,
        itemId: existingMaterial.itemId ?? null,
        status: existingMaterial.status,
        categoryKey: target.categoryKey,
      };

      continue;
    }

    const existingSources = Array.isArray(existingMaterial.sources)
      ? existingMaterial.sources
      : [];

    const mergedSources = mergeSources(existingSources, instanceSources);

    output[target.materialKey] = {
      ...existingMaterial,
      sources: mergedSources,
      status: getCombinedStatus({
        ...existingMaterial,
        sources: mergedSources,
      }),
      debug: {
        ...(existingMaterial.debug ?? {}),
        instanceSourceAdded: true,
        instanceSourceCount: instanceSources.length,
        addedInstanceSourceCount: Math.max(
          0,
          mergedSources.length - existingSources.length
        ),
        instanceSourcesTruncated:
          getInstanceSourcesForMaterial(
            existingMaterial,
            instanceSourcesData,
            reverseInstanceSourcesData,
            instanceIndex
          ).length > MAX_INSTANCE_SOURCES_PER_MATERIAL,
      },
    };

    instanceAdditions[target.materialKey] = {
      name: existingMaterial.name,
      itemId: existingMaterial.itemId ?? null,
      previousStatus: existingMaterial.status,
      newStatus: output[target.materialKey].status,
      categoryKey: target.categoryKey,
      instanceSourceCount: instanceSources.length,
      addedInstanceSourceCount:
        output[target.materialKey].debug.addedInstanceSourceCount,
      sampleInstanceSources: instanceSources.slice(0, 5),
    };
  }

  return {
    materialSources: output,
    instanceAdditions,
    instanceMisses,
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
  instanceAdditions,
  instanceMisses
) {
  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      UNRESOLVED_STATUSES.has(entry.status)
    )
  );

  const statusCounts = countStatuses(materialSources);

  return {
    metadata: {
      sourceFile: "materialSources.withDropsShopsLootSpecialAndFishingCrafted.poc.json",
      categorySourceFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCrafted.unresolved-categories.json",
      outputFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstances.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      unresolvedCount: Object.keys(unresolved).length,
      instanceAdditionCount: Object.keys(instanceAdditions).length,
      instanceMissCount: Object.keys(instanceMisses).length,
      maxInstanceSourcesPerMaterial: MAX_INSTANCE_SOURCES_PER_MATERIAL,
      note: "This report shows unresolved materials after adding dungeon, raid, trial, and instance sources from Teamcraft instance-sources.json and reverse-instance-sources.json.",
    },
    previousStatusCounts,
    statusCounts,
    unresolved,
    instanceAdditions,
    instanceMisses,
  };
}

async function main() {
  console.log("Reading crafted-enhanced material source POC...");
  const existingMaterialSources = await readJson(INPUT_PATH);
  const categoryReport = await readJson(CATEGORY_REPORT_INPUT_PATH);
  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log(
    `Loaded ${Object.keys(existingMaterialSources).length} material source entries.`
  );

  console.log("");
  console.log("Fetching Teamcraft instance source data...");

  const [itemsData, instanceSourcesData, reverseInstanceSourcesData, instancesData] =
    await Promise.all([
      fetchJson("items.json", DATA_URLS.items),
      fetchJson("instance-sources.json", DATA_URLS.instanceSources),
      fetchJson("reverse-instance-sources.json", DATA_URLS.reverseInstanceSources),
      fetchJson("instances.json", DATA_URLS.instances),
    ]);

  buildItemIndex(itemsData);
  const instanceIndex = buildInstanceIndex(instancesData);

  const { materialSources, instanceAdditions, instanceMisses } =
    addInstanceSources(
      existingMaterialSources,
      categoryReport,
      instanceSourcesData,
      reverseInstanceSourcesData,
      instanceIndex
    );

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousStatusCounts,
    instanceAdditions,
    instanceMisses
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
  console.log(`Instance additions: ${Object.keys(instanceAdditions).length}`);
  console.log(`Instance misses: ${Object.keys(instanceMisses).length}`);
  console.log(`Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});