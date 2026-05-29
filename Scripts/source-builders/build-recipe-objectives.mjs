import fs from "node:fs/promises";
import path from "node:path";

const RECIPES_DIR = path.resolve("src/data/recipes");

const OUTPUT_PATH = path.resolve("src/data/recipeObjectives.json");
const REPORT_PATH = path.resolve(
  "src/data/debug/debug-recipe-objectives-report.json"
);

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const TEAMCRAFT_FILES = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  levesPerItem: `${TEAMCRAFT_BASE}/leves-per-item.json`,
  leves: `${TEAMCRAFT_BASE}/leves.json`,
  usedInQuests: `${TEAMCRAFT_BASE}/used-in-quests.json`,
  quests: `${TEAMCRAFT_BASE}/quests.json`,
};

const CRAFTING_JOBS = new Set([
  "Carpenter",
  "Blacksmith",
  "Armorer",
  "Goldsmith",
  "Leatherworker",
  "Weaver",
  "Alchemist",
  "Culinarian",
]);

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

function parseJsonLenient(text, filePath) {
  try {
    return JSON.parse(text);
  } catch {
    const withoutTrailingCommas = text.replace(/,\s*([}\]])/g, "$1");

    try {
      return JSON.parse(withoutTrailingCommas);
    } catch (error) {
      throw new Error(`Could not parse JSON from ${filePath}: ${error.message}`);
    }
  }
}

async function readJsonLenient(filePath) {
  const text = await readText(filePath);
  return parseJsonLenient(text, filePath);
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function asArrayWithIds(value) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => ({
      id: String(index),
      ...(entry && typeof entry === "object" ? entry : { value: entry }),
    }));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, entry]) => ({
      id,
      ...(entry && typeof entry === "object" && !Array.isArray(entry)
        ? entry
        : { value: entry }),
    }));
  }

  return [];
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

function getLocalizedName(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (typeof value.en === "string" && value.en.trim()) {
    return value.en.trim();
  }

  if (typeof value.name === "string" && value.name.trim()) {
    return value.name.trim();
  }

  if (value.name) {
    return getLocalizedName(value.name);
  }

  if (typeof value.Name === "string" && value.Name.trim()) {
    return value.Name.trim();
  }

  if (value.Name) {
    return getLocalizedName(value.Name);
  }

  if (typeof value.value === "string" && value.value.trim()) {
    return value.value.trim();
  }

  if (value.value) {
    return getLocalizedName(value.value);
  }

  return null;
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyItemName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadLocalRecipes() {
  const files = await fs.readdir(RECIPES_DIR);
  const recipeFiles = files.filter((fileName) => fileName.endsWith(".json"));

  const recipes = {};

  for (const fileName of recipeFiles) {
    const filePath = path.join(RECIPES_DIR, fileName);
    const parsed = await readJsonLenient(filePath);

    for (const [recipeId, recipe] of Object.entries(parsed)) {
      recipes[recipeId] = {
        ...recipe,
        recipeId,
        sourceFile: fileName,
      };
    }
  }

  return recipes;
}

function buildItemIndexes(itemsData) {
  const byId = new Map();
  const idsByNormalizedName = new Map();

  for (const item of asArrayWithIds(itemsData)) {
    const itemId = pickFirstNumber(item.id, item.ID, item.rowId, item.row_id);

    if (itemId === null) {
      continue;
    }

    const name = getLocalizedName(item);

    if (!name) {
      continue;
    }

    const normalizedName = normalizeName(name);

    const record = {
      itemId,
      name,
      normalizedName,
    };

    byId.set(itemId, record);

    if (!idsByNormalizedName.has(normalizedName)) {
      idsByNormalizedName.set(normalizedName, []);
    }

    idsByNormalizedName.get(normalizedName).push(itemId);
  }

  return {
    byId,
    idsByNormalizedName,
  };
}

function buildRecipeItemMatches(recipes, itemIndexes) {
  const matches = {};
  const unmatchedRecipes = {};
  const ambiguousRecipes = {};

  for (const [recipeId, recipe] of Object.entries(recipes)) {
    if (!CRAFTING_JOBS.has(recipe.job)) {
      continue;
    }

    const normalizedRecipeName = normalizeName(recipe.name);
    const itemIds = itemIndexes.idsByNormalizedName.get(normalizedRecipeName) ?? [];

    if (itemIds.length === 0) {
      unmatchedRecipes[recipeId] = {
        name: recipe.name,
        job: recipe.job,
        level: recipe.level,
      };
      continue;
    }

    if (itemIds.length > 1) {
      ambiguousRecipes[recipeId] = {
        name: recipe.name,
        job: recipe.job,
        level: recipe.level,
        itemIds,
      };
    }

    const itemId = itemIds[0];
    const item = itemIndexes.byId.get(itemId);

    matches[recipeId] = {
      recipeId,
      recipeName: recipe.name,
      job: recipe.job,
      level: recipe.level,
      itemId,
      itemName: item?.name ?? recipe.name,
    };
  }

  return {
    matches,
    unmatchedRecipes,
    ambiguousRecipes,
  };
}

function collectNumericIds(value, output = new Set(), depth = 0) {
  if (depth > 5 || value === null || value === undefined) {
    return output;
  }

  if (typeof value === "number" || typeof value === "string") {
    const number = Number(value);

    if (Number.isFinite(number)) {
      output.add(number);
    }

    return output;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNumericIds(entry, output, depth + 1);
    }

    return output;
  }

  if (typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      collectNumericIds(nestedValue, output, depth + 1);
    }
  }

  return output;
}

