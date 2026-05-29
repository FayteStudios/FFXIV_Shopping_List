import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstances.poc.json"
);

const CATEGORY_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstances.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecial.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecial.unresolved-report.json"
);

const MAX_RULE_MATCHES_PER_MATERIAL = 3;

const UNRESOLVED_STATUSES = new Set([
  "item_name_not_found_in_teamcraft_items",
  "only_unusable_or_placeholder_gathering_sources_found",
  "no_source_found",
]);

const BROAD_SOURCE_RULES = [
  {
    key: "aetherial_reduction",
    sourceCategory: "Aetherial Reduction / Ephemeral Gathering",
    gatheringType: "Aetherial Reduction",
    nodeType: "Aetherial Reduction",
    confidence: "high",
    acquisitionNote:
      "Likely obtained through aetherial reduction of collectable items from ephemeral gathering nodes or fishing.",
    patterns: [
      /aethersand/i,
      /glioaether/i,
    ],
  },
  {
    key: "gardening_crossbreeding",
    sourceCategory: "Gardening / Crossbreeding",
    gatheringType: "Gardening",
    nodeType: "Gardening / Crossbreeding",
    confidence: "high",
    acquisitionNote:
      "Likely obtained through gardening, crossbreeding, harvesting, or growable housing crops.",
    patterns: [
      /broombush/i,
      /cloudsbreath/i,
      /glazenut/i,
      /jute/i,
      /curiel root/i,
      /nymeia lily/i,
      /halone gerbera/i,
      /azeyma rose/i,
      /blood pepper/i,
      /thavnairian onion/i,
      /deluxe garden/i,
      /seed/i,
      /sapling/i,
      /garden/i,
      /flower/i,
      /gerbera/i,
      /lily/i,
      /rose/i,
      /chestnut/i,
      /acorn/i,
    ],
  },
  {
    key: "voyage_airship_submersible",
    sourceCategory: "Voyage / Airship / Submersible / Salvage",
    gatheringType: "Voyage",
    nodeType: "Voyage Spoils",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from free company airship voyages, submersible voyages, exploratory voyages, or voyage salvage.",
    patterns: [
      /airship/i,
      /submersible/i,
      /submarine/i,
      /voyage/i,
      /salvage/i,
      /deep-sea/i,
      /cloudsail/i,
      /cassia log/i,
      /cryptomeria log/i,
      /kamacite ore/i,
      /mossy log/i,
      /cocobolo/i,
      /balsa/i,
      /fiberboard/i,
      /damaged/i,
      /outsized crystal glass/i,
      /marine wax ester/i,
      /far eastern coin/i,
      /dinosaur fossil/i,
      /ancient bone/i,
    ],
  },
  {
    key: "desynthesis_demimateria",
    sourceCategory: "Desynthesis / Demimateria / Salvage",
    gatheringType: "Desynthesis",
    nodeType: "Desynthesis / Salvage",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained through desynthesis, demimateria extraction, salvage, or breaking down specific equipment.",
    patterns: [
      /demimateria/i,
      /faded copy/i,
      /faded tome/i,
      /aged /i,
      /stained cloth/i,
      /dried ether/i,
      /allagan leather/i,
      /allagan silk/i,
      /allagan wootz nugget/i,
      /allagan catalyst/i,
      /light steel plate/i,
      /taffeta cloth/i,
      /waterproof cotton cloth/i,
      /fine wax/i,
      /fine alumen/i,
    ],
  },
  {
    key: "trial_fate_special_boss",
    sourceCategory: "Trial / FATE / Special Boss Material",
    gatheringType: "Special Battle Reward",
    nodeType: "Trial / FATE / Special Battle",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained from a trial, FATE, special battle, achievement vendor, or battle-related exchange.",
    patterns: [
      /behemoth horn/i,
      /odin/i,
      /mantle/i,
      /hakutaku eye/i,
      /demimateria of crags/i,
      /demimateria of the inferno/i,
      /demimateria of the vortex/i,
      /demimog/i,
      /diamond tear/i,
      /ice tear/i,
      /alexander exoplating/i,
      /ominous plating/i,
      /arm of unmaking/i,
      /gordian/i,
      /enigmatic gear/i,
      /iron giant core/i,
      /iron giant scrap/i,
      /colossus slab/i,
      /goblin cup/i,
      /magnanimous mogcrown/i,
    ],
  },
  {
    key: "fishing_leftovers",
    sourceCategory: "Fishing / Spearfishing / Aquatic Source",
    gatheringType: "Fishing",
    nodeType: "Fishing",
    confidence: "medium",
    acquisitionNote:
      "Likely obtained by fishing, spearfishing, ocean fishing, or an aquatic source not found in the normal fishing spot data.",
    patterns: [
      /coral/i,
      /fish/i,
      /shark/i,
      /marlin/i,
      /megalodon/i,
      /mahi/i,
      /haddock/i,
      /pike/i,
      /pipira/i,
      /urchin/i,
      /kelp/i,
      /kraken/i,
      /devil/i,
      /goldentail/i,
      /jhinga/i,
      /lamp marimo/i,
      /lake urchin/i,
      /navigators dagger/i,
      /mazlaya/i,
      /haraldr/i,
      /northern pike/i,
    ],
  },
  {
    key: "project_quest_collectible",
    sourceCategory: "Project / Quest / Custom Delivery Material",
    gatheringType: "Project / Quest Material",
    nodeType: "Special Project Material",
    confidence: "medium",
    acquisitionNote:
      "Likely a project, quest, custom delivery, tribal quest, collectable, or turn-in style material rather than a normal gather/drop/shop item.",
    patterns: [
      /ingredients$/i,
      /supplies$/i,
      /materials$/i,
      /component/i,
      /components/i,
      /parts$/i,
      /core material/i,
      /connector material/i,
      /repair kit/i,
      /souvenir/i,
      /oddly delicate/i,
      /resplendent/i,
      /fulcrum/i,
      /hand warmer/i,
      /broth ingredients/i,
      /juice ingredients/i,
      /luminol ingredients/i,
      /electuary ingredients/i,
      /dissolvent ingredients/i,
      /golden spice ingredients/i,
      /fishcake ingredient supplies/i,
    ],
  },
  {
    key: "housing_special_furnishing",
    sourceCategory: "Housing / Furnishing / Special Item",
    gatheringType: "Housing / Special",
    nodeType: "Housing / Special Material",
    confidence: "low",
    acquisitionNote:
      "Likely associated with housing, furnishing, special furnishing materials, or nonstandard acquisition.",
    patterns: [
      /manor/i,
      /fireplace/i,
      /oriental/i,
      /tuft/i,
      /dye/i,
      /crystal boule/i,
      /boule/i,
      /firewood/i,
      /weatherproof cloth/i,
      /frontier cloth/i,
      /fortune-teller/i,
      /sweatcloth/i,
      /cloth/i,
      /velvet/i,
      /silk/i,
      /plate/i,
    ],
  },
  {
    key: "deep_dungeon_relic_misc",
    sourceCategory: "Deep Dungeon / Relic / Miscellaneous Special Loot",
    gatheringType: "Special Loot",
    nodeType: "Deep Dungeon / Relic / Miscellaneous",
    confidence: "low",
    acquisitionNote:
      "Likely obtained from a deep dungeon, relic-related activity, special loot table, or miscellaneous nonstandard source.",
    patterns: [
      /mossy stone/i,
      /mossy-stone/i,
      /mossy/i,
      /aetherstone/i,
      /tome/i,
      /relic/i,
      /shard/i,
      /mote/i,
      /cloud cutter/i,
      /little worm/i,
    ],
  },
];

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function getMaterialName(material) {
  return String(material?.name ?? "").trim();
}

