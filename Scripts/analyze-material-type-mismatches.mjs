import fs from "node:fs/promises";
import path from "node:path";

const RECIPES_DIRECTORY = path.resolve("src/data/recipes");

const OUTPUT_PATH = path.resolve(
  "src/data/debug-material-type-mismatches.json"
);

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function readRecipeFiles() {
  const files = await fs.readdir(RECIPES_DIRECTORY);
  const jsonFiles = files.filter((file) => file.endsWith(".json")).sort();

  const recipes = {};
  const recipeFileMap = {};

  for (const fileName of jsonFiles) {
    const filePath = path.join(RECIPES_DIRECTORY, fileName);
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text);

    for (const [recipeKey, recipe] of Object.entries(parsed)) {
      recipes[recipeKey] = recipe;
      recipeFileMap[recipeKey] = fileName;
    }
  }

  return {
    recipes,
    recipeFileMap,
    fileCount: jsonFiles.length,
  };
}

function buildRecipeOutputIndex(recipes, recipeFileMap) {
  const outputIndex = new Map();

  for (const [recipeKey, recipe] of Object.entries(recipes)) {
    const recipeName = recipe.name;

    if (!recipeName) {
      continue;
    }

    const normalizedName = normalizeName(recipeName);

    if (!outputIndex.has(normalizedName)) {
      outputIndex.set(normalizedName, []);
    }

    outputIndex.get(normalizedName).push({
      recipeKey,
      recipeName,
      job: recipe.job ?? null,
      level: recipe.level ?? null,
      stars: recipe.stars ?? 0,
      amountCreated: recipe.amountCreated ?? 1,
      fileName: recipeFileMap[recipeKey] ?? null,
    });
  }

  return outputIndex;
}

function findMaterialIngredientsThatAreCraftable(recipes, recipeFileMap, outputIndex) {
  const mismatchesByIngredientName = {};

  for (const [recipeKey, recipe] of Object.entries(recipes)) {
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

    for (const ingredient of ingredients) {
      if (ingredient.type !== "material") {
        continue;
      }

      const ingredientName = ingredient.name;
      const normalizedIngredientName = normalizeName(ingredientName);
      const matchingCraftableRecipes = outputIndex.get(normalizedIngredientName) ?? [];

      if (matchingCraftableRecipes.length === 0) {
        continue;
      }

      const mismatchKey = slugify(ingredientName);

      if (!mismatchesByIngredientName[mismatchKey]) {
        mismatchesByIngredientName[mismatchKey] = {
          ingredientName,
          currentType: "material",
          suggestedType: "recipe",
          usedByRecipeCount: 0,
          totalQuantityUsed: 0,
          craftableRecipeCount: matchingCraftableRecipes.length,
          craftableRecipes: matchingCraftableRecipes,
          usedByRecipes: [],
        };
      }

      const quantity = Number(ingredient.quantity ?? 0);

      mismatchesByIngredientName[mismatchKey].usedByRecipeCount += 1;
      mismatchesByIngredientName[mismatchKey].totalQuantityUsed += Number.isFinite(quantity)
        ? quantity
        : 0;

      mismatchesByIngredientName[mismatchKey].usedByRecipes.push({
        recipeKey,
        recipeName: recipe.name ?? null,
        recipeJob: recipe.job ?? null,
        recipeLevel: recipe.level ?? null,
        recipeStars: recipe.stars ?? 0,
        fileName: recipeFileMap[recipeKey] ?? null,
        ingredient: {
          name: ingredient.name,
          quantity: ingredient.quantity ?? null,
          type: ingredient.type,
        },
      });
    }
  }

  return Object.fromEntries(
    Object.entries(mismatchesByIngredientName).sort(([, left], [, right]) => {
      return right.usedByRecipeCount - left.usedByRecipeCount;
    })
  );
}

function summarizeByFile(mismatchesByIngredientName) {
  const fileSummary = {};

  for (const mismatch of Object.values(mismatchesByIngredientName)) {
    for (const usage of mismatch.usedByRecipes) {
      const fileName = usage.fileName ?? "unknown";

      if (!fileSummary[fileName]) {
        fileSummary[fileName] = {
          affectedIngredientUsageCount: 0,
          affectedRecipeKeys: new Set(),
          affectedIngredientNames: new Set(),
        };
      }

      fileSummary[fileName].affectedIngredientUsageCount += 1;
      fileSummary[fileName].affectedRecipeKeys.add(usage.recipeKey);
      fileSummary[fileName].affectedIngredientNames.add(mismatch.ingredientName);
    }
  }

  return Object.fromEntries(
    Object.entries(fileSummary)
      .map(([fileName, summary]) => [
        fileName,
        {
          affectedIngredientUsageCount: summary.affectedIngredientUsageCount,
          affectedRecipeCount: summary.affectedRecipeKeys.size,
          affectedIngredientNameCount: summary.affectedIngredientNames.size,
          affectedIngredientNames: [...summary.affectedIngredientNames].sort((a, b) =>
            a.localeCompare(b)
          ),
        },
      ])
      .sort(([, left], [, right]) => {
        return right.affectedIngredientUsageCount - left.affectedIngredientUsageCount;
      })
  );
}

function getTopMismatches(mismatchesByIngredientName, limit = 50) {
  return Object.entries(mismatchesByIngredientName)
    .slice(0, limit)
    .map(([key, mismatch]) => ({
      key,
      ingredientName: mismatch.ingredientName,
      usedByRecipeCount: mismatch.usedByRecipeCount,
      totalQuantityUsed: mismatch.totalQuantityUsed,
      craftableRecipeCount: mismatch.craftableRecipeCount,
      craftableRecipes: mismatch.craftableRecipes,
      sampleUsedByRecipes: mismatch.usedByRecipes.slice(0, 10),
    }));
}

async function main() {
  console.log("Reading recipe JSON files...");
  const { recipes, recipeFileMap, fileCount } = await readRecipeFiles();

  console.log(`Read ${fileCount} recipe files.`);
  console.log(`Loaded ${Object.keys(recipes).length} recipes.`);

  const outputIndex = buildRecipeOutputIndex(recipes, recipeFileMap);

  console.log(`Indexed ${outputIndex.size} craftable recipe output names.`);

  const mismatchesByIngredientName = findMaterialIngredientsThatAreCraftable(
    recipes,
    recipeFileMap,
    outputIndex
  );

  const mismatchEntries = Object.entries(mismatchesByIngredientName);

  const totalAffectedIngredientUsageCount = mismatchEntries.reduce(
    (total, [, mismatch]) => total + mismatch.usedByRecipeCount,
    0
  );

  const fileSummary = summarizeByFile(mismatchesByIngredientName);

  const output = {
    metadata: {
      recipeFileCount: fileCount,
      recipeCount: Object.keys(recipes).length,
      craftableOutputNameCount: outputIndex.size,
      mismatchedIngredientNameCount: mismatchEntries.length,
      totalAffectedIngredientUsageCount,
      note: "These are ingredients marked as type material even though their name matches a recipe output in the local recipe JSON. They are likely candidates to change from type material to type recipe.",
    },
    fileSummary,
    topMismatches: getTopMismatches(mismatchesByIngredientName),
    mismatchesByIngredientName,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("");
  console.log("Material type mismatch summary:");
  console.log(`  Mismatched ingredient names: ${mismatchEntries.length}`);
  console.log(`  Total affected ingredient usages: ${totalAffectedIngredientUsageCount}`);
  console.log("");
  console.log("Open src/data/debug-material-type-mismatches.json next.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});