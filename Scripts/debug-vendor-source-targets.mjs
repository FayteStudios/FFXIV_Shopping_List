import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const UNRESOLVED_CATEGORIES_PATH = path.resolve(
  "src/data/materialSources.withDrops.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve("src/data/debug-vendor-source-targets.json");

const CANDIDATE_VENDOR_FILES = [
  "shops.json",
  "shop-items.json",
  "npc-shops.json",
  "npcs.json",
  "vendors.json",
  "trade-sources.json",
  "trades.json",
  "special-shops.json",
  "gc-supply.json",
  "collectables.json",
  "ventures.json",
  "quests.json",
  "instances.json",
];

const TARGET_CATEGORY_KEYS = [
  "food_or_vendor_likely",
  "uncategorized",
  "crafted_intermediates",
];

const MANUAL_PRIORITY_TARGET_NAMES = [
  "Aldgoat Milk",
  "Buffalo Milk",
  "Chicken Egg",
  "Chicken Breast",
  "Blue Cheese",
  "Clear Prism",
  "Cooking Sherry",
  "Aluminum Ore",
  "Aji Amarillo",
  "Brown Cardamom",
  "Rroneek Milk",
  "Wild Coffee Beans",
  "Grade 6 Dark Matter",
];

const MAX_TARGETS_PER_CATEGORY = 200;
const MAX_MATCHES_PER_ITEM_PER_FILE = 20;
const MAX_MATCHED_ENTRY_DEPTH = 4;
const MAX_ARRAY_SAMPLE_LENGTH = 12;
const MAX_OBJECT_SAMPLE_KEYS = 40;

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function fetchTextIfExists(fileName) {
  const url = `${TEAMCRAFT_BASE}/${fileName}`;
  const response = await fetch(url);

  if (!response.ok) {
    return {
      fileName,
      url,
      ok: false,
      status: response.status,
      statusText: response.statusText,
      text: null,
    };
  }

  return {
    fileName,
    url,
    ok: true,
    status: response.status,
    statusText: response.statusText,
    text: await response.text(),
  };
}

function tryParseJson(text) {
  try {
    return {
      ok: true,
      value: JSON.parse(text),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      error: error.message,
    };
  }
}

function getValueType(value) {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function compactValue(value, maxDepth = MAX_MATCHED_ENTRY_DEPTH, currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return "[Max depth reached]";
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_SAMPLE_LENGTH)
      .map((entry) => compactValue(entry, maxDepth, currentDepth + 1));
  }

  if (value && typeof value === "object") {
    const compacted = {};
    const entries = Object.entries(value).slice(0, MAX_OBJECT_SAMPLE_KEYS);

    for (const [key, entry] of entries) {
      compacted[key] = compactValue(entry, maxDepth, currentDepth + 1);
    }

    return compacted;
  }

  return value;
}

function summarizeParsedData(value) {
  if (Array.isArray(value)) {
    return {
      kind: "array",
      itemCount: value.length,
      sampleItems: value.slice(0, 5).map((entry, index) => ({
        index,
        valueType: getValueType(entry),
        valueKeys:
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? Object.keys(entry).slice(0, 30)
            : null,
        valueSample: compactValue(entry, 2),
      })),
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);

    return {
      kind: "object",
      entryCount: entries.length,
      sampleTopLevelKeys: Object.keys(value).slice(0, 50),
      sampleEntries: entries.slice(0, 5).map(([key, entry]) => ({
        key,
        valueType: getValueType(entry),
        valueKeys:
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? Object.keys(entry).slice(0, 30)
            : null,
        valueSample: compactValue(entry, 2),
      })),
    };
  }

  return {
    kind: getValueType(value),
    sample: value,
  };
}

function getCategories(report) {
  return report.categories ?? {};
}

function getItemsFromCategory(report, categoryKey) {
  const category = getCategories(report)[categoryKey];

  if (!category?.items) {
    return [];
  }

  return Object.entries(category.items).map(([key, item]) => ({
    key,
    name: item.name,
    itemId: item.itemId,
    status: item.status,
    categoryKey,
  }));
}

function getManualPriorityTargets(report) {
  const allItems = [];

  for (const category of Object.values(getCategories(report))) {
    for (const [key, item] of Object.entries(category.items ?? {})) {
      allItems.push({
        key,
        name: item.name,
        itemId: item.itemId,
        status: item.status,
        categoryKey: null,
      });
    }
  }

  const byName = new Map(
    allItems.map((item) => [String(item.name).toLowerCase(), item])
  );

  return MANUAL_PRIORITY_TARGET_NAMES.map((name) =>
    byName.get(name.toLowerCase())
  ).filter(Boolean);
}

