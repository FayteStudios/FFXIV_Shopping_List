import fs from "node:fs/promises";
import path from "node:path";

const TEAMCRAFT_BASE =
  "https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json";

const DATA_URLS = {
  shops: `${TEAMCRAFT_BASE}/shops.json`,
  npcs: `${TEAMCRAFT_BASE}/npcs.json`,
  items: `${TEAMCRAFT_BASE}/items.json`,
  maps: `${TEAMCRAFT_BASE}/maps.json`,
  places: `${TEAMCRAFT_BASE}/places.json`,
};

const UNRESOLVED_CATEGORIES_PATH = path.resolve(
  "src/data/materialSources.withDrops.unresolved-categories.json"
);

const OUTPUT_PATH = path.resolve("src/data/debug-resolved-shop-sources.json");

const MAX_SOURCES_PER_ITEM = 25;
const MAX_RAW_TRADE_DEPTH = 4;

const PRIORITY_TARGET_NAMES = [
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

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(([id, data]) => {
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return {
          id,
          ...data,
        };
      }

      return {
        id,
        value: data,
      };
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

function pickFirstNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function compactValue(value, maxDepth = MAX_RAW_TRADE_DEPTH, currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return "[Max depth reached]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) =>
      compactValue(entry, maxDepth, currentDepth + 1)
    );
  }

  if (value && typeof value === "object") {
    const compacted = {};

    for (const [key, entry] of Object.entries(value).slice(0, 50)) {
      compacted[key] = compactValue(entry, maxDepth, currentDepth + 1);
    }

    return compacted;
  }

  return value;
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

function getAllUnresolvedItems(report) {
  const items = [];

  for (const [categoryKey, category] of Object.entries(report.categories ?? {})) {
    for (const [key, item] of Object.entries(category.items ?? {})) {
      const itemId = Number(item.itemId);

      if (!Number.isFinite(itemId)) {
        continue;
      }

      items.push({
        key,
        name: item.name,
        itemId,
        status: item.status,
        categoryKey,
      });
    }
  }

  return items.sort((left, right) => {
    const leftPriority = PRIORITY_TARGET_NAMES.includes(left.name) ? 0 : 1;
    const rightPriority = PRIORITY_TARGET_NAMES.includes(right.name) ? 0 : 1;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.name.localeCompare(right.name);
  });
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

function getEnglishPlaceName(placeId, placesData) {
  const id = Number(placeId);

  if (!Number.isFinite(id) || id === 0) {
    return null;
  }

  const entry = placesData?.[String(id)] ?? placesData?.[id];

  if (!entry) {
    return null;
  }

  return getLocalizedName(entry);
}

function getMapInfo(mapId, mapsData, placesData) {
  const id = Number(mapId);

  if (!Number.isFinite(id) || id === 0) {
    return {
      mapName: null,
      regionName: null,
      subPlaceName: null,
    };
  }

  const mapEntry = mapsData?.[String(id)] ?? mapsData?.[id];

  if (!mapEntry) {
    return {
      mapName: null,
      regionName: null,
      subPlaceName: null,
    };
  }

  return {
    mapName: getEnglishPlaceName(mapEntry.placename_id, placesData),
    regionName: getEnglishPlaceName(mapEntry.region_id, placesData),
    subPlaceName: getEnglishPlaceName(mapEntry.placename_sub_id, placesData),
  };
}

function normalizeNpcLocation(npc, mapsData, placesData) {
  if (!npc || typeof npc !== "object") {
    return {
      region: null,
      zone: null,
      area: null,
      mapId: null,
      zoneId: null,
      coordinates: null,
    };
  }

  const mapId = pickFirstNumber(
    npc.map,
    npc.mapId,
    npc.map_id,
    npc.Map,
    npc.MapId
  );

  const zoneId = pickFirstNumber(
    npc.zoneid,
    npc.zoneId,
    npc.zone_id,
    npc.territoryType,
    npc.territoryTypeId,
    npc.territory,
    npc.TerritoryType
  );

  const x = pickFirstNumber(
    npc.x,
    npc.X,
    npc.mapX,
    npc.map_x,
    npc.coords?.x,
    npc.coordinates?.x,
    npc.position?.x
  );

  const y = pickFirstNumber(
    npc.y,
    npc.Y,
    npc.mapY,
    npc.map_y,
    npc.coords?.y,
    npc.coordinates?.y,
    npc.position?.y
  );

  const z = pickFirstNumber(
    npc.z,
    npc.Z,
    npc.coords?.z,
    npc.coordinates?.z,
    npc.position?.z
  );

  const mapInfo = getMapInfo(mapId, mapsData, placesData);

  return {
    region: mapInfo.regionName,
    zone: mapInfo.mapName,
    area: getEnglishPlaceName(zoneId, placesData) ?? mapInfo.subPlaceName,
    mapId,
    zoneId,
    coordinates:
      x !== null || y !== null || z !== null
        ? {
            x,
            y,
            z,
          }
        : null,
  };
}

function buildNpcIndex(npcsData, mapsData, placesData) {
  const index = new Map();

  for (const npc of asArray(npcsData)) {
    const id = Number(npc.id ?? npc.row_id ?? npc.rowId ?? npc.ID);
    const name = getLocalizedName(npc);

    if (!Number.isFinite(id)) {
      continue;
    }

    index.set(id, {
      id,
      name,
      location: normalizeNpcLocation(npc, mapsData, placesData),
      raw: npc,
    });
  }

  return index;
}

function normalizeCurrency(currency, itemIndex) {
  if (!currency || typeof currency !== "object") {
    return {
      id: null,
      name: null,
      amount: null,
      raw: currency ?? null,
    };
  }

  const id = pickFirstNumber(
    currency.id,
    currency.itemId,
    currency.item_id,
    currency.currencyId,
    currency.currency_id
  );

  const amount = pickFirstNumber(
    currency.amount,
    currency.quantity,
    currency.qty,
    currency.count,
    currency.price
  );

  const item = id !== null ? itemIndex.get(id) : null;

  return {
    id,
    name: item?.name ?? (id === 1 ? "Gil" : null),
    amount,
    raw: currency,
  };
}

function normalizePurchasedItem(item, itemIndex) {
  if (!item || typeof item !== "object") {
    return {
      id: null,
      name: null,
      amount: null,
      raw: item ?? null,
    };
  }

  const id = pickFirstNumber(item.id, item.itemId, item.item_id);
  const amount = pickFirstNumber(item.amount, item.quantity, item.qty, item.count);
  const itemInfo = id !== null ? itemIndex.get(id) : null;

  return {
    id,
    name: itemInfo?.name ?? null,
    amount: amount ?? 1,
    raw: item,
  };
}

function resolveShopNpcs(shop, npcIndex) {
  const npcIds = Array.isArray(shop.npcs) ? shop.npcs : [];

  return npcIds.map((npcId) => {
    const id = Number(npcId);
    const npc = npcIndex.get(id);

    return {
      id,
      name: npc?.name ?? null,
      location: npc?.location ?? null,
    };
  });
}

function getTradeRequiredRank(trade) {
  return pickFirstNumber(
    trade.requiredGCRank,
    trade.requiredGcRank,
    trade.required_gc_rank,
    trade.rank
  );
}

function getTradePurchasedItems(trade, itemIndex) {
  if (!Array.isArray(trade.items)) {
    return [];
  }

  return trade.items
    .map((item) => normalizePurchasedItem(item, itemIndex))
    .filter((item) => item.id !== null);
}

function getTradeCurrencies(trade, itemIndex) {
  if (!Array.isArray(trade.currencies)) {
    return [];
  }

  return trade.currencies.map((currency) =>
    normalizeCurrency(currency, itemIndex)
  );
}

function addShopSource(index, itemId, source) {
  if (!index.has(itemId)) {
    index.set(itemId, []);
  }

  index.get(itemId).push(source);
}

function buildShopSourceIndex(shopsData, npcIndex, itemIndex) {
  const sourceIndex = new Map();
  const shops = asArray(shopsData);

  for (const [shopArrayIndex, shop] of shops.entries()) {
    const shopId = pickFirstNumber(shop.id, shop.shopId, shop.shop_id);
    const shopType = shop.type ?? null;
    const npcs = resolveShopNpcs(shop, npcIndex);
    const trades = Array.isArray(shop.trades) ? shop.trades : [];

    for (const [tradeIndex, trade] of trades.entries()) {
      const purchasedItems = getTradePurchasedItems(trade, itemIndex);

      if (purchasedItems.length === 0) {
        continue;
      }

      const currencies = getTradeCurrencies(trade, itemIndex);
      const requiredGCRank = getTradeRequiredRank(trade);

      for (const purchasedItem of purchasedItems) {
        addShopSource(sourceIndex, purchasedItem.id, {
          type: "shop",
          shopType,
          shopId,
          shopArrayIndex,
          tradeIndex,
          npcs,
          currencies,
          purchasedItem: {
            itemId: purchasedItem.id,
            name: purchasedItem.name,
            amount: purchasedItem.amount,
          },
          requiredGCRank,
          topicSelectId: shop.topicSelectId ?? null,
          debug: {
            rawTrade: compactValue(trade),
          },
        });
      }
    }
  }

  return sourceIndex;
}

function dedupeShopSources(sources) {
  const seen = new Set();
  const deduped = [];

  for (const source of sources) {
    const npcKey = source.npcs.map((npc) => npc.id).join(",");
    const currencyKey = source.currencies
      .map((currency) => `${currency.id}:${currency.amount}`)
      .join(",");
    const key = [
      source.shopType,
      source.shopId,
      source.tradeIndex,
      npcKey,
      currencyKey,
      source.purchasedItem.itemId,
      source.purchasedItem.amount,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(source);
  }

  return deduped;
}

function prioritizeShopSources(sources) {
  return [...sources].sort((left, right) => {
    const leftHasNpc = left.npcs.length > 0 ? 0 : 1;
    const rightHasNpc = right.npcs.length > 0 ? 0 : 1;

    if (leftHasNpc !== rightHasNpc) {
      return leftHasNpc - rightHasNpc;
    }

    const leftIsGil = left.shopType === "GilShop" ? 0 : 1;
    const rightIsGil = right.shopType === "GilShop" ? 0 : 1;

    if (leftIsGil !== rightIsGil) {
      return leftIsGil - rightIsGil;
    }

    return String(left.shopType).localeCompare(String(right.shopType));
  });
}

function resolveItemShopSource(item, shopSourceIndex) {
  const rawSources = shopSourceIndex.get(item.itemId) ?? [];
  const dedupedSources = dedupeShopSources(rawSources);
  const prioritizedSources = prioritizeShopSources(dedupedSources);
  const limitedSources = prioritizedSources.slice(0, MAX_SOURCES_PER_ITEM);

  return {
    key: item.key,
    name: item.name,
    itemId: item.itemId,
    originalStatus: item.status,
    categoryKey: item.categoryKey,
    status:
      limitedSources.length > 0
        ? "ok_shop_source_found"
        : "no_shop_source_found",
    shopSourceCount: dedupedSources.length,
    sources: limitedSources,
    debug: {
      truncatedSourceList: dedupedSources.length > MAX_SOURCES_PER_ITEM,
    },
  };
}

function countStatuses(results) {
  return Object.values(results).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
}

function countByCategory(results) {
  const counts = {};

  for (const entry of Object.values(results)) {
    const categoryKey = entry.categoryKey ?? "unknown";

    if (!counts[categoryKey]) {
      counts[categoryKey] = {
        checked: 0,
        shopSourceFound: 0,
        noShopSourceFound: 0,
      };
    }

    counts[categoryKey].checked += 1;

    if (entry.status === "ok_shop_source_found") {
      counts[categoryKey].shopSourceFound += 1;
    } else {
      counts[categoryKey].noShopSourceFound += 1;
    }
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([, left], [, right]) => {
      return right.shopSourceFound - left.shopSourceFound;
    })
  );
}

function pickPriorityResults(results) {
  const output = {};

  for (const name of PRIORITY_TARGET_NAMES) {
    const match = Object.values(results).find((entry) => entry.name === name);

    if (match) {
      output[match.key] = match;
    }
  }

  return output;
}

async function main() {
  console.log("Reading unresolved category report...");
  const unresolvedReport = await readJson(UNRESOLVED_CATEGORIES_PATH);
  const unresolvedItems = getAllUnresolvedItems(unresolvedReport);

  console.log(`Loaded ${unresolvedItems.length} unresolved items with item IDs.`);
  console.log("");
  console.log("Fetching Teamcraft shop/NPC/item/map/place data...");

  const [shopsData, npcsData, itemsData, mapsData, placesData] =
    await Promise.all([
      fetchJson("shops.json", DATA_URLS.shops),
      fetchJson("npcs.json", DATA_URLS.npcs),
      fetchJson("items.json", DATA_URLS.items),
      fetchJson("maps.json", DATA_URLS.maps),
      fetchJson("places.json", DATA_URLS.places),
    ]);

  const itemIndex = buildItemIndex(itemsData);
  const npcIndex = buildNpcIndex(npcsData, mapsData, placesData);
  const shopSourceIndex = buildShopSourceIndex(shopsData, npcIndex, itemIndex);

  console.log(`Indexed ${shopSourceIndex.size} item IDs from shop trade items.`);
  console.log("");

  const results = {};

  for (const item of unresolvedItems) {
    results[item.key] = resolveItemShopSource(item, shopSourceIndex);
  }

  const statusCounts = countStatuses(results);
  const categoryCounts = countByCategory(results);

  const output = {
    metadata: {
      sourceFile: "materialSources.withDrops.unresolved-categories.json",
      unresolvedItemCountWithItemIds: unresolvedItems.length,
      indexedShopItemIdCount: shopSourceIndex.size,
      maxSourcesPerItem: MAX_SOURCES_PER_ITEM,
      note: "This resolver only treats shop.trades[].items[].id as a shop source match. It intentionally ignores accidental matches in currency amounts.",
    },
    statusCounts,
    categoryCounts,
    priorityResults: pickPriorityResults(results),
    results,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("");
  console.log("Resolved shop source summary:");

  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log("");
  console.log("By category:");

  for (const [categoryKey, counts] of Object.entries(categoryCounts)) {
    console.log(
      `  ${categoryKey}: found=${counts.shopSourceFound}, missing=${counts.noShopSourceFound}, checked=${counts.checked}`
    );
  }

  console.log("");
  console.log("Upload src/data/debug-resolved-shop-sources.json next.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});