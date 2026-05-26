// scripts/syncRecipeIcons.mjs
import fs from "fs";
import path from "path";

const RECIPE_DIR = path.resolve("src/data/recipes");
const ICON_MANIFEST_FILE = path.resolve("src/data/icons.json");
const ICON_OUTPUT_DIR = path.resolve("public/icons/items");
const REPORT_FILE = path.resolve("generated/icon-sync-report.json");

const XIVAPI_BASE = "https://v2.xivapi.com";

const SHOULD_WRITE = process.argv.includes("--write");
const FORCE_REFRESH = process.argv.includes("--force");
const REQUEST_DELAY_MS = 90;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function makeTimestamp() {
  return new Date().toISOString().replace(/:/g, "-").replace(/\..+$/, "");
}

function slugifyItemName(name) {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeXivapiQueryString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getRecipeFiles() {
  if (!fs.existsSync(RECIPE_DIR)) {
    throw new Error(`Recipe directory does not exist: ${RECIPE_DIR}`);
  }

  return fs
    .readdirSync(RECIPE_DIR)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => path.join(RECIPE_DIR, fileName));
}

function loadRecipesByFile() {
  const recipesByFile = new Map();

  for (const filePath of getRecipeFiles()) {
    recipesByFile.set(filePath, readJson(filePath));
  }

  return recipesByFile;
}