function hasUnresolvedStatus(material) {
  return UNRESOLVED_STATUSES.has(material?.status);
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

function matchBroadRules(material) {
  const name = getMaterialName(material);

  if (!name) {
    return [];
  }

  const matches = [];

  for (const rule of BROAD_SOURCE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(name))) {
      matches.push(rule);
    }

    if (matches.length >= MAX_RULE_MATCHES_PER_MATERIAL) {
      break;
    }
  }

  return matches;
}

function buildBroadSpecialSource(material, rule) {
  return {
    type: "special",
    gatheringClass: "Special",
    gatheringType: rule.gatheringType,
    level: null,
    region: null,
    zone: null,
    zoneId: null,
    area: null,
    map: null,
    mapId: null,
    coordinates: null,
    nodeType: rule.nodeType,
    timed: false,
    spawnTimes: [],
    duration: null,
    hidden: false,
    folklore: null,

    sourceCategoryKey: rule.key,
    sourceCategory: rule.sourceCategory,
    acquisitionNote: rule.acquisitionNote,
    confidence: rule.confidence,
    materialName: material.name ?? null,
    materialItemId: material.itemId ?? null,
  };
}

function collectCategoryTargets(categoryReport) {
  const targets = new Map();

  for (const [categoryKey, category] of Object.entries(
    categoryReport.categories ?? {}
  )) {
    for (const [materialKey, material] of Object.entries(category.items ?? {})) {
      targets.set(materialKey, {
        categoryKey,
        material,
      });
    }
  }

  return targets;
}

