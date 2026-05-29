import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.poc.json"
);

const PREVIOUS_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.unresolved-report.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinalManual.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinalManual.unresolved-report.json"
);

const UNRESOLVED_STATUSES = new Set([
  "item_name_not_found_in_teamcraft_items",
  "only_unusable_or_placeholder_gathering_sources_found",
  "no_source_found",
]);

const MANUAL_FINAL_FIXES = {
  "approved-grade-4-artisanal-skybuilders-jade": {
    sourceCategoryKey: "skybuilders_or_diadem_manual",
    sourceCategory: "Skybuilders / Diadem / Ishgard Restoration",
    gatheringType: "Diadem",
    nodeType: "Diadem / Ishgard Restoration",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Already classified as an Ishgard Restoration / Diadem material, but item ID did not resolve in Teamcraft data. Treat as special restoration material.",
  },

  "grade-2-artisanal-skybuilders-scrip": {
    sourceCategoryKey: "skybuilders_or_diadem_manual",
    sourceCategory: "Skybuilders / Diadem / Ishgard Restoration",
    gatheringType: "Diadem",
    nodeType: "Diadem / Ishgard Restoration",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Already classified as an Ishgard Restoration / Diadem material, but item ID did not resolve in Teamcraft data. Treat as special restoration material.",
  },

  "birch-log": {
    sourceCategoryKey: "manual_gathering_fallback",
    sourceCategory: "Manual Gathering Fallback",
    gatheringType: "Logging",
    nodeType: "Gathering Node",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Earlier gathering pass found matching gathering nodes but rejected them as placeholders. Treat as normal Botanist logging material pending exact node cleanup.",
  },

  "cyclops-onion": {
    sourceCategoryKey: "manual_gathering_fallback",
    sourceCategory: "Manual Gathering Fallback",
    gatheringType: "Harvesting",
    nodeType: "Gathering Node",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Earlier gathering pass found matching gathering nodes but rejected them as placeholders. Treat as normal Botanist harvesting material pending exact node cleanup.",
  },

  "emerald-beans": {
    sourceCategoryKey: "manual_gathering_fallback",
    sourceCategory: "Manual Gathering Fallback",
    gatheringType: "Harvesting",
    nodeType: "Gathering Node",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Earlier gathering pass found matching gathering nodes but rejected them as placeholders. Treat as normal Botanist harvesting material pending exact node cleanup.",
  },

  "titanium-ore": {
    sourceCategoryKey: "manual_gathering_fallback",
    sourceCategory: "Manual Gathering Fallback",
    gatheringType: "Mining",
    nodeType: "Gathering Node",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Earlier gathering pass found matching gathering nodes but rejected them as placeholders. Treat as normal Miner material pending exact node cleanup.",
  },

  "pure-titanium-ore": {
    sourceCategoryKey: "manual_special_material",
    sourceCategory: "Manual Special Material",
    gatheringType: "Special Material",
    nodeType: "Manual Special Material",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Source was not found by gathering, shop, drop, loot, instance, recipe, or special-source passes. Keep as manual special material pending exact verification.",
  },

  mogpom: {
    sourceCategoryKey: "manual_special_material",
    sourceCategory: "Manual Special Material",
    gatheringType: "Special Material",
    nodeType: "Manual Special Material",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Source was not found by gathering, shop, drop, loot, instance, recipe, fishing, or broad special-source passes. Keep as manual special material pending exact verification.",
  },

  "vintage-cooking-sherry": {
    sourceCategoryKey: "manual_special_material",
    sourceCategory: "Manual Special Material",
    gatheringType: "Special Material",
    nodeType: "Manual Special Material",
    confidence: "manual",
    acquisitionNote:
      "Manual final fix. Source was not found by gathering, shop, drop, loot, instance, recipe, fishing, or broad special-source passes. Keep as manual special material pending exact verification.",
  },
};

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function sourceSignature(source) {
  if (source.type === "special") {
    return [
      "special",
      source.sourceCategoryKey,
      source.sourceCategory,
      source.gatheringType,
      source.nodeType,
      source.materialItemId,
      source.materialName,
    ].join("|");
  }

  if (source.type === "gathering") {
    return [
      "gathering",
      source.gatheringClass,
      source.gatheringType,
      source.mapId,
      source.zoneId,
      source.coordinates?.x,
      source.coordinates?.y,
    ].join("|");
  }

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
  const sourceTypeLabels = getSourceTypeLabels(sources);

  if (sourceTypeLabels.length > 0) {
    return `ok_${sourceTypeLabels.join("_and_")}_sources_found`;
  }

  if (!material.itemId) {
    return "item_name_not_found_in_teamcraft_items";
  }

  if (material.status === "only_unusable_or_placeholder_gathering_sources_found") {
    return "only_unusable_or_placeholder_gathering_sources_found";
  }

  return "no_source_found";
}

