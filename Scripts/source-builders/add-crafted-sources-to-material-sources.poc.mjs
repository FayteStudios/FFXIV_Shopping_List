import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  recipes: `${TEAMCRAFT_BASE}/recipes.json`,
  recipesPerItem: `${TEAMCRAFT_BASE}/recipes-per-item.json`,
  jobNames: `${TEAMCRAFT_BASE}/job-name.json`,
};

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishing.poc.json"
);

const CATEGORY_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishing.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCrafted.poc.json"
);

const UNRESOLVED_REPORT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCrafted.unresolved-report.json"
);

const CRAFTED_CATEGORY_KEY = "crafted_intermediates";

const MAX_CRAFTING_SOURCES_PER_MATERIAL = 25;

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

function buildJobNameIndex(jobNamesData) {
  const index = new Map();

  for (const job of asArray(jobNamesData)) {
    const id = pickFirstNumber(job.id, job.row_id, job.rowId, job.ID);
    const name = getLocalizedName(job);

    if (id !== null && name) {
      index.set(id, name);
    }
  }

  return index;
}

function getRecipeId(recipe) {
  return pickFirstNumber(recipe.id, recipe.row_id, recipe.rowId, recipe.ID);
}

function getRecipeResultItemId(recipe) {
  return pickFirstNumber(
    recipe.result,
    recipe.resultId,
    recipe.result_id,
    recipe.itemId,
    recipe.item_id,
    recipe.item,
    recipe.ItemResult,
    recipe.itemResult,
    recipe.item_result
  );
}

function getRecipeLevel(recipe) {
  return pickFirstNumber(
    recipe.lvl,
    recipe.level,
    recipe.recipeLevel,
    recipe.recipe_level,
    recipe.rlvl,
    recipe.recipeLevelTable
  );
}

function getRecipeJobId(recipe) {
  return pickFirstNumber(
    recipe.job,
    recipe.jobId,
    recipe.job_id,
    recipe.craftType,
    recipe.craft_type,
    recipe.classJob,
    recipe.class_job,
    recipe.classJobId,
    recipe.class_job_id
  );
}

function getRecipeAmountCreated(recipe) {
  return (
    pickFirstNumber(
      recipe.amountResult,
      recipe.amount_result,
      recipe.resultAmount,
      recipe.result_amount,
      recipe.amount,
      recipe.quantity
    ) ?? 1
  );
}

function normalizeIngredientList(recipe, itemIndex) {
  const rawIngredients =
    recipe.ingredients ??
    recipe.Ingredients ??
    recipe.requiredItems ??
    recipe.required_items ??
    recipe.items ??
    null;

  if (!rawIngredients) {
    return [];
  }

  if (Array.isArray(rawIngredients)) {
    return rawIngredients
      .map((ingredient) => {
        if (typeof ingredient === "number" || typeof ingredient === "string") {
          const itemId = Number(ingredient);

          if (!Number.isFinite(itemId)) {
            return null;
          }

          return {
            itemId,
            name: itemIndex.get(itemId)?.name ?? null,
            quantity: 1,
          };
        }

        if (!ingredient || typeof ingredient !== "object") {
          return null;
        }

        const itemId = pickFirstNumber(
          ingredient.id,
          ingredient.itemId,
          ingredient.item_id,
          ingredient.item,
          ingredient.Item,
          ingredient.itemResult,
          ingredient.item_result
        );

        if (itemId === null) {
          return null;
        }

        const quantity =
          pickFirstNumber(
            ingredient.amount,
            ingredient.quantity,
            ingredient.qty,
            ingredient.count
          ) ?? 1;

        return {
          itemId,
          name: getLocalizedName(ingredient) ?? itemIndex.get(itemId)?.name ?? null,
          quantity,
        };
      })
      .filter(Boolean);
  }

  if (rawIngredients && typeof rawIngredients === "object") {
    return Object.entries(rawIngredients)
      .map(([itemIdText, quantityValue]) => {
        const itemId = Number(itemIdText);

        if (!Number.isFinite(itemId)) {
          return null;
        }

        let quantity = 1;

        if (typeof quantityValue === "number") {
          quantity = quantityValue;
        } else if (quantityValue && typeof quantityValue === "object") {
          quantity =
            pickFirstNumber(
              quantityValue.amount,
              quantityValue.quantity,
              quantityValue.qty,
              quantityValue.count
            ) ?? 1;
        }

        return {
          itemId,
          name: itemIndex.get(itemId)?.name ?? null,
          quantity,
        };
      })
      .filter(Boolean);
  }

  return [];
}

