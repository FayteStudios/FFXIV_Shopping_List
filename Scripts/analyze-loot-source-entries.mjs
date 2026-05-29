import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.unresolved-report.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishingCraftedInstancesBroadSpecialFinal.unresolved-categories.json"
);

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  items: `${TEAMCRAFT_BASE}/items.json`,
};

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
    return value.trim() || null;
  }

  if (typeof value.en === "string") {
    return value.en.trim() || null;
  }

  if (typeof value.en === "object") {
    return getLocalizedName(value.en);
  }

  if (typeof value.name === "string") {
    return value.name.trim() || null;
  }

  if (value.name) {
    return getLocalizedName(value.name);
  }

  if (typeof value.Name === "string") {
    return value.Name.trim() || null;
  }

  if (value.Name) {
    return getLocalizedName(value.Name);
  }

  if (typeof value.singular === "string") {
    return value.singular.trim() || null;
  }

  if (value.singular) {
    return getLocalizedName(value.singular);
  }

  return null;
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function fetchJson(label, url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not fetch ${label}: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

function buildItemIndex(itemsData) {
  const index = new Map();

  for (const item of asArray(itemsData)) {
    const id = Number(item.id ?? item.row_id ?? item.rowId ?? item.ID);
    const name = getLocalizedName(item);

    if (Number.isFinite(id)) {
      index.set(id, {
        id,
        name,
        raw: item,
      });
    }
  }

  return index;
}

function getAllUnresolvedItems(categoryReport) {
  const items = [];

  for (const [categoryKey, category] of Object.entries(
    categoryReport.categories ?? {}
  )) {
    for (const [materialKey, material] of Object.entries(category.items ?? {})) {
      items.push({
        categoryKey,
        materialKey,
        material,
      });
    }
  }

  return items;
}

function getLootSourceEntry(material) {
  const entry = material?.debug?.monsterDrop?.lootSourceEntry;

  if (!Array.isArray(entry)) {
    return [];
  }

  return entry
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function resolveLootSourceIds(lootSourceIds, itemIndex) {
  return lootSourceIds.map((id) => {
    const item = itemIndex.get(id);

    return {
      itemId: id,
      name: item?.name ?? null,
    };
  });
}

function analyzeLootSources(categoryReport, itemIndex) {
  const unresolvedItems = getAllUnresolvedItems(categoryReport);
  const materialsWithLootSources = {};
  const lootSourceIdUsage = {};

  for (const entry of unresolvedItems) {
    const lootSourceIds = getLootSourceEntry(entry.material);

    if (lootSourceIds.length === 0) {
      continue;
    }

    const resolvedLootSources = resolveLootSourceIds(lootSourceIds, itemIndex);

    materialsWithLootSources[entry.materialKey] = {
      categoryKey: entry.categoryKey,
      name: entry.material.name,
      itemId: entry.material.itemId ?? null,
      status: entry.material.status,
      lootSourceIds,
      resolvedLootSources,
    };

    for (const lootSource of resolvedLootSources) {
      const key = String(lootSource.itemId);

      if (!lootSourceIdUsage[key]) {
        lootSourceIdUsage[key] = {
          itemId: lootSource.itemId,
          name: lootSource.name,
          usedByCount: 0,
          usedByMaterials: [],
        };
      }

      lootSourceIdUsage[key].usedByCount += 1;

      if (lootSourceIdUsage[key].usedByMaterials.length < 25) {
        lootSourceIdUsage[key].usedByMaterials.push({
          key: entry.materialKey,
          name: entry.material.name,
          itemId: entry.material.itemId ?? null,
          categoryKey: entry.categoryKey,
        });
      }
    }
  }

  return {
    materialsWithLootSources,
    lootSourceIdUsage: Object.fromEntries(
      Object.entries(lootSourceIdUsage).sort(([, left], [, right]) => {
        return right.usedByCount - left.usedByCount;
      })
    ),
  };
}

function countByCategory(materialsWithLootSources) {
  const counts = {};

  for (const material of Object.values(materialsWithLootSources)) {
    const categoryKey = material.categoryKey ?? "unknown";

    counts[categoryKey] = (counts[categoryKey] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([, left], [, right]) => right - left)
  );
}

async function main() {
  console.log("Reading unresolved category report...");
  const categoryReport = await readJson(INPUT_PATH);

  console.log("Fetching Teamcraft items.json...");
  const itemsData = await fetchJson("items.json", DATA_URLS.items);
  const itemIndex = buildItemIndex(itemsData);

  const { materialsWithLootSources, lootSourceIdUsage } = analyzeLootSources(
    categoryReport,
    itemIndex
  );

  const output = {
    metadata: {
      sourceFile: "materialSources.withDropsAndShops.unresolved-categories.json",
      unresolvedCount: categoryReport.metadata?.unresolvedCount ?? null,
      materialsWithLootSourceEntryCount: Object.keys(materialsWithLootSources).length,
      uniqueLootSourceIdCount: Object.keys(lootSourceIdUsage).length,
      note: "This analyzes unresolved materials that already have debug.monsterDrop.lootSourceEntry values. Those IDs are resolved through Teamcraft items.json so we can decide how to represent loot/container/treasure/desynth-style sources.",
    },
    categoryCounts: countByCategory(materialsWithLootSources),
    topLootSourceIds: Object.values(lootSourceIdUsage).slice(0, 100),
    materialsWithLootSources,
    lootSourceIdUsage,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("");
  console.log("Loot source entry summary:");
  console.log(
    `  Materials with lootSourceEntry: ${output.metadata.materialsWithLootSourceEntryCount}`
  );
  console.log(`  Unique loot source IDs: ${output.metadata.uniqueLootSourceIdCount}`);
  console.log("");
  console.log("By category:");

  for (const [categoryKey, count] of Object.entries(output.categoryCounts)) {
    console.log(`  ${categoryKey}: ${count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});