function buildManualSpecialSource(material, fix) {
  return {
    type: "special",
    gatheringClass: "Special",
    gatheringType: fix.gatheringType,
    level: null,
    region: null,
    zone: null,
    zoneId: null,
    area: null,
    map: null,
    mapId: null,
    coordinates: null,
    nodeType: fix.nodeType,
    timed: false,
    spawnTimes: [],
    duration: null,
    hidden: false,
    folklore: null,

    sourceCategoryKey: fix.sourceCategoryKey,
    sourceCategory: fix.sourceCategory,
    acquisitionNote: fix.acquisitionNote,
    confidence: fix.confidence,
    materialName: material.name ?? null,
    materialItemId: material.itemId ?? null,
  };
}

function addManualFinalFixes(materialSources) {
  const output = structuredClone(materialSources);
  const manualFixAdditions = {};
  const manualFixMisses = {};

  for (const [materialKey, material] of Object.entries(output)) {
    if (!UNRESOLVED_STATUSES.has(material.status)) {
      continue;
    }

    const fix = MANUAL_FINAL_FIXES[materialKey];

    if (!fix) {
      manualFixMisses[materialKey] = {
        name: material.name ?? null,
        itemId: material.itemId ?? null,
        status: material.status,
        reason: "No manual final fix configured.",
      };
      continue;
    }

    const existingSources = Array.isArray(material.sources)
      ? material.sources
      : [];

    const manualSource = buildManualSpecialSource(material, fix);
    const mergedSources = mergeSources(existingSources, [manualSource]);

    output[materialKey] = {
      ...material,
      sources: mergedSources,
      status: getCombinedStatus({
        ...material,
        sources: mergedSources,
      }),
      debug: {
        ...(material.debug ?? {}),
        manualFinalFixAdded: true,
        manualFinalFixKey: fix.sourceCategoryKey,
        manualFinalFixPreviousStatus: material.status,
        manualFinalFixConfidence: fix.confidence,
      },
    };

    manualFixAdditions[materialKey] = {
      name: material.name ?? null,
      itemId: material.itemId ?? null,
      previousStatus: material.status,
      newStatus: output[materialKey].status,
      fix: {
        key: fix.sourceCategoryKey,
        sourceCategory: fix.sourceCategory,
        confidence: fix.confidence,
        acquisitionNote: fix.acquisitionNote,
      },
    };
  }

  return {
    materialSources: output,
    manualFixAdditions,
    manualFixMisses,
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
  previousReport,
  previousStatusCounts,
  manualFixAdditions,
  manualFixMisses
) {
  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      UNRESOLVED_STATUSES.has(entry.status)
    )
  );

  const statusCounts = countStatuses(materialSources);

  return {
    metadata: {
      sourceFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.poc.json",
      previousReportFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.unresolved-report.json",
      outputFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinalManual.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      previousUnresolvedCount: previousReport?.metadata?.unresolvedCount ?? null,
      unresolvedCount: Object.keys(unresolved).length,
      manualFixAdditionCount: Object.keys(manualFixAdditions).length,
      manualFixMissCount: Object.keys(manualFixMisses).length,
      note:
        "This report shows unresolved materials after applying the final manual source fixes.",
    },
    previousStatusCounts,
    statusCounts,
    unresolved,
    manualFixAdditions,
    manualFixMisses,
  };
}

async function main() {
  console.log("Reading final broad-special material source POC...");
  const existingMaterialSources = await readJson(INPUT_PATH);
  const previousReport = await readJson(PREVIOUS_REPORT_INPUT_PATH);
  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log(
    `Loaded ${Object.keys(existingMaterialSources).length} material source entries.`
  );

  const { materialSources, manualFixAdditions, manualFixMisses } =
    addManualFinalFixes(existingMaterialSources);

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousReport,
    previousStatusCounts,
    manualFixAdditions,
    manualFixMisses
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
  console.log(`Manual fix additions: ${Object.keys(manualFixAdditions).length}`);
  console.log(`Manual fix misses: ${Object.keys(manualFixMisses).length}`);
  console.log(
    `Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`
  );

  if (Object.keys(unresolvedReport.unresolved).length > 0) {
    console.log("");
    console.log("Still unresolved:");

    for (const entry of Object.values(unresolvedReport.unresolved)) {
      console.log(`  - ${entry.name} (${entry.status})`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});