function buildRecipeIndex(recipesData) {
  const recipeIndex = new Map();
  const recipeArray = asArray(recipesData);

  for (const recipe of recipeArray) {
    const recipeId = getRecipeId(recipe);

    if (recipeId !== null) {
      recipeIndex.set(recipeId, recipe);
    }
  }

  return recipeIndex;
}

function collectRecipeIdsFromValue(value, output = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectRecipeIdsFromValue(entry, output);
    }

    return output;
  }

  if (typeof value === "number" || typeof value === "string") {
    const id = Number(value);

    if (Number.isFinite(id)) {
      output.push(id);
    }

    return output;
  }

  if (value && typeof value === "object") {
    const directId = pickFirstNumber(
      value.id,
      value.recipeId,
      value.recipe_id,
      value.recipe,
      value.row_id,
      value.rowId
    );

    if (directId !== null) {
      output.push(directId);
    }

    for (const nestedValue of Object.values(value)) {
      collectRecipeIdsFromValue(nestedValue, output);
    }
  }

  return output;
}

function getRecipeIdsForItem(itemId, recipesPerItemData, recipeIndex) {
  const id = Number(itemId);

  if (!Number.isFinite(id)) {
    return [];
  }

  const recipeIds = new Set();

  const directEntry =
    recipesPerItemData?.[String(id)] ?? recipesPerItemData?.[id] ?? null;

  for (const recipeId of collectRecipeIdsFromValue(directEntry)) {
    recipeIds.add(recipeId);
  }

  if (recipeIds.size === 0) {
    for (const [recipeId, recipe] of recipeIndex.entries()) {
      if (getRecipeResultItemId(recipe) === id) {
        recipeIds.add(recipeId);
      }
    }
  }

  return [...recipeIds];
}

function normalizeCraftedSource(recipeId, recipe, itemIndex, jobNameIndex) {
  const resultItemId = getRecipeResultItemId(recipe);
  const jobId = getRecipeJobId(recipe);

  return {
    type: "crafted",
    gatheringClass: "Crafting",
    gatheringType: "Recipe",
    level: getRecipeLevel(recipe),
    region: null,
    zone: null,
    zoneId: null,
    area: null,
    map: null,
    mapId: null,
    coordinates: null,
    nodeType: "Crafted Recipe",
    timed: false,
    spawnTimes: [],
    duration: null,
    hidden: false,
    folklore: null,

    recipeId,
    recipeJobId: jobId,
    recipeJobName: jobId !== null ? jobNameIndex.get(jobId) ?? null : null,
    resultItemId,
    resultItemName: resultItemId !== null ? itemIndex.get(resultItemId)?.name ?? null : null,
    amountCreated: getRecipeAmountCreated(recipe),
    ingredients: normalizeIngredientList(recipe, itemIndex),
  };
}

function getCraftedSourcesForMaterial(
  material,
  recipesPerItemData,
  recipeIndex,
  itemIndex,
  jobNameIndex
) {
  const recipeIds = getRecipeIdsForItem(
    material.itemId,
    recipesPerItemData,
    recipeIndex
  ).slice(0, MAX_CRAFTING_SOURCES_PER_MATERIAL);

  return recipeIds
    .map((recipeId) => {
      const recipe = recipeIndex.get(recipeId);

      if (!recipe) {
        return null;
      }

      return normalizeCraftedSource(recipeId, recipe, itemIndex, jobNameIndex);
    })
    .filter(Boolean);
}