function getRelatedIdsForItem(lookupData, itemId) {
  const direct = lookupData?.[String(itemId)] ?? lookupData?.[itemId];

  if (direct === undefined || direct === null) {
    return [];
  }

  return [...collectNumericIds(direct)].sort((a, b) => a - b);
}

function getLeveInfo(leveId, levesData) {
  const entry = levesData?.[String(leveId)] ?? levesData?.[leveId];

  if (!entry) {
    return {
      id: leveId,
      name: `Leve ${leveId}`,
      level: null,
      client: null,
      location: null,
    };
  }

  return {
    id: leveId,
    name: getLocalizedName(entry) || getLocalizedName(entry.name) || `Leve ${leveId}`,
    level: pickFirstNumber(
      entry.level,
      entry.lvl,
      entry.classJobLevel,
      entry.class_job_level
    ),
    client:
      getLocalizedName(entry.client) ||
      getLocalizedName(entry.Client) ||
      getLocalizedName(entry.clientName) ||
      null,
    location:
      getLocalizedName(entry.location) ||
      getLocalizedName(entry.placeName) ||
      getLocalizedName(entry.PlaceName) ||
      null,
  };
}

function getQuestInfo(questId, questsData) {
  const entry = questsData?.[String(questId)] ?? questsData?.[questId];

  if (!entry) {
    return {
      id: questId,
      name: `Quest ${questId}`,
      level: null,
      issuer: null,
      location: null,
    };
  }

  return {
    id: questId,
    name: getLocalizedName(entry) || getLocalizedName(entry.name) || `Quest ${questId}`,
    level: pickFirstNumber(
      entry.level,
      entry.lvl,
      entry.classJobLevel,
      entry.class_job_level
    ),
    issuer:
      getLocalizedName(entry.issuer) ||
      getLocalizedName(entry.Issuer) ||
      getLocalizedName(entry.issuerName) ||
      null,
    location:
      getLocalizedName(entry.location) ||
      getLocalizedName(entry.placeName) ||
      getLocalizedName(entry.PlaceName) ||
      null,
  };
}

function dedupeById(records) {
  const seen = new Set();
  const output = [];

  for (const record of records) {
    if (seen.has(record.id)) {
      continue;
    }

    seen.add(record.id);
    output.push(record);
  }

  return output;
}

function buildRecipeObjectives({
  recipes,
  recipeItemMatches,
  levesPerItem,
  leves,
  usedInQuests,
  quests,
}) {
  const output = {};
  const recipesWithLeves = {};
  const recipesWithQuests = {};

  for (const [recipeId, match] of Object.entries(recipeItemMatches)) {
    const recipe = recipes[recipeId];

    const leveIds = getRelatedIdsForItem(levesPerItem, match.itemId);
    const questIds = getRelatedIdsForItem(usedInQuests, match.itemId);

    const leveRecords = dedupeById(
      leveIds.map((leveId) => getLeveInfo(leveId, leves))
    );

    const questRecords = dedupeById(
      questIds.map((questId) => getQuestInfo(questId, quests))
    );

    if (leveRecords.length === 0 && questRecords.length === 0) {
      continue;
    }

    output[recipeId] = {
      recipeId,
      name: recipe.name,
      job: recipe.job,
      level: recipe.level,
      stars: recipe.stars ?? 0,
      itemId: match.itemId,
      itemName: match.itemName,
      leves: leveRecords,
      quests: questRecords,
    };

    if (leveRecords.length > 0) {
      recipesWithLeves[recipeId] = {
        name: recipe.name,
        job: recipe.job,
        level: recipe.level,
        leveCount: leveRecords.length,
        leves: leveRecords.slice(0, 5),
      };
    }

    if (questRecords.length > 0) {
      recipesWithQuests[recipeId] = {
        name: recipe.name,
        job: recipe.job,
        level: recipe.level,
        questCount: questRecords.length,
        quests: questRecords.slice(0, 5),
      };
    }
  }

  return {
    output,
    recipesWithLeves,
    recipesWithQuests,
  };
}