function addBroadSpecialSources(materialSources, categoryReport) {
  const output = structuredClone(materialSources);
  const categoryTargets = collectCategoryTargets(categoryReport);

  const broadSpecialAdditions = {};
  const broadSpecialMisses = {};
  const ruleCounts = {};

  for (const [materialKey, material] of Object.entries(output)) {
    if (!hasUnresolvedStatus(material)) {
      continue;
    }

    const existingSources = Array.isArray(material.sources)
      ? material.sources
      : [];

    const matchedRules = matchBroadRules(material);

    if (matchedRules.length === 0) {
      const categoryTarget = categoryTargets.get(materialKey);

      broadSpecialMisses[materialKey] = {
        name: material.name ?? null,
        itemId: material.itemId ?? null,
        status: material.status,
        categoryKey: categoryTarget?.categoryKey ?? null,
      };

      continue;
    }

    const newSources = matchedRules.map((rule) =>
      buildBroadSpecialSource(material, rule)
    );

    const mergedSources = mergeSources(existingSources, newSources);

    output[materialKey] = {
      ...material,
      sources: mergedSources,
      status: getCombinedStatus({
        ...material,
        sources: mergedSources,
      }),
      debug: {
        ...(material.debug ?? {}),
        broadSpecialSourceAdded: true,
        broadSpecialSourceCount: newSources.length,
        addedBroadSpecialSourceCount: Math.max(
          0,
          mergedSources.length - existingSources.length
        ),
        broadSpecialSourceRuleKeys: matchedRules.map((rule) => rule.key),
      },
    };

    for (const rule of matchedRules) {
      ruleCounts[rule.key] = (ruleCounts[rule.key] ?? 0) + 1;
    }

    const categoryTarget = categoryTargets.get(materialKey);

    broadSpecialAdditions[materialKey] = {
      name: material.name ?? null,
      itemId: material.itemId ?? null,
      previousStatus: material.status,
      newStatus: output[materialKey].status,
      categoryKey: categoryTarget?.categoryKey ?? null,
      addedBroadSpecialSourceCount:
        output[materialKey].debug.addedBroadSpecialSourceCount,
      rules: matchedRules.map((rule) => ({
        key: rule.key,
        sourceCategory: rule.sourceCategory,
        confidence: rule.confidence,
        acquisitionNote: rule.acquisitionNote,
      })),
    };
  }

  return {
    materialSources: output,
    broadSpecialAdditions,
    broadSpecialMisses,
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
  previousStatusCounts,
  broadSpecialAdditions,
  broadSpecialMisses,
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
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstances.poc.json",
      categorySourceFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstances.unresolved-categories.json",
      outputFile:
        "materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecial.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      unresolvedCount: Object.keys(unresolved).length,
      broadSpecialAdditionCount: Object.keys(broadSpecialAdditions).length,
      broadSpecialMissCount: Object.keys(broadSpecialMisses).length,
      note:
        "This report shows unresolved materials after adding broad heuristic special source categories for aethersand, gardening, voyages, desynthesis, fishing leftovers, project materials, and miscellaneous special loot.",
    },
    previousStatusCounts,
    statusCounts,
    ruleCounts,
    unresolved,
    broadSpecialAdditions,
    broadSpecialMisses,
  };
}

async function main() {
  console.log("Reading crafted-instance material source POC...");
  const existingMaterialSources = await readJson(INPUT_PATH);
  const categoryReport = await readJson(CATEGORY_REPORT_INPUT_PATH);
  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log(
    `Loaded ${Object.keys(existingMaterialSources).length} material source entries.`
  );

  const {
    materialSources,
    broadSpecialAdditions,
    broadSpecialMisses,
    ruleCounts,
  } = addBroadSpecialSources(existingMaterialSources, categoryReport);

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousStatusCounts,
    broadSpecialAdditions,
    broadSpecialMisses,
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
  console.log("Broad special rule counts:");

  for (const [ruleKey, count] of Object.entries(ruleCounts)) {
    console.log(`  ${ruleKey}: ${count}`);
  }

  console.log("");
  console.log(
    `Broad special additions: ${Object.keys(broadSpecialAdditions).length}`
  );
  console.log(`Broad special misses: ${Object.keys(broadSpecialMisses).length}`);
  console.log(
    `Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});