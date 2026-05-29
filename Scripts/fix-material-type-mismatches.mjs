import fs from "node:fs/promises";
import path from "node:path";

const RECIPES_DIRECTORY = path.resolve("src/data/recipes");

const BACKUP_DIRECTORY = path.resolve(
  "src/data/recipes.backup-before-type-fix"
);

const REPORT_PATH = path.resolve(
  "src/data/debug-material-type-fix-report.json"
);

// Keep this true for the first run.
// It will create a report but will NOT edit your recipe JSON files.
const DRY_RUN = false;

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

async function readRecipeFiles() {
  const files = await fs.readdir(RECIPES_DIRECTORY);
  const jsonFiles = files.filter((file) => file.endsWith(".json")).sort();

  const recipeFiles = {};
  const allRecipes = {};
  const recipeFileMap = {};

  for (const fileName of jsonFiles) {
    const filePath = path.join(RECIPES_DIRECTORY, fileName);
    const text = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(text);

    recipeFiles[fileName] = parsed;

    for (const [recipeKey, recipe] of Object.entries(parsed)) {
      allRecipes[recipeKey] = recipe;
      recipeFileMap[recipeKey] = fileName;
    }
  }

  return {
    recipeFiles,
    allRecipes,
    recipeFileMap,
    fileCount: jsonFiles.length,
  };
}

