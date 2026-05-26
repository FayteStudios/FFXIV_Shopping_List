// scripts/mergeGeneratedRecipes.mjs
import fs from "fs";
import path from "path";

const TARGET_FILE = path.resolve("src/data/recipes/culinarian.json");
const GENERATED_FILE = path.resolve("generated/culinarian-missing-generated.json");
const REPORT_FILE = path.resolve("generated/culinarian-merge-report.json");

const SHOULD_WRITE = process.argv.includes("--write");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function makeLogicalKey(recipe) {
  const name = recipe.name ?? "";
  const job = recipe.job ?? "";
  const level = recipe.level ?? "";
  const stars = recipe.stars ?? 0;

  return `${name.toLowerCase()}|${job.toLowerCase()}|${level}|${stars}`;
}

function validateRecipe(id, recipe) {
  const issues = [];

  if (!recipe || typeof recipe !== "object") {
    issues.push("Recipe is not an object");
    return issues;
  }

  if (!recipe.name || typeof recipe.name !== "string") {
    issues.push("Missing or invalid name");
  }

  if (!recipe.job || typeof recipe.job !== "string") {
    issues.push("Missing or invalid job");
  }

  if (!Number.isFinite(recipe.level)) {
    issues.push("Missing or invalid level");
  }

  if (recipe.stars !== undefined && !Number.isFinite(recipe.stars)) {
    issues.push("Invalid stars");
  }

  if (!Number.isFinite(recipe.amountCreated)) {
    issues.push("Missing or invalid amountCreated");
  }

  if (!Array.isArray(recipe.ingredients)) {
    issues.push("Missing or invalid ingredients array");
  } else if (recipe.ingredients.length === 0) {
    issues.push("Recipe has zero ingredients");
  } else {
    recipe.ingredients.forEach((ingredient, index) => {
      if (!ingredient.name || typeof ingredient.name !== "string") {
        issues.push(`Ingredient ${index} missing or invalid name`);
      }

      if (!Number.isFinite(ingredient.quantity)) {
        issues.push(`Ingredient ${index} missing or invalid quantity`);
      }

      if (ingredient.type !== "recipe" && ingredient.type !== "material") {
        issues.push(`Ingredient ${index} has invalid type`);
      }
    });
  }

  return issues;
}

function makeTimestamp() {
  const now = new Date();

  return now
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+$/, "");
}

function main() {
  const targetRecipes = readJson(TARGET_FILE);
  const generatedRecipes = readJson(GENERATED_FILE);

  const mergedRecipes = { ...targetRecipes };

  const existingIds = new Set(Object.keys(targetRecipes));
  const existingLogicalKeys = new Map();

  for (const [id, recipe] of Object.entries(targetRecipes)) {
    existingLogicalKeys.set(makeLogicalKey(recipe), id);
  }

  const report = {
    targetFile: TARGET_FILE,
    generatedFile: GENERATED_FILE,
    writeMode: SHOULD_WRITE,
    targetCountBefore: Object.keys(targetRecipes).length,
    generatedCount: Object.keys(generatedRecipes).length,
    added: [],
    skippedExactId: [],
    skippedLogicalDuplicate: [],
    skippedInvalid: [],
    idCollisions: [],
  };

  for (const [generatedId, generatedRecipe] of Object.entries(generatedRecipes)) {
    const validationIssues = validateRecipe(generatedId, generatedRecipe);

    if (validationIssues.length > 0) {
      report.skippedInvalid.push({
        id: generatedId,
        name: generatedRecipe?.name ?? null,
        issues: validationIssues,
      });
      continue;
    }

    if (existingIds.has(generatedId)) {
      const existingRecipe = targetRecipes[generatedId];
      const existingJson = JSON.stringify(existingRecipe);
      const generatedJson = JSON.stringify(generatedRecipe);

      if (existingJson !== generatedJson) {
        report.idCollisions.push({
          id: generatedId,
          existingName: existingRecipe.name,
          generatedName: generatedRecipe.name,
          reason: "Same ID exists, but recipe content differs",
        });
      }

      report.skippedExactId.push({
        id: generatedId,
        name: generatedRecipe.name,
      });
      continue;
    }

    const logicalKey = makeLogicalKey(generatedRecipe);

    if (existingLogicalKeys.has(logicalKey)) {
      report.skippedLogicalDuplicate.push({
        generatedId,
        existingId: existingLogicalKeys.get(logicalKey),
        name: generatedRecipe.name,
        level: generatedRecipe.level,
        stars: generatedRecipe.stars ?? 0,
      });
      continue;
    }

    mergedRecipes[generatedId] = generatedRecipe;
    existingIds.add(generatedId);
    existingLogicalKeys.set(logicalKey, generatedId);

    report.added.push({
      id: generatedId,
      name: generatedRecipe.name,
      level: generatedRecipe.level,
      stars: generatedRecipe.stars ?? 0,
    });
  }

  report.targetCountAfter = Object.keys(mergedRecipes).length;

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  writeJson(REPORT_FILE, report);

  console.log(`Target recipes before: ${report.targetCountBefore}`);
  console.log(`Generated recipes:      ${report.generatedCount}`);
  console.log(`Added:                  ${report.added.length}`);
  console.log(`Skipped exact ID:       ${report.skippedExactId.length}`);
  console.log(`Skipped logical dupes:  ${report.skippedLogicalDuplicate.length}`);
  console.log(`Skipped invalid:        ${report.skippedInvalid.length}`);
  console.log(`ID collisions:          ${report.idCollisions.length}`);
  console.log(`Target recipes after:   ${report.targetCountAfter}`);
  console.log(`Report written to:      ${REPORT_FILE}`);

  if (!SHOULD_WRITE) {
    console.log("");
    console.log("Dry run only. No files were changed.");
    console.log("To apply the merge, run:");
    console.log("node scripts/mergeGeneratedRecipes.mjs --write");
    return;
  }

  const backupFile = `${TARGET_FILE}.backup-${makeTimestamp()}`;
  fs.copyFileSync(TARGET_FILE, backupFile);

  writeJson(TARGET_FILE, mergedRecipes);

  console.log("");
  console.log(`Backup written to:      ${backupFile}`);
  console.log(`Merged recipes written: ${TARGET_FILE}`);
}

main();