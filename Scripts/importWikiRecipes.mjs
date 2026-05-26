// scripts/importWikiRecipes.mjs
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const JOB = "Culinarian";
const JOB_SLUG = "culinarian";

const SOURCE_URLS = [
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_1_-_9",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_10_-_19",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_20_-_29",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_30_-_39",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_40_-_49",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_50",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_51_-_59",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_60",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_61_-_69",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_70",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_71_-_79",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_80",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_81_-_89",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_90",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_91_-_99",
  "https://ffxiv.consolegameswiki.com/wiki/culinarian_Recipes/Level_100"
];

// Your screenshots show the recipe JSON files here:
const DATA_DIR = path.resolve("src/data/recipes");

const OUTPUT_DIR = path.resolve("generated");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "culinarian-missing-generated.json");

const CATEGORY_MAP = {
  Furnishing: "Furniture",
  "Outdoor Furnishing": "Furniture",
  "Exterior Wall": "Furniture",
  Roof: "Furniture",
  Door: "Furniture",
  "Roof Decoration": "Furniture",
  "Exterior Wall Decoration": "Furniture",
  Miscellany: "Other",
  Other: "Other",
  Minion: "Other",
};

function slugifyRecipeName(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeRecipeId(name, jobSlug, level) {
  return `${slugifyRecipeName(name)}-${jobSlug}-${level}`;
}

function cleanName(name) {
  return name
    .replace(/\s*\(Learned from:.*?\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function starsFromText(text) {
  const matches = text.match(/★/g);
  return matches ? matches.length : 0;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadAllRecipes() {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`DATA_DIR does not exist: ${DATA_DIR}`);
  }

  const recipes = {};

  for (const fileName of fs.readdirSync(DATA_DIR)) {
    if (!fileName.endsWith(".json")) continue;

    const filePath = path.join(DATA_DIR, fileName);
    const fileRecipes = loadJson(filePath);

    Object.assign(recipes, fileRecipes);
  }

  return recipes;
}

function buildCraftableNameSet(allRecipes) {
  return new Set(
    Object.values(allRecipes)
      .map((recipe) => recipe.name)
      .filter(Boolean)
  );
}

function classifyCategory(typeText, recipeName) {
  if (recipeName.includes("Skybuilders'")) {
    return "Skybuilders";
  }

  return CATEGORY_MAP[typeText] || null;
}

function parseRecipeRowsFromHtml(html) {
  const $ = cheerio.load(html);
  const recipes = [];

  $("table").each((_, table) => {
    const headers = $(table)
      .find("tr")
      .first()
      .find("th")
      .map((__, th) => $(th).text().trim())
      .get();

    const itemIndex = headers.findIndex((h) => h === "Item");
    const classIndex = headers.findIndex((h) => h === "Class");
    const levelIndex = headers.findIndex((h) => h === "Level");
    const typeIndex = headers.findIndex((h) => h === "Type");
    const yieldIndex = headers.findIndex((h) => h === "Yield");
    const ingredientsIndex = headers.findIndex((h) => h === "Ingredients");

    if (
      itemIndex === -1 ||
      classIndex === -1 ||
      levelIndex === -1 ||
      typeIndex === -1 ||
      yieldIndex === -1 ||
      ingredientsIndex === -1
    ) {
      return;
    }

    $(table)
      .find("tr")
      .slice(1)
      .each((__, row) => {
        const cells = $(row).find("td");

        if (cells.length === 0) return;

        const rawItemText = $(cells[itemIndex])
          .text()
          .replace(/\s+/g, " ")
          .trim();

        const recipeName = cleanName(rawItemText);
        const classText = $(cells[classIndex]).text().trim();
        const levelText = $(cells[levelIndex]).text().trim();
        const typeText = $(cells[typeIndex]).text().replace(/\s+/g, " ").trim();
        const yieldText = $(cells[yieldIndex]).text().trim();
        const ingredientsCell = $(cells[ingredientsIndex]);

        if (!recipeName || classText !== JOB) return;

        const level = Number.parseInt(levelText, 10);
        const amountCreated = Number.parseInt(yieldText, 10) || 1;
        const stars = Math.min(starsFromText($(cells[levelIndex]).text()), 4);

        const ingredientLinks = ingredientsCell
          .find("a")
          .toArray()
          .map((link) => $(link).text().replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .filter((name) => name !== "Thal's Tools");

        const ingredientText = ingredientsCell
          .text()
          .replace(/Thal's Tools/g, "")
          .replace(/\s+/g, " ")
          .trim();

        recipes.push({
          name: recipeName,
          job: JOB,
          level,
          stars,
          amountCreated,
          sourceType: typeText,
          sourceIngredientText: ingredientText,
          sourceIngredientLinks: ingredientLinks,
        });
      });
  });

  return recipes;
}

function parseIngredients(recipe, craftableNames) {
  const names = [...recipe.sourceIngredientLinks];
  let cursor = recipe.sourceIngredientText;

  const ingredients = [];

  for (const name of names) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Matches:
    // 3 Adamantite Nugget
    // x3 Adamantite Nugget
    // ×3 Adamantite Nugget
    const regex = new RegExp(`(?:x|×)?\\s*(\\d+)\\s+${escapedName}`);

    const match = cursor.match(regex);
    if (!match) continue;

    const quantity = Number.parseInt(match[1], 10);

    ingredients.push({
      name,
      quantity,
      type: craftableNames.has(name) ? "recipe" : "material",
    });

    cursor = cursor.replace(match[0], " ");
  }

  return ingredients;
}

async function main() {
  const allRecipes = loadAllRecipes();
  const existingIds = new Set(Object.keys(allRecipes));
  const craftableNames = buildCraftableNameSet(allRecipes);

  const generated = {};

  for (const url of SOURCE_URLS) {
    console.log(`Fetching ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const html = await response.text();
    const parsedRows = parseRecipeRowsFromHtml(html);

    console.log(`Parsed ${parsedRows.length} ${JOB} recipe rows from source.`);

    for (const parsed of parsedRows) {
      if (!Number.isFinite(parsed.level)) {
        console.warn(`Skipping ${parsed.name}: invalid level`);
        continue;
      }

      const recipeId = makeRecipeId(parsed.name, JOB_SLUG, parsed.level);

      if (existingIds.has(recipeId) || generated[recipeId]) {
        continue;
      }

      const ingredients = parseIngredients(parsed, craftableNames);

      if (ingredients.length === 0) {
        console.warn(`Warning: no ingredients parsed for ${parsed.name}`);
        console.warn(`  Raw ingredient text: ${parsed.sourceIngredientText}`);
        console.warn(
          `  Ingredient links: ${parsed.sourceIngredientLinks.join(", ")}`
        );
      }

      const entry = {
        name: parsed.name,
        job: parsed.job,
        level: parsed.level,
        stars: parsed.stars,
        amountCreated: parsed.amountCreated,
        ingredients,
      };

      const category = classifyCategory(parsed.sourceType, parsed.name);
      if (category) {
        entry.category = category;
      }

      generated[recipeId] = entry;
    }
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(generated, null, 2));

  console.log(`Generated ${Object.keys(generated).length} missing recipes.`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});