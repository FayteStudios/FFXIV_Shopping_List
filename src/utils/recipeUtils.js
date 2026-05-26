export function getRecipeEntries(recipes) {
  return Object.entries(recipes).map(([recipeId, recipe]) => ({
    recipeId,
    ...recipe,
  }));
}

export function findRecipesByOutputName(recipes, itemName) {
  return getRecipeEntries(recipes).filter((recipe) => recipe.name === itemName);
}

export function findBestRecipeForItem(recipes, itemName, preferredJob = null) {
  const matchingRecipes = findRecipesByOutputName(recipes, itemName);

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

export function isCraftable(recipes, itemName) {
  return findRecipesByOutputName(recipes, itemName).length > 0;
}

export function normalizeIngredientType(recipes, ingredient) {
  return {
    ...ingredient,
    type: isCraftable(recipes, ingredient.name) ? "recipe" : "material",
  };
}

export function calculateRawMaterials(
  recipes,
  recipeId,
  multiplier = 1,
  preferredJob = null
) {
  const recipe = recipes[recipeId];

  if (!recipe) {
    return {};
  }

  const totals = {};
  const activePreferredJob = preferredJob || recipe.job;

  for (const ingredient of recipe.ingredients) {
    const totalQuantity = ingredient.quantity * multiplier;
    const nestedRecipe = findBestRecipeForItem(
      recipes,
      ingredient.name,
      activePreferredJob
    );

    if (nestedRecipe) {
      const nestedTotals = calculateRawMaterials(
        recipes,
        nestedRecipe.recipeId,
        totalQuantity,
        activePreferredJob
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

  return totals;
}

export function calculateCraftingListRawMaterials(recipes, craftingList) {
  const totals = {};

  for (const entry of craftingList) {
    const recipeTotals = calculateRawMaterials(
      recipes,
      entry.recipeId,
      entry.quantity
    );

    for (const [materialName, materialQuantity] of Object.entries(recipeTotals)) {
      totals[materialName] = (totals[materialName] || 0) + materialQuantity;
    }
  }

  return totals;
}