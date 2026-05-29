import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecial.poc.json"
);

const PREVIOUS_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecial.unresolved-report.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.unresolved-report.json"
);

const UNRESOLVED_STATUSES = new Set([
  "item_name_not_found_in_teamcraft_items",
  "only_unusable_or_placeholder_gathering_sources_found",
  "no_source_found",
]);

const FINAL_SOURCE_OVERRIDES = {
  // Gardening / crossbreeding / housing crops
  "allagan-melon": {
    sourceCategoryKey: "gardening_crossbreeding",
    sourceCategory: "Gardening / Crossbreeding",
    gatheringType: "Gardening",
    nodeType: "Gardening / Crossbreeding",
    confidence: "high",
    acquisitionNote:
      "Known gardening or crossbreeding-style item. Treat as a housing garden acquisition rather than a normal field gather.",
  },
  "royal-fern": {
    sourceCategoryKey: "gardening_crossbreeding",
    sourceCategory: "Gardening / Crossbreeding",
    gatheringType: "Gardening",
    nodeType: "Gardening / Crossbreeding",
    confidence: "high",
    acquisitionNote:
      "Known gardening or crossbreeding-style item. Treat as a housing garden acquisition rather than a normal field gather.",
  },
  "umbrella-fig": {
    sourceCategoryKey: "gardening_crossbreeding",
    sourceCategory: "Gardening / Crossbreeding",
    gatheringType: "Gardening",
    nodeType: "Gardening / Crossbreeding",
    confidence: "high",
    acquisitionNote:
      "Known gardening or crossbreeding-style item. Treat as a housing garden acquisition rather than a normal field gather.",
  },
  "rainbow-chrysanthemum-bouquet": {
    sourceCategoryKey: "gardening_crossbreeding",
    sourceCategory: "Gardening / Flowerpot / Bouquet",
    gatheringType: "Gardening",
    nodeType: "Gardening / Flowerpot",
    confidence: "medium",
    acquisitionNote:
      "Likely associated with gardening, flowerpot harvesting, or bouquet-related housing/crafting acquisition.",
  },

  // Fish / aquatic leftovers
  "navigators-dagger": {
    sourceCategoryKey: "fishing_leftovers",
    sourceCategory: "Fishing / Spearfishing / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing",
    confidence: "high",
    acquisitionNote:
      "Fish or aquatic item not resolved by the normal fishing spot data pass. Treat as fishing acquisition.",
  },
  raincaller: {
    sourceCategoryKey: "fishing_leftovers",
    sourceCategory: "Fishing / Spearfishing / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing",
    confidence: "high",
    acquisitionNote:
      "Fish or aquatic item not resolved by the normal fishing spot data pass. Treat as fishing acquisition.",
  },
  "rock-lobster": {
    sourceCategoryKey: "fishing_leftovers",
    sourceCategory: "Fishing / Spearfishing / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing",
    confidence: "high",
    acquisitionNote:
      "Fish, shellfish, or aquatic item not resolved by the normal fishing spot data pass. Treat as fishing acquisition.",
  },
  takitaro: {
    sourceCategoryKey: "fishing_leftovers",
    sourceCategory: "Fishing / Spearfishing / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing",
    confidence: "high",
    acquisitionNote:
      "Fish or aquatic item not resolved by the normal fishing spot data pass. Treat as fishing acquisition.",
  },
  "thavnairian-calamari": {
    sourceCategoryKey: "fishing_leftovers",
    sourceCategory: "Fishing / Spearfishing / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing",
    confidence: "high",
    acquisitionNote:
      "Fish, squid, shellfish, or aquatic item not resolved by the normal fishing spot data pass. Treat as fishing acquisition.",
  },
  "worm-of-nym": {
    sourceCategoryKey: "fishing_leftovers",
    sourceCategory: "Fishing / Bait / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing / Bait",
    confidence: "medium",
    acquisitionNote:
      "Fishing-related item or bait-like item not resolved by the normal fishing spot data pass.",
  },
  "seema-patrician": {
    sourceCategoryKey: "fishing_leftovers",
    sourceCategory: "Fishing / Spearfishing / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing",
    confidence: "medium",
    acquisitionNote:
      "Likely fishing-related item not resolved by the normal fishing spot data pass.",
  },

  // Voyage / salvage / submarine / airship style leftovers
  "aromatic-wood-strips": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company voyage, submersible/airship exploration, salvage, or nonstandard expedition spoils.",
  },
  "pliable-plywood": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company voyage, submersible/airship exploration, salvage, or nonstandard expedition spoils.",
  },
  "weathered-fitting": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company voyage, submersible/airship exploration, salvage, or nonstandard expedition spoils.",
  },
  "weathered-pipe": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company voyage, submersible/airship exploration, salvage, or nonstandard expedition spoils.",
  },
  "weatherproof-plywood": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company voyage, submersible/airship exploration, salvage, or nonstandard expedition spoils.",
  },
  "white-granite": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company voyage, submersible/airship exploration, salvage, or nonstandard expedition spoils.",
  },
  "rusted-suit-of-armor": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company voyage, submersible/airship exploration, salvage, or nonstandard expedition spoils.",
  },
  "toy-box-schema": {
    sourceCategoryKey: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "low",
    acquisitionNote:
      "Likely nonstandard salvage, voyage, housing, or special loot acquisition.",
  },

  // Project / quest / custom delivery / relic-ish materials
  "starlens-wand-material": {
    sourceCategoryKey: "project_quest_collectible",
    sourceCategory: "Project / Quest / Custom Delivery Material",
    gatheringType: "Project / Quest Material",
    nodeType: "Special Project Material",
    confidence: "high",
    acquisitionNote:
      "Special project, quest, custom delivery, relic, or turn-in style material rather than a normal gather/drop/shop item.",
  },
  "xak-tural-miscellany": {
    sourceCategoryKey: "project_quest_collectible",
    sourceCategory: "Project / Quest / Custom Delivery Material",
    gatheringType: "Project / Quest Material",
    nodeType: "Special Project Material",
    confidence: "high",
    acquisitionNote:
      "Special project, quest, custom delivery, relic, or turn-in style material rather than a normal gather/drop/shop item.",
  },
  "yok-kukuru-pod": {
    sourceCategoryKey: "project_quest_collectible",
    sourceCategory: "Project / Quest / Custom Delivery Material",
    gatheringType: "Project / Quest Material",
    nodeType: "Special Project Material",
    confidence: "high",
    acquisitionNote:
      "Special project, quest, custom delivery, relic, or turn-in style material rather than a normal gather/drop/shop item.",
  },
  "turali-spice-blend": {
    sourceCategoryKey: "project_quest_collectible",
    sourceCategory: "Project / Quest / Custom Delivery Material",
    gatheringType: "Project / Quest Material",
    nodeType: "Special Project Material",
    confidence: "medium",
    acquisitionNote:
      "Likely special quest, delivery, collectable, or turn-in style material rather than a normal gather/drop/shop item.",
  },
  "timeworn-thaumaturgic-instruments": {
    sourceCategoryKey: "project_quest_collectible",
    sourceCategory: "Project / Quest / Custom Delivery Material",
    gatheringType: "Project / Quest Material",
    nodeType: "Special Project Material",
    confidence: "medium",
    acquisitionNote:
      "Likely special quest, delivery, collectable, or turn-in style material rather than a normal gather/drop/shop item.",
  },

  // Special battle / trial / FATE / raid-ish materials
  "rubicantes-flames": {
    sourceCategoryKey: "trial_fate_special_boss",
    sourceCategory: "Trial / FATE / Special Boss Material",
    gatheringType: "Special Battle Reward",
    nodeType: "Trial / FATE / Special Battle",
    confidence: "medium",
    acquisitionNote:
      "Likely trial, special battle, boss reward, or exchange material. Item ID did not resolve cleanly in Teamcraft data.",
  },
  "unidentified-flying-biomass": {
    sourceCategoryKey: "trial_fate_special_boss",
    sourceCategory: "Trial / FATE / Special Boss Material",
    gatheringType: "Special Battle Reward",
    nodeType: "Trial / FATE / Special Battle",
    confidence: "medium",
    acquisitionNote:
      "Likely special battle, FATE, deep dungeon, or nonstandard battle reward.",
  },

  // Materia
  "quicktongue-materia-iii": {
    sourceCategoryKey: "materia",
    sourceCategory: "Materia / Spiritbond / Extraction / Exchange",
    gatheringType: "Materia",
    nodeType: "Materia Source",
    confidence: "high",
    acquisitionNote:
      "Materia is normally obtained through extraction, spiritbonding, transmutation, exchange, market board, or related materia systems.",
  },
  "savage-aim-materia-iii": {
    sourceCategoryKey: "materia",
    sourceCategory: "Materia / Spiritbond / Extraction / Exchange",
    gatheringType: "Materia",
    nodeType: "Materia Source",
    confidence: "high",
    acquisitionNote:
      "Materia is normally obtained through extraction, spiritbonding, transmutation, exchange, market board, or related materia systems.",
  },
  "savage-might-materia-iii": {
    sourceCategoryKey: "materia",
    sourceCategory: "Materia / Spiritbond / Extraction / Exchange",
    gatheringType: "Materia",
    nodeType: "Materia Source",
    confidence: "high",
    acquisitionNote:
      "Materia is normally obtained through extraction, spiritbonding, transmutation, exchange, market board, or related materia systems.",
  },

  // Older rare/special raw materials and crafted-ish intermediates
  "black-limestone": {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Older special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  "dark-matter-cluster": {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Older special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  "potters-stone": {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  "raw-celestine": {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  "red-moko-grass": {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  tincalconite: {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  vivianite: {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  "unaspected-crystal": {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },
  "yafaemi-wildgrass": {
    sourceCategoryKey: "special_raw_material",
    sourceCategory: "Special Raw Material / Nonstandard Gathering",
    gatheringType: "Special Material",
    nodeType: "Special Raw Material",
    confidence: "low",
    acquisitionNote:
      "Special raw material not resolved by normal gathering/shop/drop data. Needs later manual verification.",
  },

  // Intermediate / special recipe-adjacent
  "dusk-leather": {
    sourceCategoryKey: "crafted_or_special_intermediate",
    sourceCategory: "Crafted / Special Intermediate Material",
    gatheringType: "Intermediate Material",
    nodeType: "Crafted / Special Intermediate",
    confidence: "low",
    acquisitionNote:
      "Recipe-adjacent or special intermediate material not resolved by recipe data. Needs later manual verification.",
  },
  "guild-forged-ingot": {
    sourceCategoryKey: "crafted_or_special_intermediate",
    sourceCategory: "Crafted / Special Intermediate Material",
    gatheringType: "Intermediate Material",
    nodeType: "Crafted / Special Intermediate",
    confidence: "low",
    acquisitionNote:
      "Recipe-adjacent or special intermediate material not resolved by recipe data. Needs later manual verification.",
  },
  "ishgardian-steel-ingot": {
    sourceCategoryKey: "crafted_or_special_intermediate",
    sourceCategory: "Crafted / Special Intermediate Material",
    gatheringType: "Intermediate Material",
    nodeType: "Crafted / Special Intermediate",
    confidence: "low",
    acquisitionNote:
      "Recipe-adjacent or special intermediate material not resolved by recipe data. Needs later manual verification.",
  },
  "sintered-whetstone": {
    sourceCategoryKey: "crafted_or_special_intermediate",
    sourceCategory: "Crafted / Special Intermediate Material",
    gatheringType: "Intermediate Material",
    nodeType: "Crafted / Special Intermediate",
    confidence: "low",
    acquisitionNote:
      "Recipe-adjacent or special intermediate material not resolved by recipe data. Needs later manual verification.",
  },
  "stone-vigil-lumber": {
    sourceCategoryKey: "crafted_or_special_intermediate",
    sourceCategory: "Crafted / Special Intermediate Material",
    gatheringType: "Intermediate Material",
    nodeType: "Crafted / Special Intermediate",
    confidence: "low",
    acquisitionNote:
      "Recipe-adjacent or special intermediate material not resolved by recipe data. Needs later manual verification.",
  },
  "steel-mainspring": {
    sourceCategoryKey: "crafted_or_special_intermediate",
    sourceCategory: "Crafted / Special Intermediate Material",
    gatheringType: "Intermediate Material",
    nodeType: "Crafted / Special Intermediate",
    confidence: "low",
    acquisitionNote:
      "Recipe-adjacent or special intermediate material not resolved by recipe data. Needs later manual verification.",
  },

  // Monster/hide style misses
  "chemically-treated-chimera-hide": {
    sourceCategoryKey: "special_monster_or_processed_hide",
    sourceCategory: "Special Monster Drop / Processed Hide",
    gatheringType: "Monster Drop / Special",
    nodeType: "Special Monster Material",
    confidence: "low",
    acquisitionNote:
      "Monster-hide or processed-hide style material not resolved by monster/drop/recipe data. Needs later manual verification.",
  },
  "hengr-dhalmel-hide": {
    sourceCategoryKey: "special_monster_or_processed_hide",
    sourceCategory: "Special Monster Drop / Processed Hide",
    gatheringType: "Monster Drop / Special",
    nodeType: "Special Monster Material",
    confidence: "low",
    acquisitionNote:
      "Monster-hide style material not resolved by monster/drop/recipe data. Needs later manual verification.",
  },
  "large-gagana-skin": {
    sourceCategoryKey: "special_monster_or_processed_hide",
    sourceCategory: "Special Monster Drop / Processed Hide",
    gatheringType: "Monster Drop / Special",
    nodeType: "Special Monster Material",
    confidence: "low",
    acquisitionNote:
      "Monster-skin style material not resolved by monster/drop/recipe data. Needs later manual verification.",
  },
  "velodyna-grizzly-bear-hide": {
    sourceCategoryKey: "special_monster_or_processed_hide",
    sourceCategory: "Special Monster Drop / Processed Hide",
    gatheringType: "Monster Drop / Special",
    nodeType: "Special Monster Material",
    confidence: "low",
    acquisitionNote:
      "Monster-hide style material not resolved by monster/drop/recipe data. Needs later manual verification.",
  },

  // Known item-name / Teamcraft mismatch cases
  "cashmere-yarn": {
    sourceCategoryKey: "manual_review_name_mismatch",
    sourceCategory: "Manual Review / Item Name Mismatch",
    gatheringType: "Manual Review",
    nodeType: "Name Mismatch",
    confidence: "manual",
    acquisitionNote:
      "Item did not resolve to a Teamcraft item ID in this pipeline. Needs manual name/ID correction before exact source can be trusted.",
  },
  "megatherium-leather": {
    sourceCategoryKey: "manual_review_name_mismatch",
    sourceCategory: "Manual Review / Item Name Mismatch",
    gatheringType: "Manual Review",
    nodeType: "Name Mismatch",
    confidence: "manual",
    acquisitionNote:
      "Item did not resolve to a Teamcraft item ID in this pipeline. Needs manual name/ID correction before exact source can be trusted.",
  },
  "ilmenite-ore": {
    sourceCategoryKey: "manual_review_name_mismatch",
    sourceCategory: "Manual Review / Item Name Mismatch",
    gatheringType: "Manual Review",
    nodeType: "Name Mismatch",
    confidence: "manual",
    acquisitionNote:
      "Item did not resolve to a Teamcraft item ID in this pipeline. Needs manual name/ID correction before exact source can be trusted.",
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

function buildSpecialSource(material, override) {
  return {
    type: "special",
    gatheringClass: "Special",
    gatheringType: override.gatheringType,
    level: null,
    region: null,
    zone: null,
    zoneId: null,
    area: null,
    map: null,
    mapId: null,
    coordinates: null,
    nodeType: override.nodeType,
    timed: false,
    spawnTimes: [],
    duration: null,
    hidden: false,
    folklore: null,

    sourceCategoryKey: override.sourceCategoryKey,
    sourceCategory: override.sourceCategory,
    acquisitionNote: override.acquisitionNote,
    confidence: override.confidence,
    materialName: material.name ?? null,
    materialItemId: material.itemId ?? null,
  };
}

function addFinalSpecialSources(materialSources) {
  const output = structuredClone(materialSources);
  const finalSpecialAdditions = {};
  const finalSpecialMisses = {};
  const ruleCounts = {};

  for (const [materialKey, material] of Object.entries(output)) {
    if (!UNRESOLVED_STATUSES.has(material.status)) {
      continue;
    }

    const override = FINAL_SOURCE_OVERRIDES[materialKey];

    if (!override) {
      finalSpecialMisses[materialKey] = {
        name: material.name ?? null,
        itemId: material.itemId ?? null,
        status: material.status,
      };
      continue;
    }

    const existingSources = Array.isArray(material.sources)
      ? material.sources
      : [];

    const newSource = buildSpecialSource(material, override);
    const mergedSources = mergeSources(existingSources, [newSource]);

    output[materialKey] = {
      ...material,
      sources: mergedSources,
      status: getCombinedStatus({
        ...material,
        sources: mergedSources,
      }),
      debug: {
        ...(material.debug ?? {}),
        finalSpecialSourceAdded: true,
        finalSpecialSourceKey: override.sourceCategoryKey,
        finalSpecialSourceConfidence: override.confidence,
        finalSpecialSourcePreviousStatus: material.status,
      },
    };

    ruleCounts[override.sourceCategoryKey] =
      (ruleCounts[override.sourceCategoryKey] ?? 0) + 1;

    finalSpecialAdditions[materialKey] = {
      name: material.name ?? null,
      itemId: material.itemId ?? null,
      previousStatus: material.status,
      newStatus: output[materialKey].status,
      rule: {
        key: override.sourceCategoryKey,
        sourceCategory: override.sourceCategory,
        confidence: override.confidence,
        acquisitionNote: override.acquisitionNote,
      },
    };
  }

  return {
    materialSources: output,
    finalSpecialAdditions,
    finalSpecialMisses,
    ruleCounts,
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
  finalSpecialAdditions,
  finalSpecialMisses,
  ruleCounts
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
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecial.poc.json",
      previousReportFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecial.unresolved-report.json",
      outputFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      previousUnresolvedCount: previousReport?.metadata?.unresolvedCount ?? null,
      unresolvedCount: Object.keys(unresolved).length,
      finalSpecialAdditionCount: Object.keys(finalSpecialAdditions).length,
      finalSpecialMissCount: Object.keys(finalSpecialMisses).length,
      note:
        "This report shows unresolved materials after adding final targeted special source categories for remaining obvious misses.",
    },
    previousStatusCounts,
    statusCounts,
    ruleCounts,
    unresolved,
    finalSpecialAdditions,
    finalSpecialMisses,
  };
}

async function main() {
  console.log("Reading broad-special material source POC...");
  const existingMaterialSources = await readJson(INPUT_PATH);
  const previousReport = await readJson(PREVIOUS_REPORT_INPUT_PATH);
  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log(
    `Loaded ${Object.keys(existingMaterialSources).length} material source entries.`
  );

  const {
    materialSources,
    finalSpecialAdditions,
    finalSpecialMisses,
    ruleCounts,
  } = addFinalSpecialSources(existingMaterialSources);

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousReport,
    previousStatusCounts,
    finalSpecialAdditions,
    finalSpecialMisses,
    ruleCounts
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
  console.log("Final special rule counts:");

  for (const [ruleKey, count] of Object.entries(ruleCounts)) {
    console.log(`  ${ruleKey}: ${count}`);
  }

  console.log("");
  console.log(
    `Final special additions: ${Object.keys(finalSpecialAdditions).length}`
  );
  console.log(`Final special misses: ${Object.keys(finalSpecialMisses).length}`);
  console.log(
    `Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});