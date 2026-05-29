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

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsAndShops.unresolved-report.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsAndShops.unresolved-categories.json"
);


const MAX_SHOP_SOURCES_PER_MATERIAL = 25;
const MAX_NPCS_PER_SHOP_SOURCE = 25;

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

function pickFirstNumber(...values) {
  for (const value of values) {
    const number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }
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
  };
}

function normalizePurchasedItem(item, itemIndex) {
  if (!item || typeof item !== "object") {
    return {
      id: null,
      name: null,
      amount: null,
    };
  }

  const id = pickFirstNumber(item.id, item.itemId, item.item_id);
  const amount = pickFirstNumber(item.amount, item.quantity, item.qty, item.count);
  const itemInfo = id !== null ? itemIndex.get(id) : null;

  return {
    id,
    name: itemInfo?.name ?? null,
    amount: amount ?? 1,
  };
}

function resolveShopNpcs(shop, npcIndex) {
  const npcIds = Array.isArray(shop.npcs) ? shop.npcs : [];

  return npcIds.slice(0, MAX_NPCS_PER_SHOP_SOURCE).map((npcId) => {
    const id = Number(npcId);
    const npc = npcIndex.get(id);

    return {
      id,
      name: npc?.name ?? null,
      location: npc?.location ?? null,
    };
  });
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

function getTradeRequiredRank(trade) {
  return pickFirstNumber(
    trade.requiredGCRank,
    trade.requiredGcRank,
    trade.required_gc_rank,
    trade.rank
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
          gatheringClass: "Vendor",
          gatheringType: shopType,
          level: null,
          region: null,
          zone: null,
          zoneId: null,
          area: null,
          map: null,
          mapId: null,
          coordinates: null,
          nodeType: "Shop Purchase",
          timed: false,
          spawnTimes: [],
          duration: null,
          hidden: false,
          folklore: null,

          shopType,
          shopId,
          shopArrayIndex,
          tradeIndex,
          npcs,
          currencies,
          priceText: formatPriceText(currencies),
          purchasedItem: {
            itemId: purchasedItem.id,
            name: purchasedItem.name,
            amount: purchasedItem.amount,
          },
          requiredGCRank,
          topicSelectId: shop.topicSelectId ?? null,
          debug: {
            npcCountBeforeLimit: Array.isArray(shop.npcs) ? shop.npcs.length : 0,
            truncatedNpcList:
              Array.isArray(shop.npcs) &&
              shop.npcs.length > MAX_NPCS_PER_SHOP_SOURCE,
          },
        });
      }
    }
  }

  return sourceIndex;
}

function formatPriceText(currencies) {
  if (!Array.isArray(currencies) || currencies.length === 0) {
    return null;
  }

  return currencies
    .map((currency) => {
      if (currency.amount === null && !currency.name) {
        return null;
      }

      if (currency.name) {
        return `${currency.amount ?? "?"} ${currency.name}`;
      }

      return `${currency.amount ?? "?"} currency ${currency.id ?? "?"}`;
    })
    .filter(Boolean)
    .join(" + ");
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

    const leftHasCoordinates = hasAnyNpcCoordinates(left) ? 0 : 1;
    const rightHasCoordinates = hasAnyNpcCoordinates(right) ? 0 : 1;

    if (leftHasCoordinates !== rightHasCoordinates) {
      return leftHasCoordinates - rightHasCoordinates;
    }

    const leftIsGil = left.shopType === "GilShop" ? 0 : 1;
    const rightIsGil = right.shopType === "GilShop" ? 0 : 1;

    if (leftIsGil !== rightIsGil) {
      return leftIsGil - rightIsGil;
    }

    return String(left.shopType).localeCompare(String(right.shopType));
  });
}

function hasAnyNpcCoordinates(source) {
  return source.npcs.some((npc) => {
    const coordinates = npc.location?.coordinates;

    return (
      coordinates &&
      (Number.isFinite(coordinates.x) ||
        Number.isFinite(coordinates.y) ||
        Number.isFinite(coordinates.z))
    );
  });
}

function getShopSourcesForMaterial(material, shopSourceIndex) {
  const itemId = Number(material.itemId);

  if (!Number.isFinite(itemId)) {
    return [];
  }

  const rawSources = shopSourceIndex.get(itemId) ?? [];
  const dedupedSources = dedupeShopSources(rawSources);
  const prioritizedSources = prioritizeShopSources(dedupedSources);

  return prioritizedSources.slice(0, MAX_SHOP_SOURCES_PER_MATERIAL);
}

function sourceSignature(source) {
  if (source.type === "shop") {
    return [
      "shop",
      source.shopType,
      source.shopId,
      source.tradeIndex,
      source.purchasedItem?.itemId,
      source.priceText,
    ].join("|");
  }

  if (source.type === "monsterDrop") {
    return ["monsterDrop", source.monsterId, source.monsterName].join("|");
  }

  if (source.type === "gathering") {
    return [
      "gathering",
      source.gatheringClass,
      source.mapId,
      source.zoneId,
      source.coordinates?.x,
      source.coordinates?.y,
    ].join("|");
  }

  return JSON.stringify(source);
}

function mergeSources(existingSources, shopSources) {
  const output = [];
  const seen = new Set();

  for (const source of [...existingSources, ...shopSources]) {
    const signature = sourceSignature(source);

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    output.push(source);
  }

  return output;
}

