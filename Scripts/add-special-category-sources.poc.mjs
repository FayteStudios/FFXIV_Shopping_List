import fs from "node:fs/promises";
import path from "node:path";

const MATERIAL_SOURCES_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsAndLoot.poc.json"
);

const CATEGORY_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsAndLoot.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootAndSpecial.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootAndSpecial.unresolved-report.json"
);

const SPECIAL_CATEGORY_CONFIG = {
  flowerpot_or_housing_flowers: {
    sourceCategory: "Flowerpot / Housing Flowers",
    gatheringClass: "Special",
    gatheringType: "Housing Flowerpot",
    nodeType: "Flowerpot Gardening",
    acquisitionNote:
      "Housing flower item. Usually obtained by growing flower seeds in a flowerpot or garden plot.",
  },
  skybuilders_or_diadem: {
    sourceCategory: "Skybuilders / Diadem / Ishgard Restoration",
    gatheringClass: "Special",
    gatheringType: "Diadem",
    nodeType: "Diadem / Ishgard Restoration",
    acquisitionNote:
      "Ishgard Restoration material. Usually associated with the Diadem and Skybuilders' approved materials.",
  },
  project_collectible_materials: {
    sourceCategory: "Project / Quest / Custom Delivery Materials",
    gatheringClass: "Special",
    gatheringType: "Project / Quest Material",
    nodeType: "Special Project Material",
    acquisitionNote:
      "Special project, quest, custom delivery, or turn-in style material. This is not a normal gather/drop/shop material.",
  },
  gardening_or_seeds: {
    sourceCategory: "Gardening / Seeds / Growable Items",
    gatheringClass: "Special",
    gatheringType: "Gardening",
    nodeType: "Gardening",
    acquisitionNote:
      "Gardening or seed-related item. Usually obtained through gardening, crossbreeding, harvesting, or special seed sources.",
  },
};

const UNRESOLVED_STATUSES = new Set([
  "item_name_not_found_in_teamcraft_items",
  "only_unusable_or_placeholder_gathering_sources_found",
  "no_source_found",
]);

function readJsonFile(filePath) {
  return fs.readFile(filePath, "utf8").then((text) => JSON.parse(text));
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

function buildSpecialSource(categoryKey, material) {
  const config = SPECIAL_CATEGORY_CONFIG[categoryKey];

  if (!config) {
    return null;
  }

  return {
    type: "special",
    gatheringClass: config.gatheringClass,
    gatheringType: config.gatheringType,
    level: null,
    region: null,
    zone: null,
    zoneId: null,
    area: null,
    map: null,
    mapId: null,
    coordinates: null,
    nodeType: config.nodeType,
    timed: false,
    spawnTimes: [],
    duration: null,
    hidden: false,
    folklore: null,

    sourceCategory: config.sourceCategory,
    acquisitionNote: config.acquisitionNote,
    materialName: material.name ?? null,
    materialItemId: material.itemId ?? null,
  };
}

function getSpecialCategoryItems(categoryReport) {
  const items = [];

  for (const categoryKey of Object.keys(SPECIAL_CATEGORY_CONFIG)) {
    const category = categoryReport.categories?.[categoryKey];

    if (!category?.items) {
      continue;
    }

    for (const [materialKey, material] of Object.entries(category.items)) {
      items.push({
        categoryKey,
        materialKey,
        material,
      });
    }
  }

  return items;
}

function addSpecialSources(materialSources, categoryReport) {
  const output = structuredClone(materialSources);
  const specialAdditions = {};

  const specialCategoryItems = getSpecialCategoryItems(categoryReport);

  for (const categoryItem of specialCategoryItems) {
    const existingMaterial = output[categoryItem.materialKey];

    if (!existingMaterial) {
      continue;
    }

    if (!UNRESOLVED_STATUSES.has(existingMaterial.status)) {
      continue;
    }

    const specialSource = buildSpecialSource(
      categoryItem.categoryKey,
      existingMaterial
    );

    if (!specialSource) {
      continue;
    }

    const existingSources = Array.isArray(existingMaterial.sources)
      ? existingMaterial.sources
      : [];

    const mergedSources = mergeSources(existingSources, [specialSource]);

    output[categoryItem.materialKey] = {
      ...existingMaterial,
      sources: mergedSources,
      status: getCombinedStatus({
        ...existingMaterial,
        sources: mergedSources,
      }),
      debug: {
        ...(existingMaterial.debug ?? {}),
        specialSourceCategoryKey: categoryItem.categoryKey,
        specialSourceCategoryLabel:
          SPECIAL_CATEGORY_CONFIG[categoryItem.categoryKey].sourceCategory,
        specialSourceAdded: true,
      },
    };

    specialAdditions[categoryItem.materialKey] = {
      name: existingMaterial.name,
      itemId: existingMaterial.itemId ?? null,
      previousStatus: existingMaterial.status,
      newStatus: output[categoryItem.materialKey].status,
      categoryKey: categoryItem.categoryKey,
      categoryLabel:
        SPECIAL_CATEGORY_CONFIG[categoryItem.categoryKey].sourceCategory,
      source: specialSource,
    };
  }

  return {
    materialSources: output,
    specialAdditions,
  };
}

function countStatuses(materialSources) {
  return Object.values(materialSources).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
}

function buildUnresolvedReport(materialSources, previousStatusCounts, specialAdditions) {
  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      UNRESOLVED_STATUSES.has(entry.status)
    )
  );

  const statusCounts = countStatuses(materialSources);

  return {
    metadata: {
      sourceFile: "materialSources.withDropsShopsAndLoot.poc.json",
      categorySourceFile:
        "materialSources.withDropsShopsAndLoot.unresolved-categories.json",
      outputFile: "materialSources.withDropsShopsLootAndSpecial.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      unresolvedCount: Object.keys(unresolved).length,
      specialAdditionCount: Object.keys(specialAdditions).length,
      specialCategoryKeys: Object.keys(SPECIAL_CATEGORY_CONFIG),
      note: "This report shows unresolved materials after adding synthetic special-category sources for flowerpot, Skybuilders/Diadem, project/custom-delivery, and gardening items.",
    },
    previousStatusCounts,
    statusCounts,
    unresolved,
    specialAdditions,
  };
}

async function main() {
  console.log("Reading material source POC...");
  const existingMaterialSources = await readJsonFile(MATERIAL_SOURCES_INPUT_PATH);

  console.log("Reading unresolved category report...");
  const categoryReport = await readJsonFile(CATEGORY_REPORT_INPUT_PATH);

  const previousStatusCounts = countStatuses(existingMaterialSources);

  const { materialSources, specialAdditions } = addSpecialSources(
    existingMaterialSources,
    categoryReport
  );

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousStatusCounts,
    specialAdditions
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
  console.log(`Special additions: ${Object.keys(specialAdditions).length}`);
  console.log(`Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});