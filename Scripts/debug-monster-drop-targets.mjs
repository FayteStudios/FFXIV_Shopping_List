import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
  dropSources: `${TEAMCRAFT_BASE}/drop-sources.json`,
  lootSources: `${TEAMCRAFT_BASE}/loot-sources.json`,
  mobs: `${TEAMCRAFT_BASE}/mobs.json`,
  monsters: `${TEAMCRAFT_BASE}/monsters.json`,
  gubalBnpcsIndex: `${TEAMCRAFT_BASE}/gubal-bnpcs-index.json`,
};

const SAMPLE_MATERIALS = [
  "Animal Skin",
  "Aldgoat Skin",
  "Aldgoat Horn",
  "Diremite Web",
  "Hippogryph Sinew",
  "Raptor Skin",
  "Toad Skin",
  "Fleece",
  "Snurble Tufts",
  "Bomb Ash",
  "Beastkin Blood",
];

const USE_SAMPLE_MATERIALS = true;

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, data]) => {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return { id, ...data };
      }

      return { id, value: data };
    });
  }

  return [];
}

function getLocalizedName(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value.en === "string") {
    return value.en;
  }

  if (typeof value.en === "object") {
    return getLocalizedName(value.en);
  }

  if (typeof value.name === "string") {
    return value.name;
  }

  if (value.name) {
    return getLocalizedName(value.name);
  }

  if (typeof value.Name === "string") {
    return value.Name;
  }

  if (value.Name) {
    return getLocalizedName(value.Name);
  }

  return null;
}

async function fetchJson(label, url) {
  const response = await fetch(url);

  if (!response.ok) {
    console.log(`Could not fetch ${label}: ${response.status} ${response.statusText}`);
    return null;
  }

  return response.json();
}

async function readRecipes() {
  const recipeDirectory = path.resolve("src/data/recipes");
  const files = await fs.readdir(recipeDirectory);
  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  if (jsonFiles.length === 0) {
    throw new Error("No recipe JSON files found in src/data/recipes.");
  }

  const mergedRecipes = {};

  for (const file of jsonFiles) {
    const filePath = path.join(recipeDirectory, file);
    const text = await fs.readFile(filePath, "utf8");
    const recipesForClass = JSON.parse(text);

    Object.assign(mergedRecipes, recipesForClass);
  }

  return mergedRecipes;
}

function getRawMaterialsFromRecipes(recipes) {
  const names = new Set();

  for (const recipe of Object.values(recipes)) {
    for (const ingredient of recipe.ingredients ?? []) {
      if (ingredient.type === "material") {
        names.add(ingredient.name);
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function buildItemNameIndex(itemsData) {
  const index = new Map();

  for (const item of asArray(itemsData)) {
    const id = Number(item.id ?? item.row_id ?? item.rowId ?? item.ID);
    const name = getLocalizedName(item);

    if (Number.isFinite(id) && name) {
      index.set(name.toLowerCase(), { id, name, raw: item });
    }
  }

  return index;
}

function buildIdNameIndex(data, possibleNameFields = []) {
  const index = new Map();

  for (const entry of asArray(data)) {
    const id = Number(
      entry.id ??
        entry.row_id ??
        entry.rowId ??
        entry.ID ??
        entry.bnpcBase ??
        entry.bnpcName ??
        entry.monsterId ??
        entry.mobId
    );

    const possibleNames = [
      ...possibleNameFields.map((field) => entry[field]),
      entry.name,
      entry.Name,
      entry.en,
    ];

    const name = possibleNames.map(getLocalizedName).find(Boolean) ?? null;

    if (Number.isFinite(id)) {
      index.set(id, {
        id,
        name,
        raw: entry,
      });
    }
  }

  return index;
}

function findNumberReferences(value, targetNumber, pathParts = []) {
  const matches = [];

  if (typeof value === "number") {
    if (value === targetNumber) {
      matches.push({
        path: pathParts.join("."),
        value,
      });
    }

    return matches;
  }

  if (typeof value === "string") {
    if (Number(value) === targetNumber) {
      matches.push({
        path: pathParts.join("."),
        value,
      });
    }

    return matches;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      matches.push(
        ...findNumberReferences(entry, targetNumber, [...pathParts, String(index)])
      );
    });

    return matches;
  }

  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (Number(key) === targetNumber) {
        matches.push({
          path: [...pathParts, key].join("."),
          value: key,
          matchedObjectKey: true,
        });
      }

      matches.push(...findNumberReferences(entry, targetNumber, [...pathParts, key]));
    }
  }

  return matches;
}

function compactValue(value, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return "[Max depth reached]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) =>
      compactValue(entry, maxDepth, currentDepth + 1)
    );
  }

  if (value && typeof value === "object") {
    const compacted = {};
    const entries = Object.entries(value).slice(0, 30);

    for (const [key, entry] of entries) {
      compacted[key] = compactValue(entry, maxDepth, currentDepth + 1);
    }

    return compacted;
  }

  return value;
}