function getCraftedCategoryTargets(categoryReport) {
  const category = categoryReport.categories?.[CRAFTED_CATEGORY_KEY];

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

function addCraftedSources(
  materialSources,
  categoryReport,
  recipesPerItemData,
  recipeIndex,
  itemIndex,
  jobNameIndex
) {
  const output = structuredClone(materialSources);
  const craftedAdditions = {};
  const craftedMisses = {};

  const targets = getCraftedCategoryTargets(categoryReport);

  for (const target of targets) {
    const existingMaterial = output[target.materialKey];

    if (!existingMaterial) {
      continue;
    }

    if (!UNRESOLVED_STATUSES.has(existingMaterial.status)) {
      continue;
    }

    const craftedSources = getCraftedSourcesForMaterial(
      existingMaterial,
      recipesPerItemData,
      recipeIndex,
      itemIndex,
      jobNameIndex
    );

    if (craftedSources.length === 0) {
      craftedMisses[target.materialKey] = {
        name: existingMaterial.name,
        itemId: existingMaterial.itemId ?? null,
        status: existingMaterial.status,
      };

      continue;
    }

    const existingSources = Array.isArray(existingMaterial.sources)
      ? existingMaterial.sources
      : [];

    const mergedSources = mergeSources(existingSources, craftedSources);

    output[target.materialKey] = {
      ...existingMaterial,
      sources: mergedSources,
      status: getCombinedStatus({
        ...existingMaterial,
        sources: mergedSources,
      }),
      debug: {
        ...(existingMaterial.debug ?? {}),
        craftedSourceAdded: true,
        craftedSourceCount: craftedSources.length,
        addedCraftedSourceCount: Math.max(
          0,
          mergedSources.length - existingSources.length
        ),
        craftedSourcesTruncated:
          getRecipeIdsForItem(
            existingMaterial.itemId,
            recipesPerItemData,
            recipeIndex
          ).length > MAX_CRAFTING_SOURCES_PER_MATERIAL,
      },
    };

    craftedAdditions[target.materialKey] = {
      name: existingMaterial.name,
      itemId: existingMaterial.itemId ?? null,
      previousStatus: existingMaterial.status,
      newStatus: output[target.materialKey].status,
      craftedSourceCount: craftedSources.length,
      addedCraftedSourceCount:
        output[target.materialKey].debug.addedCraftedSourceCount,
      sampleCraftedSources: craftedSources.slice(0, 5),
    };
  }

  return {
    materialSources: output,
    craftedAdditions,
    craftedMisses,
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
  craftedAdditions,
  craftedMisses
) {
  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      UNRESOLVED_STATUSES.has(entry.status)
    )
  );

  const statusCounts = countStatuses(materialSources);

  return {
    metadata: {
      sourceFile: "materialSources.withDropsShopsLootSpecialAndFishing.poc.json",
      categorySourceFile:
        "materialSources.withDropsShopsLootSpecialAndFishing.unresolved-categories.json",
      outputFile: "materialSources.withDropsShopsLootSpecialAndFishingCrafted.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      unresolvedCount: Object.keys(unresolved).length,
      craftedAdditionCount: Object.keys(craftedAdditions).length,
      craftedMissCount: Object.keys(craftedMisses).length,
      maxCraftingSourcesPerMaterial: MAX_CRAFTING_SOURCES_PER_MATERIAL,
      note: "This report shows unresolved materials after adding crafted recipe sources from Teamcraft recipes-per-item.json and recipes.json.",
    },
    previousStatusCounts,
    statusCounts,
    unresolved,
    craftedAdditions,
    craftedMisses,
  };
}

async function main() {
  console.log("Reading latest material source POC...");
  const existingMaterialSources = await readJson(INPUT_PATH);
  const categoryReport = await readJson(CATEGORY_REPORT_INPUT_PATH);
  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log(
    `Loaded ${Object.keys(existingMaterialSources).length} material source entries.`
  );

  console.log("");
  console.log("Fetching Teamcraft recipe data...");

  const [itemsData, recipesData, recipesPerItemData, jobNamesData] =
    await Promise.all([
      fetchJson("items.json", DATA_URLS.items),
      fetchJson("recipes.json", DATA_URLS.recipes),
      fetchJson("recipes-per-item.json", DATA_URLS.recipesPerItem),
      fetchJson("job-name.json", DATA_URLS.jobNames),
    ]);

  const itemIndex = buildItemIndex(itemsData);
  const recipeIndex = buildRecipeIndex(recipesData);
  const jobNameIndex = buildJobNameIndex(jobNamesData);

  const { materialSources, craftedAdditions, craftedMisses } =
    addCraftedSources(
      existingMaterialSources,
      categoryReport,
      recipesPerItemData,
      recipeIndex,
      itemIndex,
      jobNameIndex
    );

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousStatusCounts,
    craftedAdditions,
    craftedMisses
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
  console.log(`Crafted additions: ${Object.keys(craftedAdditions).length}`);
  console.log(`Crafted misses: ${Object.keys(craftedMisses).length}`);
  console.log(`Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});