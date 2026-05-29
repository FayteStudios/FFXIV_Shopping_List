import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const CANDIDATE_FILES = [
  "drop-sources.json",
  "loot-sources.json",
  "mobs.json",
  "monsters.json",
  "monster-search.index",
  "gubal-bnpcs-index.json",
];

async function fetchText(label, url) {
  const response = await fetch(url);

  if (!response.ok) {
    return {
      label,
      url,
      ok: false,
      status: response.status,
      statusText: response.statusText,
      error: `Could not fetch ${label}: ${response.status} ${response.statusText}`,
    };
  }

  const text = await response.text();

  return {
    label,
    url,
    ok: true,
    status: response.status,
    statusText: response.statusText,
    text,
  };
}

function tryParseJson(text) {
  try {
    return {
      ok: true,
      value: JSON.parse(text),
    };
  } catch (error) {
    return {
      ok: false,
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

function summarizeObject(value) {
  const entries = Object.entries(value);
  const sampleEntries = entries.slice(0, 5).map(([key, entryValue]) => ({
    key,
    valueType: getValueType(entryValue),
    valueKeys:
      entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)
        ? Object.keys(entryValue).slice(0, 25)
        : null,
    valueSample: entryValue,
  }));

  return {
    kind: "object",
    entryCount: entries.length,
    sampleTopLevelKeys: Object.keys(value).slice(0, 50),
    sampleEntries,
  };
}

function summarizeArray(value) {
  const sampleItems = value.slice(0, 5).map((entryValue, index) => ({
    index,
    valueType: getValueType(entryValue),
    valueKeys:
      entryValue && typeof entryValue === "object" && !Array.isArray(entryValue)
        ? Object.keys(entryValue).slice(0, 25)
        : null,
    valueSample: entryValue,
  }));

  return {
    kind: "array",
    itemCount: value.length,
    sampleItems,
  };
}

function summarizeParsedValue(value) {
  if (Array.isArray(value)) {
    return summarizeArray(value);
  }

  if (value && typeof value === "object") {
    return summarizeObject(value);
  }

  return {
    kind: getValueType(value),
    sample: value,
  };
}

function summarizeTextFile(text) {
  const lines = text.split(/\r?\n/);

  return {
    kind: "text",
    characterCount: text.length,
    lineCount: lines.length,
    sampleLines: lines.slice(0, 25),
  };
}

async function inspectCandidateFile(fileName) {
  const url = `${TEAMCRAFT_BASE}/${fileName}`;
  const fetched = await fetchText(fileName, url);

  if (!fetched.ok) {
    return fetched;
  }

  const parsed = tryParseJson(fetched.text);

  if (parsed.ok) {
    return {
      label: fileName,
      url,
      ok: true,
      parseType: "json",
      summary: summarizeParsedValue(parsed.value),
    };
  }

  return {
    label: fileName,
    url,
    ok: true,
    parseType: "text",
    parseError: parsed.error,
    summary: summarizeTextFile(fetched.text),
  };
}

async function main() {
  console.log("Inspecting possible Teamcraft monster/drop source files...");
  console.log("");

  const results = [];

  for (const fileName of CANDIDATE_FILES) {
    console.log(`Checking ${fileName}...`);
    const result = await inspectCandidateFile(fileName);
    results.push(result);

    if (!result.ok) {
      console.log(`  Missing or unavailable: ${result.status} ${result.statusText}`);
      continue;
    }

    console.log(`  Found. Parsed as: ${result.parseType}`);
    console.log(`  Shape: ${result.summary.kind}`);
  }

  const outputDirectory = path.resolve("src/data");
  const outputPath = path.join(
    outputDirectory,
    "debug-monster-source-file-shapes.json"
  );

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${outputPath}`);
  console.log("");
  console.log("Next: open debug-monster-source-file-shapes.json and look at:");
  console.log("- which files exist");
  console.log("- whether drop-sources.json or loot-sources.json has item IDs");
  console.log("- whether mobs.json or monsters.json has readable monster names");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});