function hasSourceType(sources, type) {
  return sources.some((source) => source.type === type);
}

function getCombinedStatus(material) {
  const sources = Array.isArray(material.sources) ? material.sources : [];

  if (!material.itemId) {
    return "item_name_not_found_in_teamcraft_items";
  }

  const hasGathering = hasSourceType(sources, "gathering");
  const hasMonsterDrop = hasSourceType(sources, "monsterDrop");
  const hasShop = hasSourceType(sources, "shop");

  if (hasGathering && hasMonsterDrop && hasShop) {
    return "ok_gathering_monster_drop_and_shop_sources_found";
  }

  if (hasGathering && hasShop) {
    return "ok_gathering_and_shop_sources_found";
  }

  if (hasMonsterDrop && hasShop) {
    return "ok_monster_drop_and_shop_sources_found";
  }

  if (hasGathering && hasMonsterDrop) {
    return "ok_gathering_and_monster_drop_sources_found";
  }

  if (hasGathering) {
    return "ok_gathering_source_found";
  }

  if (hasMonsterDrop) {
    return "ok_monster_drop_source_found";
  }

  if (hasShop) {
    return "ok_shop_source_found";
  }

  if (material.status === "only_unusable_or_placeholder_gathering_sources_found") {
    return "only_unusable_or_placeholder_gathering_sources_found";
  }

  return "no_source_found";
}

function addShopSourcesToMaterialSources(materialSources, shopSourceIndex) {
  const output = {};
  const shopAdditions = {};

  for (const [materialKey, material] of Object.entries(materialSources)) {
    const existingSources = Array.isArray(material.sources)
      ? material.sources
      : [];

    const shopSources = getShopSourcesForMaterial(material, shopSourceIndex);
    const mergedSources = mergeSources(existingSources, shopSources);

    output[materialKey] = {
      ...material,
      sources: mergedSources,
      status: getCombinedStatus({
        ...material,
        sources: mergedSources,
      }),
      debug: {
        ...(material.debug ?? {}),
        shopSourceCount: shopSources.length,
        addedShopSourceCount: Math.max(0, mergedSources.length - existingSources.length),
        shopSourcesTruncated:
          (shopSourceIndex.get(Number(material.itemId)) ?? []).length >
          MAX_SHOP_SOURCES_PER_MATERIAL,
      },
    };

    if (shopSources.length > 0) {
      shopAdditions[materialKey] = {
        name: material.name,
        itemId: material.itemId,
        previousStatus: material.status,
        newStatus: output[materialKey].status,
        addedShopSourceCount: output[materialKey].debug.addedShopSourceCount,
        shopSourceCount: shopSources.length,
        sampleShopSources: shopSources.slice(0, 3),
      };
    }
  }

  return {
    materialSources: output,
    shopAdditions,
  };
}

function countStatuses(materialSources) {
  return Object.values(materialSources).reduce((counts, entry) => {
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
    return counts;
  }, {});
}

function buildUnresolvedReport(materialSources, previousStatusCounts, shopAdditions) {
  const unresolvedStatuses = new Set([
    "item_name_not_found_in_teamcraft_items",
    "only_unusable_or_placeholder_gathering_sources_found",
    "no_source_found",
  ]);

  const unresolved = Object.fromEntries(
    Object.entries(materialSources).filter(([, entry]) =>
      unresolvedStatuses.has(entry.status)
    )
  );

  const statusCounts = countStatuses(materialSources);

  return {
    metadata: {
      sourceFile: "materialSources.withDrops.poc.json",
      outputFile: "materialSources.withDropsAndShops.poc.json",
      totalMaterials: Object.keys(materialSources).length,
      unresolvedCount: Object.keys(unresolved).length,
      shopAdditionCount: Object.keys(shopAdditions).length,
      maxShopSourcesPerMaterial: MAX_SHOP_SOURCES_PER_MATERIAL,
      note: "This report shows unresolved materials after adding shop sources from Teamcraft shops.json.",
    },
    previousStatusCounts,
    statusCounts,
    unresolved,
    shopAdditions,
  };
}

async function main() {
  console.log("Reading existing gathering + monster-drop material source POC...");
  const existingMaterialSources = await readJson(INPUT_PATH);
  const previousStatusCounts = countStatuses(existingMaterialSources);

  console.log(
    `Loaded ${Object.keys(existingMaterialSources).length} material source entries.`
  );

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

  const { materialSources, shopAdditions } = addShopSourcesToMaterialSources(
    existingMaterialSources,
    shopSourceIndex
  );

  const unresolvedReport = buildUnresolvedReport(
    materialSources,
    previousStatusCounts,
    shopAdditions
  );

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(materialSources, null, 2), "utf8");

  await fs.writeFile(
    UNRESOLVED_REPORT_PATH,
    JSON.stringify(unresolvedReport, null, 2),
    "utf8"
  );

  console.log("");
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${UNRESOLVED_REPORT_PATH}`);
  console.log("");
  console.log("Previous status summary:");

  for (const [status, count] of Object.entries(previousStatusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log("");
  console.log("New status summary:");

  for (const [status, count] of Object.entries(unresolvedReport.statusCounts)) {
    console.log(`  ${status}: ${count}`);
  }

  console.log("");
  console.log(`Shop additions: ${Object.keys(shopAdditions).length}`);
  console.log(`Remaining unresolved: ${Object.keys(unresolvedReport.unresolved).length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});