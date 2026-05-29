import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_JSON_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const TEAMCRAFT_GITHUB_CONTENTS_URL =
  "https://api.github.com/repos/ffxiv-teamcraft/ffxiv-teamcraft/contents/libs/data/src/lib/json?ref=staging";

const CATEGORY_REPORT_INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishing.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve("src/data/debug-special-loot-source-files.json");

const TARGET_CATEGORY_KEYS = [
  "raid_trial_dungeon_or_special_loot",
  "crafted_intermediates",
];

const FILE_NAME_KEYWORDS = [
  "instance",
  "dungeon",
  "raid",
  "trial",
  "boss",
  "drop",
  "loot",
  "desynth",
  "desynthesis",
  "reduction",
  "reduced",
  "airship",
  "submarine",
  "voyage",
  "exploration",
  "venture",
  "ventures",
  "aquatic",
  "subaquatic",
  "notebook",
  "item",
];

const ALWAYS_CHECK_FILES = [
  "items.json",
  "loot-sources.json",
  "shops.json",
  "mobs.json",
  "monsters.json",
  "instances.json",
  "instance-content.json",
  "instance-chests.json",
  "desynth.json",
  "desynths.json",
  "desynthesis.json",
  "reduction.json",
  "reduction-items.json",
  "airship-voyages.json",
  "submarine-voyages.json",
  "ventures.json",
];

const MAX_FILES_TO_SCAN = 250;
const MAX_MATCHES_PER_ITEM_PER_FILE = 25;
const MAX_MATCHED_ENTRY_DEPTH = 5;
const MAX_ARRAY_SAMPLE_LENGTH = 20;
const MAX_OBJECT_SAMPLE_KEYS = 60;

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function fetchJsonIfExists(url) {
  const response = await fetch(url);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      statusText: response.statusText,
      value: null,
    };
  }

  try {
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      value: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      statusText: `JSON parse failed: ${error.message}`,
      value: null,
    };
  }
}

async function fetchTextIfExists(fileName) {
  const url = `${TEAMCRAFT_JSON_BASE}/${fileName}`;
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

function getTargets(categoryReport) {
  const targets = [];

  for (const categoryKey of TARGET_CATEGORY_KEYS) {
    const category = categoryReport.categories?.[categoryKey];

    if (!category?.items) {
      continue;
    }

    for (const [key, item] of Object.entries(category.items)) {
      const itemId = Number(item.itemId);

      if (!Number.isFinite(itemId)) {
        continue;
      }

      targets.push({
        key,
        name: item.name,
        itemId,
        status: item.status,
        categoryKey,
        categoryLabel: category.label,
      });
    }
  }

  return targets.sort((left, right) => {
    if (left.categoryKey !== right.categoryKey) {
      return left.categoryKey.localeCompare(right.categoryKey);
    }

    return left.name.localeCompare(right.name);
  });
}

async function discoverTeamcraftJsonFiles() {
  const response = await fetchJsonIfExists(TEAMCRAFT_GITHUB_CONTENTS_URL);

  if (!response.ok || !Array.isArray(response.value)) {
    return {
      discovered: false,
      error: `${response.status} ${response.statusText}`,
      fileNames: [...ALWAYS_CHECK_FILES],
    };
  }

  const fileNames = response.value
    .filter((entry) => entry.type === "file")
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".json"));

  return {
    discovered: true,
    error: null,
    fileNames,
  };
}

function shouldScanFile(fileName) {
  if (ALWAYS_CHECK_FILES.includes(fileName)) {
    return true;
  }

  const lowerName = fileName.toLowerCase();

  return FILE_NAME_KEYWORDS.some((keyword) => lowerName.includes(keyword));
}

function buildCandidateFileList(discoveredFileNames) {
  const candidates = new Set();

  for (const fileName of ALWAYS_CHECK_FILES) {
    candidates.add(fileName);
  }

  for (const fileName of discoveredFileNames) {
    if (shouldScanFile(fileName)) {
      candidates.add(fileName);
    }
  }

  return [...candidates].sort().slice(0, MAX_FILES_TO_SCAN);
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
  const firstPathPart = String(pathText).split(".")[0];

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

function findLikelySourceMatches(matches) {
  const usefulPathPatterns = [
    "item",
    "itemId",
    "item_id",
    "reward",
    "rewards",
    "loot",
    "drop",
    "drops",
    "desynth",
    "desynthesis",
    "reduction",
    "instance",
    "chest",
    "coffer",
    "content",
    "voyage",
    "venture",
    "airship",
    "submarine",
  ];

  return matches.filter((match) => {
    const pathText = String(match.matchedPath).toLowerCase();

    return usefulPathPatterns.some((pattern) =>
      pathText.includes(pattern.toLowerCase())
    );
  });
}

async function inspectCandidateFile(fileName, targets) {
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

    const likelyMatches = findLikelySourceMatches(matches);

    matchesByItem[target.key] = {
      key: target.key,
      name: target.name,
      itemId: target.itemId,
      status: target.status,
      categoryKey: target.categoryKey,
      categoryLabel: target.categoryLabel,
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
      categoryKey: target.categoryKey,
      categoryLabel: target.categoryLabel,
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

function countTargetsByCategory(targets) {
  const counts = {};

  for (const target of targets) {
    counts[target.categoryKey] = (counts[target.categoryKey] ?? 0) + 1;
  }

  return counts;
}

async function main() {
  console.log("Reading post-fishing unresolved category report...");
  const categoryReport = await readJson(CATEGORY_REPORT_INPUT_PATH);

  const targets = getTargets(categoryReport);

  console.log(`Loaded ${targets.length} target item(s).`);
  console.log("Target counts by category:");

  for (const [categoryKey, count] of Object.entries(countTargetsByCategory(targets))) {
    console.log(`  ${categoryKey}: ${count}`);
  }

  console.log("");
  console.log("Discovering Teamcraft JSON files...");
  const discovery = await discoverTeamcraftJsonFiles();

  if (!discovery.discovered) {
    console.log(`Could not discover file list. Falling back. ${discovery.error}`);
  } else {
    console.log(`Discovered ${discovery.fileNames.length} Teamcraft JSON files.`);
  }

  const candidateFiles = buildCandidateFileList(discovery.fileNames);

  console.log(`Scanning ${candidateFiles.length} candidate file(s)...`);
  console.log("");

  const results = [];

  for (const fileName of candidateFiles) {
    console.log(`Checking ${fileName}...`);

    const result = await inspectCandidateFile(fileName, targets);
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
        "materialSources.withDropsShopsLootSpecialAndFishing.unresolved-categories.json",
      targetCategoryKeys: TARGET_CATEGORY_KEYS,
      targetCount: targets.length,
      targetCountsByCategory: countTargetsByCategory(targets),
      discovery,
      candidateFileCount: candidateFiles.length,
      candidateFiles,
      note: "This debug file scans likely Teamcraft special loot, instance, desynth, reduction, and exploration files for unresolved raid/trial/dungeon/special loot and crafted-intermediate target item IDs.",
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
  console.log("Top source candidate summary:");

  for (const row of output.topMatchedFiles.slice(0, 30)) {
    console.log(
      `  ${row.fileName}: exists=${row.exists}, parse=${row.parseType}, matched=${row.matchedTargetCount}, likely=${row.likelyMatchedTargetCount}`
    );
  }

  console.log("");
  console.log("Upload src/data/debug-special-loot-source-files.json next.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});