function dedupeTargets(targets) {
  const seen = new Set();
  const deduped = [];

  for (const target of targets) {
    const itemId = Number(target.itemId);

    if (!Number.isFinite(itemId)) {
      continue;
    }

    const key = `${target.name}|${itemId}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      ...target,
      itemId,
    });
  }

  return deduped;
}

function getTargetItems(report) {
  const categoryTargets = TARGET_CATEGORY_KEYS.flatMap((categoryKey) =>
    getItemsFromCategory(report, categoryKey).slice(0, MAX_TARGETS_PER_CATEGORY)
  );

  const manualTargets = getManualPriorityTargets(report);

  return dedupeTargets([...manualTargets, ...categoryTargets]);
}

function findNumberReferences(value, targetNumber, pathParts = []) {
  const matches = [];

  if (typeof value === "number") {
    if (value === targetNumber) {
      matches.push({
        path: pathParts.join("."),
        value,
        matchedObjectKey: false,
      });
    }

    return matches;
  }

  if (typeof value === "string") {
    if (Number(value) === targetNumber) {
      matches.push({
        path: pathParts.join("."),
        value,
        matchedObjectKey: false,
      });
    }

    return matches;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      matches.push(
        ...findNumberReferences(entry, targetNumber, [
          ...pathParts,
          String(index),
        ])
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

      matches.push(
        ...findNumberReferences(entry, targetNumber, [...pathParts, key])
      );
    }
  }

  return matches;
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

function scanParsedDataForItem(data, itemId, fileName) {
  const matches = findNumberReferences(data, itemId);

  return matches.slice(0, MAX_MATCHES_PER_ITEM_PER_FILE).map((match) => {
    const topLevelEntry = getTopLevelEntryForPath(data, match.path);

    return {
      sourceFile: fileName,
      matchedPath: match.path,
      matchedValue: match.value,
      matchedObjectKey: Boolean(match.matchedObjectKey),
      topLevelEntrySample: compactValue(topLevelEntry),
    };
  });
}

async function inspectCandidateVendorFile(fileName, targets) {
  const fetched = await fetchTextIfExists(fileName);

  if (!fetched.ok) {
    return {
      fileName,
      url: fetched.url,
      exists: false,
      status: fetched.status,
      statusText: fetched.statusText,
      parseType: null,
      summary: null,
      matchedTargetCount: 0,
      matchesByItem: {},
    };
  }

  const parsed = tryParseJson(fetched.text);

  if (!parsed.ok) {
    return {
      fileName,
      url: fetched.url,
      exists: true,
      status: fetched.status,
      statusText: fetched.statusText,
      parseType: "text",
      parseError: parsed.error,
      summary: {
        kind: "text",
        characterCount: fetched.text.length,
        sampleText: fetched.text.slice(0, 1000),
      },
      matchedTargetCount: 0,
      matchesByItem: {},
    };
  }

  const matchesByItem = {};

  for (const target of targets) {
    const matches = scanParsedDataForItem(parsed.value, target.itemId, fileName);

    if (matches.length > 0) {
      matchesByItem[target.key] = {
        key: target.key,
        name: target.name,
        itemId: target.itemId,
        status: target.status,
        categoryKey: target.categoryKey,
        matchCount: matches.length,
        matches,
      };
    }
  }

  return {
    fileName,
    url: fetched.url,
    exists: true,
    status: fetched.status,
    statusText: fetched.statusText,
    parseType: "json",
    summary: summarizeParsedData(parsed.value),
    matchedTargetCount: Object.keys(matchesByItem).length,
    matchesByItem,
  };
}

function summarizeResults(results) {
  return results.map((result) => ({
    fileName: result.fileName,
    exists: result.exists,
    parseType: result.parseType,
    matchedTargetCount: result.matchedTargetCount,
    summaryKind: result.summary?.kind ?? null,
    entryCount: result.summary?.entryCount ?? null,
    itemCount: result.summary?.itemCount ?? null,
  }));
}

async function main() {
  console.log("Reading unresolved categories report...");
  const report = await readJson(UNRESOLVED_CATEGORIES_PATH);
  const targets = getTargetItems(report);

  console.log(`Loaded ${targets.length} unresolved target items to scan.`);
  console.log("");
  console.log("Checking candidate Teamcraft vendor/shop files...");

  const results = [];

  for (const fileName of CANDIDATE_VENDOR_FILES) {
    console.log(`Checking ${fileName}...`);
    const result = await inspectCandidateVendorFile(fileName, targets);
    results.push(result);

    if (!result.exists) {
      console.log(`  Missing: ${result.status} ${result.statusText}`);
      continue;
    }

    console.log(
      `  Found. Parsed as ${result.parseType}. Matched ${result.matchedTargetCount} target item(s).`
    );
  }

  const output = {
    metadata: {
      sourceFile: "materialSources.withDrops.unresolved-categories.json",
      targetCategoryKeys: TARGET_CATEGORY_KEYS,
      manualPriorityTargetNames: MANUAL_PRIORITY_TARGET_NAMES,
      targetCount: targets.length,
      candidateVendorFiles: CANDIDATE_VENDOR_FILES,
      note: "This debug file probes likely Teamcraft shop/vendor/trade files and scans unresolved item IDs against them. Use matchedTargetCount to decide which source file to integrate next.",
    },
    targetSamples: targets.slice(0, 50),
    summary: summarizeResults(results),
    results,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("");
  console.log("Vendor/source candidate summary:");

  for (const row of output.summary) {
    console.log(
      `  ${row.fileName}: exists=${row.exists}, parse=${row.parseType}, matched=${row.matchedTargetCount}`
    );
  }

  console.log("");
  console.log("Upload src/data/debug-vendor-source-targets.json next.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});