function getTopLevelEntryForPath(data, pathText) {
  const firstPathPart = pathText.split(".")[0];

  if (Array.isArray(data)) {
    const index = Number(firstPathPart);

    if (Number.isInteger(index)) {
      return data[index];
    }

    return null;
  }

  if (data && typeof data === "object") {
    return data[firstPathPart] ?? null;
  }

  return null;
}

function scanDataForItemId(data, itemId, label) {
  if (!data) {
    return [];
  }

  const matches = findNumberReferences(data, itemId);

  return matches.slice(0, 25).map((match) => {
    const topLevelEntry = getTopLevelEntryForPath(data, match.path);

    return {
      sourceFile: label,
      matchedPath: match.path,
      matchedValue: match.value,
      matchedObjectKey: Boolean(match.matchedObjectKey),
      topLevelEntrySample: compactValue(topLevelEntry),
    };
  });
}

function summarizeMaterialDropMatches({
  materialName,
  item,
  dropSourcesData,
  lootSourcesData,
}) {
  if (!item) {
    return {
      materialName,
      itemId: null,
      status: "item_name_not_found_in_teamcraft_items",
      matches: [],
    };
  }

  const matches = [
    ...scanDataForItemId(dropSourcesData, item.id, "drop-sources.json"),
    ...scanDataForItemId(lootSourcesData, item.id, "loot-sources.json"),
  ];

  return {
    materialName,
    itemId: item.id,
    status: matches.length > 0 ? "possible_drop_source_found" : "no_drop_source_found",
    matchCount: matches.length,
    matches,
  };
}

async function main() {
  console.log("Reading local recipe JSON files...");
  const recipes = await readRecipes();
  const rawMaterials = getRawMaterialsFromRecipes(recipes);

  const targetMaterials = USE_SAMPLE_MATERIALS
    ? SAMPLE_MATERIALS.filter((name) => rawMaterials.includes(name))
    : rawMaterials;

  console.log(`Found ${rawMaterials.length} unique raw materials in recipes.`);
  console.log(`Checking ${targetMaterials.length} target materials for drop references.`);
  console.log("");

  console.log("Fetching Teamcraft data files...");
  const [
    itemsData,
    dropSourcesData,
    lootSourcesData,
    mobsData,
    monstersData,
    gubalBnpcsIndexData,
  ] = await Promise.all([
    fetchJson("items.json", DATA_URLS.items),
    fetchJson("drop-sources.json", DATA_URLS.dropSources),
    fetchJson("loot-sources.json", DATA_URLS.lootSources),
    fetchJson("mobs.json", DATA_URLS.mobs),
    fetchJson("monsters.json", DATA_URLS.monsters),
    fetchJson("gubal-bnpcs-index.json", DATA_URLS.gubalBnpcsIndex),
  ]);

  const itemNameIndex = buildItemNameIndex(itemsData);
  const mobsIndex = buildIdNameIndex(mobsData, ["name", "Name", "bnpcName"]);
  const monstersIndex = buildIdNameIndex(monstersData, ["name", "Name"]);
  const gubalBnpcsIndex = buildIdNameIndex(gubalBnpcsIndexData, [
    "name",
    "Name",
    "bnpcName",
  ]);

  const results = {};

  for (const materialName of targetMaterials) {
    const item = itemNameIndex.get(materialName.toLowerCase());

    results[materialName] = summarizeMaterialDropMatches({
      materialName,
      item,
      dropSourcesData,
      lootSourcesData,
    });
  }

  const output = {
    metadata: {
      totalRawMaterialsInRecipes: rawMaterials.length,
      checkedMaterials: targetMaterials.length,
      useSampleMaterials: USE_SAMPLE_MATERIALS,
      note: "This is a debug scan. It finds item ID references in suspected drop files, but does not yet decide final monster/location schema.",
    },
    lookupSizes: {
      items: itemNameIndex.size,
      mobs: mobsIndex.size,
      monsters: monstersIndex.size,
      gubalBnpcsIndex: gubalBnpcsIndex.size,
    },
    lookupSamples: {
      mobs: [...mobsIndex.values()].slice(0, 10),
      monsters: [...monstersIndex.values()].slice(0, 10),
      gubalBnpcsIndex: [...gubalBnpcsIndex.values()].slice(0, 10),
    },
    results,
  };

  const outputDirectory = path.resolve("src/data");
  const outputPath = path.join(outputDirectory, "debug-monster-drop-targets.json");

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  const foundCount = Object.values(results).filter(
    (entry) => entry.status === "possible_drop_source_found"
  ).length;

  const missingCount = Object.values(results).filter(
    (entry) => entry.status === "no_drop_source_found"
  ).length;

  const notFoundCount = Object.values(results).filter(
    (entry) => entry.status === "item_name_not_found_in_teamcraft_items"
  ).length;

  console.log("");
  console.log(`Wrote ${outputPath}`);
  console.log("");
  console.log("Monster/drop debug summary:");
  console.log(`  Possible drop source found: ${foundCount}`);
  console.log(`  No drop source found: ${missingCount}`);
  console.log(`  Item name not found in Teamcraft items: ${notFoundCount}`);
  console.log("");
  console.log("Open src/data/debug-monster-drop-targets.json next.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});