function summarizeByJob(recipeObjectiveData) {
  const summary = {};

  for (const entry of Object.values(recipeObjectiveData)) {
    if (!summary[entry.job]) {
      summary[entry.job] = {
        total: 0,
        leveRecipes: 0,
        questRecipes: 0,
        leveAndQuestRecipes: 0,
      };
    }

    summary[entry.job].total += 1;

    const hasLeves = entry.leves.length > 0;
    const hasQuests = entry.quests.length > 0;

    if (hasLeves) {
      summary[entry.job].leveRecipes += 1;
    }

    if (hasQuests) {
      summary[entry.job].questRecipes += 1;
    }

    if (hasLeves && hasQuests) {
      summary[entry.job].leveAndQuestRecipes += 1;
    }
  }

  return summary;
}

async function main() {
  console.log("Reading local recipe files...");
  const recipes = await loadLocalRecipes();

  console.log("Fetching Teamcraft items...");
  const items = await fetchJson(TEAMCRAFT_FILES.items);

  console.log("Fetching Teamcraft leve and quest data...");
  const [levesPerItem, leves, usedInQuests, quests] = await Promise.all([
    fetchJson(TEAMCRAFT_FILES.levesPerItem),
    fetchJson(TEAMCRAFT_FILES.leves),
    fetchJson(TEAMCRAFT_FILES.usedInQuests),
    fetchJson(TEAMCRAFT_FILES.quests),
  ]);

  const itemIndexes = buildItemIndexes(items);

  const {
    matches: recipeItemMatches,
    unmatchedRecipes,
    ambiguousRecipes,
  } = buildRecipeItemMatches(recipes, itemIndexes);

  const { output, recipesWithLeves, recipesWithQuests } = buildRecipeObjectives({
    recipes,
    recipeItemMatches,
    levesPerItem,
    leves,
    usedInQuests,
    quests,
  });

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      outputFile: "src/data/recipeObjectives.json",
      reportFile: "src/data/debug/debug-recipe-objectives-report.json",
      recipeCount: Object.keys(recipes).length,
      matchedRecipeItemCount: Object.keys(recipeItemMatches).length,
      unmatchedRecipeCount: Object.keys(unmatchedRecipes).length,
      ambiguousRecipeCount: Object.keys(ambiguousRecipes).length,
      objectiveRecipeCount: Object.keys(output).length,
      leveRecipeCount: Object.keys(recipesWithLeves).length,
      questRecipeCount: Object.keys(recipesWithQuests).length,
      note:
        "Maps local recipe outputs to Teamcraft item IDs, then attaches leve and quest usage data by output item.",
    },
    summaryByJob: summarizeByJob(output),
    sampleLeveRecipes: Object.fromEntries(
      Object.entries(recipesWithLeves).slice(0, 25)
    ),
    sampleQuestRecipes: Object.fromEntries(
      Object.entries(recipesWithQuests).slice(0, 25)
    ),
    unmatchedRecipes: Object.fromEntries(
      Object.entries(unmatchedRecipes).slice(0, 100)
    ),
    ambiguousRecipes: Object.fromEntries(
      Object.entries(ambiguousRecipes).slice(0, 100)
    ),
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${REPORT_PATH}`);
  console.log("");
  console.log("Objective recipe count:", report.metadata.objectiveRecipeCount);
  console.log("Leve recipe count:", report.metadata.leveRecipeCount);
  console.log("Quest recipe count:", report.metadata.questRecipeCount);
  console.log("");
  console.log("Summary by job:");
  console.log(report.summaryByJob);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});