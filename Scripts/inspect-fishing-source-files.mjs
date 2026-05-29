import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const CATEGORY_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootAndSpecial.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve("src/data/debug-fishing-source-files.json");

const FISH_CATEGORY_KEY = "fish_or_ocean_items";

const CANDIDATE_FISHING_FILES = [
  "fishing-spots.json",
  "fishing-spot-details.json",
  "fishing-baits.json",
  "fishes.json",
  "fish.json",
  "spearfishing-notes.json",
  "spearfishing-items.json",
  "spearfishing.json",
  "gathering-items.json",
  "gathering-sources.json",
  "gathering.json",
  "items.json",
  "places.json",
  "maps.json",
];

const MAX_MATCHES_PER_ITEM_PER_FILE = 25;
const MAX_MATCHED_ENTRY_DEPTH = 5;
const MAX_ARRAY_SAMPLE_LENGTH = 20;
const MAX_OBJECT_SAMPLE_KEYS = 60;

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
            ? Object.keys(entry).slice(0, 40)
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
      sampleTopLevelKeys: Object.keys(value).slice(0, 80),
      sampleEntries: entries.slice(0, 5).map(([key, entry]) => ({
        key,
        valueType: getValueType(entry),
        valueKeys:
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? Object.keys(entry).slice(0, 40)
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

function getFishingTargets(categoryReport) {
  const category = categoryReport.categories?.[FISH_CATEGORY_KEY];

  if (!category?.items) {
    return [];
  }

  return Object.entries(category.items)
    .map(([key, item]) => ({
      key,
      name: item.name,
      itemId: Number(item.itemId),
      status: item.status,
      categoryKey: FISH_CATEGORY_KEY,
    }))
    .filter((item) => Number.isFinite(item.itemId))
    .sort((left, right) => left.name.localeCompare(right.name));
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

function scanParsedDataForItem(data, target, fileName) {
  const matches = findNumberReferences(data, target.itemId);

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

function findLikelyFishPathMatches(matches) {
  const usefulPathPatterns = [
    "item",
    "itemId",
    "item_id",
    "fish",
    "fishes",
    "rewards",
    "gathering",
    "spearfishing",
    "spot",
  ];

  return matches.filter((match) => {
    const pathText = String(match.matchedPath).toLowerCase();

    return usefulPathPatterns.some((pattern) =>
      pathText.includes(pattern.toLowerCase())
    );
  });
}

async function inspectCandidateFishingFile(fileName, targets) {
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
      likelyMatchedTargetCount: 0,
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
      likelyMatchedTargetCount: 0,
      matchesByItem: {},
    };
  }

  const matchesByItem = {};

  for (const target of targets) {
    const matches = scanParsedDataForItem(parsed.value, target, fileName);

    if (matches.length === 0) {
      continue;
    }

    const likelyMatches = findLikelyFishPathMatches(matches);

    matchesByItem[target.key] = {
      key: target.key,
      name: target.name,
      itemId: target.itemId,
      status: target.status,
      categoryKey: target.categoryKey,
      matchCount: matches.length,
      likelyMatchCount: likelyMatches.length,
      likelyMatches,
      matches,
    };
  }

  const matchedItems = Object.values(matchesByItem);
  const likelyMatchedTargetCount = matchedItems.filter(
    (entry) => entry.likelyMatchCount > 0
  ).length;

  return {
    fileName,
    url: fetched.url,
    exists: true,
    status: fetched.status,
    statusText: fetched.statusText,
    parseType: "json",
    summary: summarizeParsedData(parsed.value),
    matchedTargetCount: Object.keys(matchesByItem).length,
    likelyMatchedTargetCount,
    matchesByItem,
  };
}

function summarizeResults(results) {
  return results.map((result) => ({
    fileName: result.fileName,
    exists: result.exists,
    parseType: result.parseType,
    matchedTargetCount: result.matchedTargetCount,
    likelyMatchedTargetCount: result.likelyMatchedTargetCount,
    summaryKind: result.summary?.kind ?? null,
    entryCount: result.summary?.entryCount ?? null,
    itemCount: result.summary?.itemCount ?? null,
  }));
}

function getTopMatchedFiles(results) {
  return summarizeResults(results)
    .filter((row) => row.exists && row.parseType === "json")
    .sort((left, right) => {
      if (right.likelyMatchedTargetCount !== left.likelyMatchedTargetCount) {
        return right.likelyMatchedTargetCount - left.likelyMatchedTargetCount;
      }

      return right.matchedTargetCount - left.matchedTargetCount;
    });
}

function getTargetCoverage(results, targets) {
  const coverage = {};

  for (const target of targets) {
    coverage[target.key] = {
      key: target.key,
      name: target.name,
      itemId: target.itemId,
      matchedFiles: [],
      likelyMatchedFiles: [],
    };
  }

  for (const result of results) {
    for (const [key, matchEntry] of Object.entries(result.matchesByItem ?? {})) {
      coverage[key].matchedFiles.push({
        fileName: result.fileName,
        matchCount: matchEntry.matchCount,
      });

      if (matchEntry.likelyMatchCount > 0) {
        coverage[key].likelyMatchedFiles.push({
          fileName: result.fileName,
          likelyMatchCount: matchEntry.likelyMatchCount,
        });
      }
    }
  }

  return coverage;
}

async function main() {
  console.log("Reading post-special unresolved category report...");
  const categoryReport = await readJson(CATEGORY_REPORT_INPUT_PATH);

  const targets = getFishingTargets(categoryReport);

  console.log(`Loaded ${targets.length} fishing target item(s).`);
  console.log("");
  console.log("Checking candidate Teamcraft fishing source files...");

  const results = [];

  for (const fileName of CANDIDATE_FISHING_FILES) {
    console.log(`Checking ${fileName}...`);

    const result = await inspectCandidateFishingFile(fileName, targets);
    results.push(result);

    if (!result.exists) {
      console.log(`  Missing: ${result.status} ${result.statusText}`);
      continue;
    }

    console.log(
      `  Found. Parsed as ${result.parseType}. Matched ${result.matchedTargetCount}; likely matched ${result.likelyMatchedTargetCount}.`
    );
  }

  const output = {
    metadata: {
      sourceFile:
        "materialSources.withDropsShopsLootAndSpecial.unresolved-categories.json",
      fishCategoryKey: FISH_CATEGORY_KEY,
      targetCount: targets.length,
      candidateFishingFiles: CANDIDATE_FISHING_FILES,
      note: "This debug file probes likely Teamcraft fishing files and scans unresolved fish item IDs against them. Use topMatchedFiles and likelyMatchedTargetCount to decide which file to integrate next.",
    },
    targetSamples: targets.slice(0, 100),
    summary: summarizeResults(results),
    topMatchedFiles: getTopMatchedFiles(results),
    targetCoverage: getTargetCoverage(results, targets),
    results,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("");
  console.log("Fishing source candidate summary:");

  for (const row of output.topMatchedFiles) {
    console.log(
      `  ${row.fileName}: exists=${row.exists}, parse=${row.parseType}, matched=${row.matchedTargetCount}, likely=${row.likelyMatchedTargetCount}`
    );
  }

  console.log("");
  console.log("Upload src/data/debug-fishing-source-files.json next.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});