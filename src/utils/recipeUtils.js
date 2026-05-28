export function getRecipeEntries(recipes) {
  return Object.entries(recipes).map(([recipeId, recipe]) => ({
    recipeId,
    ...recipe,
  }));
}

export function createRecipeOutputIndex(recipes) {
  const outputIndex = new Map();

  for (const [recipeId, recipe] of Object.entries(recipes)) {
    const existing = outputIndex.get(recipe.name) || [];
    existing.push({
      recipeId,
      ...recipe,
    });
    outputIndex.set(recipe.name, existing);
  }

  return outputIndex;
}

function getOutputIndex(recipes, outputIndex) {
  return outputIndex || createRecipeOutputIndex(recipes);
}

export function findRecipesByOutputName(recipes, itemName, outputIndex = null) {
  const index = getOutputIndex(recipes, outputIndex);
  return index.get(itemName) || [];
}

export function findBestRecipeForItem(
  recipes,
  itemName,
  preferredJob = null,
  outputIndex = null
) {
  const matchingRecipes = findRecipesByOutputName(
    recipes,
    itemName,
    outputIndex
  );

  if (matchingRecipes.length === 0) {
    return null;
  }

  if (preferredJob) {
    const sameJobRecipe = matchingRecipes.find(
      (recipe) => recipe.job === preferredJob
    );

    if (sameJobRecipe) {
      return sameJobRecipe;
    }
  }

  return matchingRecipes[0];
}

export function isCraftable(recipes, itemName, outputIndex = null) {
  return findRecipesByOutputName(recipes, itemName, outputIndex).length > 0;
}

export function normalizeIngredientType(recipes, ingredient, outputIndex = null) {
  return {
    ...ingredient,
    type: isCraftable(recipes, ingredient.name, outputIndex)
      ? "recipe"
      : "material",
  };
}

export function calculateRawMaterials(
  recipes,
  recipeId,
  multiplier = 1,
  preferredJob = null,
  outputIndex = null,
  rawMaterialCache = new Map()
) {
  const recipe = recipes[recipeId];

  if (!recipe) {
    return {};
  }

  const activePreferredJob = preferredJob || recipe.job;
  const cacheKey = `${recipeId}|${multiplier}|${activePreferredJob}`;

  if (rawMaterialCache.has(cacheKey)) {
    return { ...rawMaterialCache.get(cacheKey) };
  }

  const index = getOutputIndex(recipes, outputIndex);
  const totals = {};

  for (const ingredient of recipe.ingredients) {
    const totalQuantity = ingredient.quantity * multiplier;

    const nestedRecipe = findBestRecipeForItem(
      recipes,
      ingredient.name,
      activePreferredJob,
      index
    );

    if (nestedRecipe) {
      const nestedTotals = calculateRawMaterials(
        recipes,
        nestedRecipe.recipeId,
        totalQuantity,
        activePreferredJob,
        index,
        rawMaterialCache
      );

      for (const [materialName, materialQuantity] of Object.entries(
        nestedTotals
      )) {
        totals[materialName] = (totals[materialName] || 0) + materialQuantity;
      }
    } else {
      totals[ingredient.name] = (totals[ingredient.name] || 0) + totalQuantity;
    }
  }

  rawMaterialCache.set(cacheKey, { ...totals });
  return totals;
}

export function calculateCraftingListRawMaterials(recipes, craftingList) {
  const totals = {};
  const outputIndex = createRecipeOutputIndex(recipes);
  const rawMaterialCache = new Map();

  for (const entry of craftingList) {
    const recipeTotals = calculateRawMaterials(
      recipes,
      entry.recipeId,
      entry.quantity,
      null,
      outputIndex,
      rawMaterialCache
    );

    for (const [materialName, materialQuantity] of Object.entries(recipeTotals)) {
      totals[materialName] = (totals[materialName] || 0) + materialQuantity;
    }
  }

  return totals;
}