function collectUniqueItemNames(recipesByFile) {
  const names = new Set();

  for (const recipes of recipesByFile.values()) {
    for (const recipe of Object.values(recipes)) {
      if (recipe?.name) {
        names.add(recipe.name);
      }

      for (const ingredient of recipe?.ingredients ?? []) {
        if (ingredient?.name) {
          names.add(ingredient.name);
        }
      }
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function loadExistingManifest() {
  if (!fs.existsSync(ICON_MANIFEST_FILE)) {
    return {};
  }

  return readJson(ICON_MANIFEST_FILE);
}

function getFieldValue(field) {
  if (field == null) return null;

  if (typeof field === "string" || typeof field === "number") {
    return field;
  }

  if (typeof field === "object") {
    if ("value" in field) return field.value;
    if ("id" in field) return field.id;
  }

  return null;
}

function extractName(result) {
  return String(result?.fields?.Name ?? "").trim();
}

function extractIconPath(result) {
  const icon = result?.fields?.Icon;

  if (!icon) {
    return null;
  }

  if (typeof icon === "string") {
    return icon;
  }

  if (typeof icon === "object") {
    const directCandidates = [
      icon.path,
      icon.Path,
      icon.path_hr1,
      icon.path_hq,
      icon.uri,
      icon.url,
      icon.href,
      icon.tex,
    ].filter(Boolean);

    if (directCandidates.length > 0) {
      return String(directCandidates[0]);
    }

    const serialized = JSON.stringify(icon);

    const texMatch = serialized.match(/ui\/icon\/[^"]+?\.tex/i);
    if (texMatch) {
      return texMatch[0];
    }

    const pngMatch = serialized.match(/\/?i\/[0-9]+\/[0-9]+\.png/i);
    if (pngMatch) {
      return pngMatch[0];
    }
  }

  return null;
}

function buildAssetUrl(iconPath) {
  if (!iconPath) {
    return null;
  }

  if (iconPath.startsWith("http://") || iconPath.startsWith("https://")) {
    return iconPath;
  }

  // XIVAPI v1-style icon path fallback, such as /i/026000/026039.png.
  if (iconPath.startsWith("/i/") || iconPath.startsWith("i/")) {
    const normalized = iconPath.startsWith("/") ? iconPath : `/${iconPath}`;
    return `https://xivapi.com${normalized}`;
  }

  // XIVAPI v2 asset path, such as ui/icon/026000/026039.tex.
  return `${XIVAPI_BASE}/api/asset?path=${encodeURIComponent(
    iconPath
  )}&format=png`;
}

async function searchXivapiExactItem(name) {
  const query = `Name="${escapeXivapiQueryString(name)}"`;
  const params = new URLSearchParams({
    sheets: "Item",
    fields: "Name,Icon",
    query,
  });

  const url = `${XIVAPI_BASE}/api/search?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`XIVAPI search failed for "${name}": ${response.status}`);
  }

  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];

  const exactMatches = results.filter(
    (result) => extractName(result).toLowerCase() === name.toLowerCase()
  );

  if (exactMatches.length === 0) {
    return {
      status: "missing",
      name,
      results: results.slice(0, 5).map((result) => ({
        rowId: result.row_id,
        name: extractName(result),
      })),
    };
  }

  const matchesWithIcons = exactMatches
    .map((result) => ({
      result,
      iconPath: extractIconPath(result),
    }))
    .filter((entry) => entry.iconPath);

  if (matchesWithIcons.length === 0) {
    return {
      status: "missingIcon",
      name,
      matches: exactMatches.map((result) => ({
        rowId: result.row_id,
        name: extractName(result),
      })),
    };
  }

  if (matchesWithIcons.length > 1) {
    const uniqueIconPaths = new Set(matchesWithIcons.map((entry) => entry.iconPath));

    if (uniqueIconPaths.size > 1) {
      return {
        status: "ambiguous",
        name,
        matches: matchesWithIcons.map((entry) => ({
          rowId: entry.result.row_id,
          name: extractName(entry.result),
          iconPath: entry.iconPath,
        })),
      };
    }
  }

  const selected = matchesWithIcons[0];

  return {
    status: "resolved",
    name,
    rowId: selected.result.row_id,
    sourceName: extractName(selected.result),
    iconPath: selected.iconPath,
  };
}

async function downloadIcon(iconUrl, outputFile) {
  const response = await fetch(iconUrl);

  if (!response.ok) {
    throw new Error(`Icon download failed: ${response.status} ${iconUrl}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputFile, buffer);
}

function patchRecipesWithIcons(recipesByFile, manifest, report) {
  let patchedFiles = 0;
  let patchedRecipes = 0;

  for (const [filePath, recipes] of recipesByFile.entries()) {
    let changed = false;

    for (const recipe of Object.values(recipes)) {
      const iconId = slugifyItemName(recipe.name);
      const manifestEntry = manifest[iconId];

      if (!manifestEntry) {
        continue;
      }

      if (recipe.icon !== iconId) {
        recipe.icon = iconId;
        changed = true;
        patchedRecipes++;
      }
    }

    if (changed) {
      const backupFile = `${filePath}.backup-icons-${makeTimestamp()}`;
      fs.copyFileSync(filePath, backupFile);
      writeJson(filePath, recipes);

      report.recipeBackups.push({
        file: filePath,
        backup: backupFile,
      });

      patchedFiles++;
    }
  }

  report.patchedFiles = patchedFiles;
  report.patchedRecipes = patchedRecipes;
}

async function main() {
  const recipesByFile = loadRecipesByFile();
  const itemNames = collectUniqueItemNames(recipesByFile);
  const existingManifest = loadExistingManifest();
  const nextManifest = { ...existingManifest };

  const report = {
    writeMode: SHOULD_WRITE,
    forceRefresh: FORCE_REFRESH,
    recipeDir: RECIPE_DIR,
    iconManifestFile: ICON_MANIFEST_FILE,
    iconOutputDir: ICON_OUTPUT_DIR,
    totalUniqueItemNames: itemNames.length,
    alreadyResolved: [],
    resolved: [],
    downloaded: [],
    missing: [],
    missingIcon: [],
    ambiguous: [],
    errors: [],
    recipeBackups: [],
    patchedFiles: 0,
    patchedRecipes: 0,
  };

  console.log(`Found ${itemNames.length} unique recipe/material names.`);

  if (SHOULD_WRITE) {
    ensureDir(ICON_OUTPUT_DIR);
  }

  for (let index = 0; index < itemNames.length; index++) {
    const name = itemNames[index];
    const iconId = slugifyItemName(name);
    const fileName = `${iconId}.png`;
    const outputFile = path.join(ICON_OUTPUT_DIR, fileName);

    const existing = existingManifest[iconId];

    if (
      existing &&
      !FORCE_REFRESH &&
      (!SHOULD_WRITE || fs.existsSync(outputFile))
    ) {
      nextManifest[iconId] = existing;
      report.alreadyResolved.push({ iconId, name });
      continue;
    }

    console.log(`[${index + 1}/${itemNames.length}] Resolving ${name}`);

    try {
      const result = await searchXivapiExactItem(name);

      if (result.status !== "resolved") {
        report[result.status].push(result);
        await sleep(REQUEST_DELAY_MS);
        continue;
      }

      const iconUrl = buildAssetUrl(result.iconPath);

      const manifestEntry = {
        id: iconId,
        name,
        file: fileName,
        source: "xivapi-v2",
        sourceRowId: result.rowId,
        sourceName: result.sourceName,
        sourceIconPath: result.iconPath,
      };

      nextManifest[iconId] = manifestEntry;

      report.resolved.push({
        iconId,
        name,
        sourceRowId: result.rowId,
        sourceIconPath: result.iconPath,
      });

      if (SHOULD_WRITE) {
        await downloadIcon(iconUrl, outputFile);

        report.downloaded.push({
          iconId,
          name,
          file: outputFile,
        });
      }
    } catch (error) {
      report.errors.push({
        name,
        message: error.message,
      });
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (SHOULD_WRITE) {
    writeJson(ICON_MANIFEST_FILE, nextManifest);
    patchRecipesWithIcons(recipesByFile, nextManifest, report);
  }

  writeJson(REPORT_FILE, report);

  console.log("");
  console.log(`Resolved this run:       ${report.resolved.length}`);
  console.log(`Already resolved:        ${report.alreadyResolved.length}`);
  console.log(`Downloaded:              ${report.downloaded.length}`);
  console.log(`Missing:                 ${report.missing.length}`);
  console.log(`Missing icon:            ${report.missingIcon.length}`);
  console.log(`Ambiguous:               ${report.ambiguous.length}`);
  console.log(`Errors:                  ${report.errors.length}`);
  console.log(`Patched recipe files:    ${report.patchedFiles}`);
  console.log(`Patched recipe entries:  ${report.patchedRecipes}`);
  console.log(`Report written to:       ${REPORT_FILE}`);

  if (!SHOULD_WRITE) {
    console.log("");
    console.log("Dry run only. No icons or recipe JSON files were changed.");
    console.log("To download icons and patch recipe JSON files, run:");
    console.log("node scripts/syncRecipeIcons.mjs --write");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});