function buildRecipeOutputIndex(allRecipes, recipeFileMap) {
  const outputIndex = new Map();

  for (const [recipeKey, recipe] of Object.entries(allRecipes)) {
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

function shouldChangeIngredientType(ingredient, recipeOutputIndex) {
  if (!ingredient || typeof ingredient !== "object") {
    return false;
  }

  if (ingredient.type !== "material") {
    return false;
  }

  const ingredientName = ingredient.name;

  if (!ingredientName) {
    return false;
  }

  const matchingRecipes = recipeOutputIndex.get(normalizeName(ingredientName)) ?? [];

  return matchingRecipes.length > 0;
}

function getMatchingCraftableRecipes(ingredient, recipeOutputIndex) {
  if (!ingredient?.name) {
    return [];
  }

  return recipeOutputIndex.get(normalizeName(ingredient.name)) ?? [];
}

function fixRecipeFile({ fileName, recipesForFile, recipeOutputIndex }) {
  const changedRecipes = {};
  const changes = [];

  for (const [recipeKey, recipe] of Object.entries(recipesForFile)) {
    let recipeChanged = false;

    const originalIngredients = Array.isArray(recipe.ingredients)
      ? recipe.ingredients
      : [];

    const updatedIngredients = originalIngredients.map((ingredient, ingredientIndex) => {
      if (!shouldChangeIngredientType(ingredient, recipeOutputIndex)) {
        return ingredient;
      }

      const matchingCraftableRecipes = getMatchingCraftableRecipes(
        ingredient,
        recipeOutputIndex
      );

      recipeChanged = true;

      changes.push({
        fileName,
        recipeKey,
        recipeName: recipe.name ?? null,
        recipeJob: recipe.job ?? null,
        recipeLevel: recipe.level ?? null,
        ingredientIndex,
        ingredientName: ingredient.name,
        quantity: ingredient.quantity ?? null,
        oldType: ingredient.type,
        newType: "recipe",
        matchingCraftableRecipes,
      });

      return {
        ...ingredient,
        type: "recipe",
      };
    });

    if (recipeChanged) {
      changedRecipes[recipeKey] = {
        ...recipe,
        ingredients: updatedIngredients,
      };
    } else {
      changedRecipes[recipeKey] = recipe;
    }
  }

  return {
    updatedRecipesForFile: changedRecipes,
    changes,
  };
}

async function writeBackupFiles(recipeFiles, changedFileNames) {
  await fs.mkdir(BACKUP_DIRECTORY, { recursive: true });

  for (const fileName of changedFileNames) {
    const backupPath = path.join(BACKUP_DIRECTORY, fileName);
    const originalData = recipeFiles[fileName];

    await fs.writeFile(
      backupPath,
      JSON.stringify(originalData, null, 2),
      "utf8"
    );
  }
}

async function writeUpdatedRecipeFiles(updatedRecipeFilesByFileName) {
  for (const [fileName, updatedRecipesForFile] of Object.entries(
    updatedRecipeFilesByFileName
  )) {
    const filePath = path.join(RECIPES_DIRECTORY, fileName);

    await fs.writeFile(
      filePath,
      JSON.stringify(updatedRecipesForFile, null, 2),
      "utf8"
    );
  }
}

function summarizeChangesByFile(changes) {
  const summary = {};

  for (const change of changes) {
    if (!summary[change.fileName]) {
      summary[change.fileName] = {
        changedIngredientUsageCount: 0,
        changedRecipeKeys: new Set(),
        changedIngredientNames: new Set(),
      };
    }

    summary[change.fileName].changedIngredientUsageCount += 1;
    summary[change.fileName].changedRecipeKeys.add(change.recipeKey);
    summary[change.fileName].changedIngredientNames.add(change.ingredientName);
  }

  return Object.fromEntries(
    Object.entries(summary)
      .map(([fileName, entry]) => [
        fileName,
        {
          changedIngredientUsageCount: entry.changedIngredientUsageCount,
          changedRecipeCount: entry.changedRecipeKeys.size,
          changedIngredientNameCount: entry.changedIngredientNames.size,
          changedIngredientNames: [...entry.changedIngredientNames].sort((a, b) =>
            a.localeCompare(b)
          ),
        },
      ])
      .sort(([, left], [, right]) => {
        return right.changedIngredientUsageCount - left.changedIngredientUsageCount;
      })
  );
}

function summarizeTopChangedIngredients(changes) {
  const summary = {};

  for (const change of changes) {
    const key = normalizeName(change.ingredientName);

    if (!summary[key]) {
      summary[key] = {
        ingredientName: change.ingredientName,
        changedUsageCount: 0,
        totalQuantity: 0,
        matchingCraftableRecipes: change.matchingCraftableRecipes,
        sampleChangedRecipes: [],
      };
    }

    const quantity = Number(change.quantity ?? 0);

    summary[key].changedUsageCount += 1;
    summary[key].totalQuantity += Number.isFinite(quantity) ? quantity : 0;

    if (summary[key].sampleChangedRecipes.length < 10) {
      summary[key].sampleChangedRecipes.push({
        fileName: change.fileName,
        recipeKey: change.recipeKey,
        recipeName: change.recipeName,
        recipeJob: change.recipeJob,
        recipeLevel: change.recipeLevel,
        quantity: change.quantity,
      });
    }
  }

  return Object.values(summary)
    .sort((left, right) => right.changedUsageCount - left.changedUsageCount)
    .slice(0, 100);
}

async function main() {
  console.log("Reading recipe JSON files...");

  const { recipeFiles, allRecipes, recipeFileMap, fileCount } =
    await readRecipeFiles();

  console.log(`Read ${fileCount} recipe files.`);
  console.log(`Loaded ${Object.keys(allRecipes).length} recipes.`);

  const recipeOutputIndex = buildRecipeOutputIndex(allRecipes, recipeFileMap);

  console.log(`Indexed ${recipeOutputIndex.size} craftable recipe output names.`);
  console.log("");

  const updatedRecipeFilesByFileName = {};
  const allChanges = [];

  for (const [fileName, recipesForFile] of Object.entries(recipeFiles)) {
    const { updatedRecipesForFile, changes } = fixRecipeFile({
      fileName,
      recipesForFile,
      recipeOutputIndex,
    });

    if (changes.length > 0) {
      updatedRecipeFilesByFileName[fileName] = updatedRecipesForFile;
      allChanges.push(...changes);
    }
  }

  const changedFileNames = Object.keys(updatedRecipeFilesByFileName);

  const report = {
    metadata: {
      dryRun: DRY_RUN,
      recipeFileCount: fileCount,
      recipeCount: Object.keys(allRecipes).length,
      craftableOutputNameCount: recipeOutputIndex.size,
      changedFileCount: changedFileNames.length,
      changedIngredientUsageCount: allChanges.length,
      note: DRY_RUN
        ? "Dry run only. No recipe JSON files were edited."
        : "Recipe JSON files were edited. Backups were written before edits.",
    },
    changedFileNames,
    changesByFile: summarizeChangesByFile(allChanges),
    topChangedIngredients: summarizeTopChangedIngredients(allChanges),
    changes: allChanges,
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  if (DRY_RUN) {
    console.log("Dry run complete. No files were edited.");
  } else {
    console.log("Writing backups...");
    await writeBackupFiles(recipeFiles, changedFileNames);

    console.log("Writing updated recipe files...");
    await writeUpdatedRecipeFiles(updatedRecipeFilesByFileName);
  }

  console.log("");
  console.log(`Wrote ${REPORT_PATH}`);
  console.log("");
  console.log("Material type fix summary:");
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Files that would change: ${changedFileNames.length}`);
  console.log(`  Ingredient usages that would change: ${allChanges.length}`);

  if (!DRY_RUN) {
    console.log("");
    console.log(`Backups written to ${BACKUP_DIRECTORY}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});