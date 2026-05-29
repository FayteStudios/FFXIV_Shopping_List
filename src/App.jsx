import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  PackageSearch,
  ScrollText,
  ShoppingBasket,
} from "lucide-react";
import "./App.css";

import recipes from "./data/recipes/index.js";
import icons from "./data/icons.json";
import materialSources from "./data/materialSources.json";
import recipeObjectives from "./data/recipeObjectives.json";

import {
  calculateCraftingListRawMaterials,
  findBestRecipeForItem,
  isCraftable,
  normalizeIngredientType,
} from "./utils/recipeUtils";

import { loadCraftingList, saveCraftingList } from "./utils/storageUtils";

const RECIPES = recipes;
const ICON_BASE_PATH = `${import.meta.env.BASE_URL}icons/items/`;

const CRAFTING_JOBS = [
  "Carpenter",
  "Blacksmith",
  "Armorer",
  "Goldsmith",
  "Leatherworker",
  "Weaver",
  "Alchemist",
  "Culinarian",
];

const LEVEL_RANGES = [
  { label: "1-5", min: 1, max: 5 },
  { label: "6-10", min: 6, max: 10 },
  { label: "11-15", min: 11, max: 15 },
  { label: "16-20", min: 16, max: 20 },
  { label: "21-25", min: 21, max: 25 },
  { label: "26-30", min: 26, max: 30 },
  { label: "31-35", min: 31, max: 35 },
  { label: "36-40", min: 36, max: 40 },
  { label: "41-45", min: 41, max: 45 },
  { label: "46-50", min: 46, max: 50 },
  { label: "51-55", min: 51, max: 55 },
  { label: "56-60", min: 56, max: 60 },
  { label: "61-65", min: 61, max: 65 },
  { label: "66-70", min: 66, max: 70 },
  { label: "71-75", min: 71, max: 75 },
  { label: "76-80", min: 76, max: 80 },
  { label: "81-85", min: 81, max: 85 },
  { label: "86-90", min: 86, max: 90 },
  { label: "91-95", min: 91, max: 95 },
  { label: "96-100", min: 96, max: 100 },
];

const RECIPE_TYPE_FILTERS = [
  { label: "Standard", value: "standard" },
  { label: "★ Starred", value: "starred" },
  { label: "Furniture", value: "furniture" },
  { label: "Special", value: "special" },
  { label: "Leves", value: "leves" },
  { label: "Quests", value: "quests" },
];

const ELEMENT_ORDER = ["Fire", "Ice", "Wind", "Earth", "Lightning", "Water"];
const CATALYST_TYPE_ORDER = ["Shard", "Crystal", "Cluster"];

const SHOPPING_GROUP_ORDER = [
  "crystals",
  "vendor",
  "gathering",
  "monsterDrop",
  "fishing",
  "crafted",
  "loot",
  "instance",
  "special",
  "unknown",
];

const SHOPPING_GROUP_LABELS = {
  crystals: "Crystals / Shards / Clusters",
  vendor: "Vendor Purchases",
  gathering: "Gathering",
  monsterDrop: "Monster Drops",
  fishing: "Fishing",
  crafted: "Crafted / Intermediate",
  loot: "Loot",
  instance: "Dungeon / Trial / Raid",
  special: "Special / Manual Review",
  unknown: "Unknown Source",
};

const ROUTE_SOURCE_PRIORITY = [
  "shop",
  "gathering",
  "monsterDrop",
  "fishing",
  "loot",
  "instance",
  "crafted",
  "special",
];

function useDebouncedValue(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [value, delay]);

  return debouncedValue;
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

function normalizeLookupName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function createRecipeOutputIndex(recipes) {
  const index = new Map();

  for (const [recipeId, recipe] of Object.entries(recipes)) {
    const normalizedName = normalizeLookupName(recipe.name);

    if (!index.has(normalizedName)) {
      index.set(normalizedName, []);
    }

    index.get(normalizedName).push({
      recipeId,
      recipe,
    });
  }

  return index;
}

function recipeMatchesJob(recipe, selectedJob) {
  return recipe.job === selectedJob;
}

function recipeMatchesLevelRange(recipe, selectedLevelRange) {
  return (
    recipe.level >= selectedLevelRange.min &&
    recipe.level <= selectedLevelRange.max
  );
}

function recipeMatchesSearch(recipe, search) {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const searchableText = [
    recipe.name,
    recipe.job,
    String(recipe.level),
    ...(recipe.ingredients ?? []).map((ingredient) => ingredient.name),
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(query);
}

function getStarLabel(stars = 0) {
  if (!stars) {
    return "";
  }

  return " " + "★".repeat(stars);
}

function isFurnitureRecipe(recipe) {
  return recipe.category === "furniture" || recipe.recipeType === "furniture";
}

function isSpecialRecipe(recipe) {
  return (
    recipe.category === "special" ||
    recipe.recipeType === "special" ||
    recipe.isSpecial === true
  );
}

function isStarredRecipe(recipe) {
  return Number(recipe.stars || 0) > 0;
}

function getRecipeObjectiveEntry(recipeId) {
  return recipeObjectives[recipeId] || null;
}

function recipeHasLeves(recipeId) {
  const entry = getRecipeObjectiveEntry(recipeId);
  return Array.isArray(entry?.leves) && entry.leves.length > 0;
}

function recipeHasQuests(recipeId) {
  const entry = getRecipeObjectiveEntry(recipeId);
  return Array.isArray(entry?.quests) && entry.quests.length > 0;
}

function recipeMatchesTypeFilter(recipe, selectedRecipeType, recipeId) {
  if (selectedRecipeType === "leves") {
    return recipeHasLeves(recipeId);
  }

  if (selectedRecipeType === "quests") {
    return recipeHasQuests(recipeId);
  }

  if (selectedRecipeType === "special") {
    return isSpecialRecipe(recipe);
  }

  if (selectedRecipeType === "furniture") {
    return isFurnitureRecipe(recipe);
  }

  if (selectedRecipeType === "starred") {
    return (
      isStarredRecipe(recipe) &&
      !isSpecialRecipe(recipe) &&
      !isFurnitureRecipe(recipe)
    );
  }

  return !isSpecialRecipe(recipe) && !isFurnitureRecipe(recipe);
}

function getFilteredRecipeIds(
  recipes,
  selectedJob,
  selectedLevelRange,
  search,
  selectedRecipeType
) {
  const isGlobalSearchMode = search.trim().length > 0;

  return Object.keys(recipes)
    .filter((recipeId) => {
      const recipe = recipes[recipeId];

      if (!recipe) {
        return false;
      }

      if (isGlobalSearchMode) {
        return recipeMatchesSearch(recipe, search);
      }

      return (
        recipeMatchesJob(recipe, selectedJob) &&
        recipeMatchesLevelRange(recipe, selectedLevelRange) &&
        recipeMatchesTypeFilter(recipe, selectedRecipeType, recipeId)
      );
    })
    .sort((a, b) => {
      const recipeA = recipes[a];
      const recipeB = recipes[b];

      if (recipeA.job !== recipeB.job) {
        return recipeA.job.localeCompare(recipeB.job);
      }

      if (recipeA.level !== recipeB.level) {
        return recipeA.level - recipeB.level;
      }

      return recipeA.name.localeCompare(recipeB.name);
    });
}

function getCatalystSortInfo(materialName) {
  const parts = materialName.split(" ");

  if (parts.length !== 2) {
    return null;
  }

  const [element, catalystType] = parts;

  const elementIndex = ELEMENT_ORDER.indexOf(element);
  const catalystTypeIndex = CATALYST_TYPE_ORDER.indexOf(catalystType);

  if (elementIndex === -1 || catalystTypeIndex === -1) {
    return null;
  }

  return {
    elementIndex,
    catalystTypeIndex,
  };
}

function sortShoppingMaterials(entries) {
  return [...entries].sort(([materialA], [materialB]) => {
    const catalystA = getCatalystSortInfo(materialA);
    const catalystB = getCatalystSortInfo(materialB);

    if (catalystA && catalystB) {
      if (catalystA.catalystTypeIndex !== catalystB.catalystTypeIndex) {
        return catalystA.catalystTypeIndex - catalystB.catalystTypeIndex;
      }

      return catalystA.elementIndex - catalystB.elementIndex;
    }

    if (catalystA) {
      return -1;
    }

    if (catalystB) {
      return 1;
    }

    return materialA.localeCompare(materialB);
  });
}

function getIconEntryForName(name) {
  const normalizedName = normalizeLookupName(name);

  return (
    icons[normalizedName] ||
    icons[slugifyItemName(name)] ||
    icons[name] ||
    null
  );
}

function getIconEntryForRecipe(recipe) {
  return getIconEntryForName(recipe?.name);
}

function ItemIcon({ name = null, recipe = null, small = false }) {
  const iconEntry = recipe
    ? getIconEntryForRecipe(recipe)
    : getIconEntryForName(name);

  const className = small ? "item-icon small" : "item-icon";
  const fallbackClassName = small
    ? "item-icon-fallback small"
    : "item-icon-fallback";

  if (!iconEntry) {
    return (
      <span className={fallbackClassName} aria-hidden="true">
        ?
      </span>
    );
  }

  return (
    <img
      className={className}
      src={`${ICON_BASE_PATH}${iconEntry.file}`}
      alt=""
      loading="lazy"
    />
  );
}

function getMaterialSourceEntry(materialName) {
  const slug = slugifyItemName(materialName);
  const normalizedName = normalizeLookupName(materialName);

  return (
    materialSources[slug] ||
    materialSources[normalizedName] ||
    Object.values(materialSources).find(
      (entry) => normalizeLookupName(entry?.name) === normalizedName
    ) ||
    null
  );
}

function getNpcNames(source) {
  if (Array.isArray(source?.npcs) && source.npcs.length > 0) {
    return source.npcs
      .map((npc) => npc.name || npc.npcName)
      .filter(Boolean);
  }

  return [source?.npcName, source?.vendorName].filter(Boolean);
}

function getFirstMonsterPosition(source) {
  if (!Array.isArray(source?.positions) || source.positions.length === 0) {
    return null;
  }

  return (
    source.positions.find(
      (position) =>
        position?.zone ||
        position?.area ||
        position?.region ||
        position?.coordinates
    ) || source.positions[0]
  );
}

function getSourceAvailabilityText(source) {
  return (
    source?.availability ||
    source?.timing ||
    source?.spawnType ||
    source?.nodeType ||
    "Always available / check source"
  );
}

function getSourceLocation(source) {
  if (!source) {
    return "Source location not listed";
  }

  if (source.type === "monsterDrop") {
    const position = getFirstMonsterPosition(source);

    if (!position) {
      return "Monster location not listed";
    }

    const locationParts = [position.zone, position.area].filter(Boolean);

    if (locationParts.length > 0) {
      return locationParts.join(" — ");
    }

    if (position.mapId || position.zoneId) {
      return `Map ID ${position.mapId ?? "?"} · Zone ID ${
        position.zoneId ?? "?"
      }`;
    }

    return "Monster location not listed";
  }

  const locationParts = [source.region, source.zone, source.area].filter(
    Boolean
  );

  if (locationParts.length > 0) {
    return locationParts.join(" — ");
  }

  if (source.mapId || source.zoneId) {
    return `Map ID ${source.mapId ?? "?"} · Zone ID ${source.zoneId ?? "?"}`;
  }

  return "Source location not listed";
}

function getSourceTitle(source) {
  if (!source) {
    return "Unknown Source";
  }

  if (source.type === "shop") {
    return "Vendor";
  }

  if (source.type === "monsterDrop") {
    return "Monster Drop";
  }

  if (source.type === "fishing") {
    return "Fishing";
  }

  if (source.type === "crafted") {
    return "Crafted";
  }

  if (source.type === "instance") {
    return "Dungeon / Trial / Raid";
  }

  if (source.type === "loot") {
    return "Loot";
  }

  if (source.type === "special") {
    return source.sourceCategory || "Special";
  }

  return source.gatheringClass || source.type || "Source";
}

function getSourceDetailLines(source) {
  if (!source) {
    return ["No source details available."];
  }

  const lines = [];

  if (source.type === "monsterDrop") {
    if (source.monsterName) {
      lines.push(toTitleCase(source.monsterName));
    }

    const position = getFirstMonsterPosition(source);

    if (position?.level) {
      lines.push(`Monster level: ${position.level}`);
    }

    if (position?.coordinates) {
      const coordinateText = getRouteCoordinateText(position.coordinates);

      if (coordinateText) {
        lines.push(coordinateText);
      }
    }

    if (Array.isArray(source.positions) && source.positions.length > 1) {
      lines.push(`${source.positions.length} known spawn entries`);
    }

    lines.push("Monster drop");
    return lines;
  }

  if (source.type === "shop") {
    const npcNames = getNpcNames(source);

    if (npcNames.length > 0) {
      lines.push(`NPC: ${npcNames.slice(0, 3).join(", ")}`);
    }

    if (source.price) {
      lines.push(`Price: ${source.price}`);
    }

    lines.push(source.shopType || "Shop purchase");
    return lines;
  }

  if (source.type === "special") {
    const categoryKey = source.sourceCategoryKey || "";

    if (categoryKey === "manual_gathering_fallback") {
      lines.push("Normal gathering item.");
      lines.push("Exact node details need verification.");
      return lines;
    }

    if (categoryKey === "manual_special_material") {
      lines.push("Special or uncommon source.");
      lines.push("Exact acquisition needs verification.");
      return lines;
    }

    if (categoryKey === "manual_review_name_mismatch") {
      lines.push("Item name did not match cleanly during source lookup.");
      lines.push("Exact source needs manual verification.");
      return lines;
    }

    if (source.acquisitionNote) {
      lines.push(source.acquisitionNote);
    }

    if (source.confidence && source.confidence !== "manual") {
      lines.push(`Confidence: ${source.confidence}`);
    }

    lines.push(
      `${source.nodeType || "Special Source"} · ${getSourceAvailabilityText(
        source
      )}`
    );

    return lines;
  }

  if (source.gatheringClass) {
    lines.push(source.gatheringClass);
  }

  if (source.gatheringType) {
    lines.push(source.gatheringType);
  }

  if (source.level) {
    lines.push(`Level ${source.level}`);
  }

  if (source.coordinates) {
    const coordinateText = getRouteCoordinateText(source.coordinates);

    if (coordinateText) {
      lines.push(coordinateText);
    }
  }

  lines.push(getSourceAvailabilityText(source));

  return lines;
}

function MaterialSourceDetails({ materialName }) {
  const sourceEntry = getMaterialSourceEntry(materialName);

  if (!sourceEntry?.sources || sourceEntry.sources.length === 0) {
    return (
      <div className="material-source-panel">
        <div className="material-source-box">
          <div className="material-source-header">
            <strong>Source details</strong>
          </div>

          <p className="source-overflow-note">
            No source data found for this material yet.
          </p>
        </div>
      </div>
    );
  }

  const visibleSources = sourceEntry.sources.slice(0, 4);
  const hiddenSourceCount = sourceEntry.sources.length - visibleSources.length;

  return (
    <div className="material-source-panel">
      <div className="material-source-box">
        <div className="material-source-header">
          <strong>Source details</strong>
          <span className="badge">{sourceEntry.sources.length} source(s)</span>
        </div>

        <div className="material-source-list">
          {visibleSources.map((source, index) => (
            <div
              key={`${source.type || "source"}-${index}`}
              className="source-card"
            >
              <strong>{getSourceTitle(source)}</strong>
              <span>{getSourceLocation(source)}</span>

              {getSourceDetailLines(source).map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          ))}
        </div>

        {hiddenSourceCount > 0 && (
          <p className="source-overflow-note">
            +{hiddenSourceCount} more source(s) not shown.
          </p>
        )}
      </div>
    </div>
  );
}

function ExpandableMaterialRow({
  materialName,
  quantity,
  sourceKey,
  selectedSourceKey,
  onToggle,
  largeIcon = false,
  showMaterialBadge = false,
}) {
  const expanded = selectedSourceKey === sourceKey;

  return (
    <div className={expanded ? "card material-card expanded" : "card material-card"}>
      <button
        className="material-card-button"
        onClick={() => onToggle(sourceKey)}
        type="button"
      >
        <span className="item-title-row">
          <ItemIcon name={materialName} small={!largeIcon} />
          <strong>{materialName}</strong>
        </span>

        <span className="material-row-actions">
          {showMaterialBadge && <span className="badge">material</span>}
          <strong>{quantity}</strong>
          <span className="material-expand-indicator">
            {expanded ? "−" : "+"}
          </span>
        </span>
      </button>

      {expanded && <MaterialSourceDetails materialName={materialName} />}
    </div>
  );
}

function isCrystalShardOrCluster(materialName) {
  return /\b(shard|crystal|cluster)\b/i.test(materialName);
}

function getPrimaryShoppingGroup(materialName) {
  if (isCrystalShardOrCluster(materialName)) {
    return "crystals";
  }

  const entry = getMaterialSourceEntry(materialName);

  if (!entry?.sources || entry.sources.length === 0) {
    return "unknown";
  }

  const sourceTypes = new Set(entry.sources.map((source) => source.type));

  if (sourceTypes.has("shop")) {
    return "vendor";
  }

  if (
    sourceTypes.has("gathering") ||
    Array.from(sourceTypes).some(
      (type) => type === "botanist" || type === "miner"
    )
  ) {
    return "gathering";
  }

  if (sourceTypes.has("monsterDrop")) {
    return "monsterDrop";
  }

  if (sourceTypes.has("fishing")) {
    return "fishing";
  }

  if (sourceTypes.has("crafted")) {
    return "crafted";
  }

  if (sourceTypes.has("loot")) {
    return "loot";
  }

  if (sourceTypes.has("instance")) {
    return "instance";
  }

  if (sourceTypes.has("special")) {
    return "special";
  }

  return "unknown";
}

function groupShoppingMaterials(materialRows) {
  const groups = Object.fromEntries(
    SHOPPING_GROUP_ORDER.map((groupKey) => [groupKey, []])
  );

  for (const [materialName, quantity] of materialRows) {
    const groupKey = getPrimaryShoppingGroup(materialName);

    if (!groups[groupKey]) {
      groups.unknown.push([materialName, quantity]);
      continue;
    }

    groups[groupKey].push([materialName, quantity]);
  }

  return SHOPPING_GROUP_ORDER
    .map((groupKey) => ({
      key: groupKey,
      label: SHOPPING_GROUP_LABELS[groupKey],
      rows: groups[groupKey],
    }))
    .filter((group) => group.rows.length > 0);
}

function getRouteCoordinateText(coordinates) {
  if (!coordinates) {
    return null;
  }

  const x = coordinates.x ?? null;
  const y = coordinates.y ?? null;

  if (x === null || y === null) {
    return null;
  }

  return `X: ${x} · Y: ${y}`;
}

function getNpcRouteLocation(source) {
  if (!Array.isArray(source?.npcs) || source.npcs.length === 0) {
    return null;
  }

  const npcWithLocation = source.npcs.find(
    (npc) => npc?.zone || npc?.area || npc?.region || npc?.coordinates
  );

  const npc = npcWithLocation || source.npcs[0];

  return {
    region: npc.region ?? source.region ?? null,
    zone: npc.zone ?? source.zone ?? null,
    area: npc.area ?? source.area ?? null,
    coordinates: npc.coordinates ?? source.coordinates ?? null,
    label: npc.name ?? source.npcName ?? "Vendor",
  };
}

function getSourceRouteLocation(source) {
  if (!source) {
    return null;
  }

  if (source.type === "monsterDrop") {
    const position = getFirstMonsterPosition(source);

    if (!position) {
      return null;
    }

    return {
      region: position.region ?? null,
      zone: position.zone ?? null,
      area: position.area ?? null,
      coordinates: position.coordinates ?? null,
      label: toTitleCase(source.monsterName || "Monster Drop"),
    };
  }

  if (source.type === "shop") {
    return getNpcRouteLocation(source);
  }

  return {
    region: source.region ?? null,
    zone: source.zone ?? null,
    area: source.area ?? null,
    coordinates: source.coordinates ?? null,
    label:
      source.nodeType ||
      source.gatheringType ||
      source.sourceCategory ||
      source.instanceName ||
      source.sourceItemName ||
      source.type ||
      "Source",
  };
}

function getRouteSourceDetail(source) {
  if (!source) {
    return "Source unknown";
  }

  if (source.type === "monsterDrop") {
    return `Monster Drop · ${toTitleCase(
      source.monsterName || "Unknown Monster"
    )}`;
  }

  if (source.type === "shop") {
    const npcNames = getNpcNames(source);

    if (npcNames.length > 0) {
      return `Vendor · ${npcNames.slice(0, 2).join(", ")}`;
    }

    return `Vendor · ${source.shopType || source.gatheringType || "Shop"}`;
  }

  if (source.type === "fishing") {
    return `Fishing · ${source.gatheringType || "Fishing Spot"}`;
  }

  if (source.type === "crafted") {
    return `Crafted · ${source.recipeJobName || "Recipe"}`;
  }

  if (source.type === "instance") {
    return `Instance · ${source.instanceName || source.instanceCategory || "Loot"}`;
  }

  if (source.type === "loot") {
    return `Loot · ${source.sourceItemName || source.sourceCategory || "Source"}`;
  }

  if (source.type === "special") {
    return `Special · ${source.sourceCategory || "Manual Review"}`;
  }

  const parts = [
    source.gatheringClass,
    source.gatheringType,
    source.level ? `Lv. ${source.level}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Source";
}

function getBestRouteSource(materialName) {
  const entry = getMaterialSourceEntry(materialName);

  if (!entry?.sources || entry.sources.length === 0) {
    return {
      source: null,
      routeLocation: null,
      sourceType: "unknown",
    };
  }

  for (const sourceType of ROUTE_SOURCE_PRIORITY) {
    const source = entry.sources.find(
      (candidate) => candidate.type === sourceType
    );

    if (!source) {
      continue;
    }

    return {
      source,
      routeLocation: getSourceRouteLocation(source),
      sourceType,
    };
  }

  const fallbackSource = entry.sources[0];

  return {
    source: fallbackSource,
    routeLocation: getSourceRouteLocation(fallbackSource),
    sourceType: fallbackSource.type || "unknown",
  };
}

function getRouteStopKey(routeLocation, sourceType) {
  if (!routeLocation?.zone && !routeLocation?.area && !routeLocation?.region) {
    return `${sourceType}:unknown`;
  }

  return [
    sourceType,
    routeLocation.region || "Unknown Region",
    routeLocation.zone || "Unknown Zone",
    routeLocation.area || "",
  ].join("|");
}

function getRouteStopTitle(routeLocation, sourceType) {
  if (sourceType === "shop") {
    if (routeLocation?.zone || routeLocation?.area) {
      return `Vendor Stop · ${[routeLocation.zone, routeLocation.area]
        .filter(Boolean)
        .join(" — ")}`;
    }

    return "Vendor Stops";
  }

  if (!routeLocation?.zone && !routeLocation?.area && !routeLocation?.region) {
    return "Location Needs Review";
  }

  return [routeLocation.zone, routeLocation.area].filter(Boolean).join(" — ");
}

function getRouteStopSortValue(stop) {
  const sourceRank = {
    shop: 0,
    gathering: 1,
    monsterDrop: 2,
    fishing: 3,
    loot: 4,
    instance: 5,
    crafted: 6,
    special: 7,
    unknown: 8,
  };

  return [
    sourceRank[stop.sourceType] ?? 99,
    stop.region || "",
    stop.title || "",
  ].join("|");
}

function buildShoppingRoutePlan(materialRows) {
  const crystalRows = [];
  const routeStopsByKey = new Map();
  const specialRows = [];

  for (const [materialName, quantity] of materialRows) {
    if (isCrystalShardOrCluster(materialName)) {
      crystalRows.push([materialName, quantity]);
      continue;
    }

    const { source, routeLocation, sourceType } =
      getBestRouteSource(materialName);

    if (!source || sourceType === "special" || sourceType === "crafted") {
      specialRows.push({
        materialName,
        quantity,
        source,
        sourceType,
        sourceDetail: getRouteSourceDetail(source),
      });
      continue;
    }

    const stopKey = getRouteStopKey(routeLocation, sourceType);

    if (!routeStopsByKey.has(stopKey)) {
      routeStopsByKey.set(stopKey, {
        key: stopKey,
        sourceType,
        region: routeLocation?.region ?? null,
        title: getRouteStopTitle(routeLocation, sourceType),
        rows: [],
      });
    }

    routeStopsByKey.get(stopKey).rows.push({
      materialName,
      quantity,
      source,
      sourceType,
      sourceDetail: getRouteSourceDetail(source),
      coordinatesText: getRouteCoordinateText(routeLocation?.coordinates),
    });
  }

  const routeStops = Array.from(routeStopsByKey.values()).sort((a, b) =>
    getRouteStopSortValue(a).localeCompare(getRouteStopSortValue(b))
  );

  return {
    crystalRows,
    routeStops,
    specialRows,
  };
}

function App() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchInput = useDebouncedValue(searchInput, 300);

  const [selectedJob, setSelectedJob] = useState("Carpenter");
  const [selectedLevelRange, setSelectedLevelRange] = useState(LEVEL_RANGES[0]);
  const [selectedRecipeType, setSelectedRecipeType] = useState("standard");
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState(null);
  const [craftingList, setCraftingList] = useState(() => loadCraftingList());
  const [copyStatus, setCopyStatus] = useState("");
  const [shoppingViewMode, setShoppingViewMode] = useState("grouped");

  const recipeOutputIndex = useMemo(() => {
    return createRecipeOutputIndex(RECIPES);
  }, []);

  useEffect(() => {
    setSearchQuery(debouncedSearchInput);
  }, [debouncedSearchInput]);

  useEffect(() => {
    saveCraftingList(craftingList);
  }, [craftingList]);

  const recipeIds = useMemo(() => {
    return getFilteredRecipeIds(
      RECIPES,
      selectedJob,
      selectedLevelRange,
      searchQuery,
      selectedRecipeType
    );
  }, [selectedJob, selectedLevelRange, searchQuery, selectedRecipeType]);

  const mainRecipe = selectedRecipeId ? RECIPES[selectedRecipeId] : null;

  const expandedRecipe = useMemo(() => {
    if (selectedIngredient?.type !== "recipe") {
      return null;
    }

    return findBestRecipeForItem(
      RECIPES,
      selectedIngredient.name,
      mainRecipe?.job,
      recipeOutputIndex
    );
  }, [selectedIngredient, mainRecipe?.job, recipeOutputIndex]);

  const craftingListRawTotals = useMemo(() => {
    return calculateCraftingListRawMaterials(RECIPES, craftingList);
  }, [craftingList]);

  const shoppingMaterialRows = useMemo(() => {
    return sortShoppingMaterials(Object.entries(craftingListRawTotals));
  }, [craftingListRawTotals]);

  const groupedShoppingMaterials = useMemo(() => {
    return groupShoppingMaterials(shoppingMaterialRows);
  }, [shoppingMaterialRows]);

  const shoppingRoutePlan = useMemo(() => {
    return buildShoppingRoutePlan(shoppingMaterialRows);
  }, [shoppingMaterialRows]);

  const craftingRecipeIdSet = useMemo(() => {
    return new Set(craftingList.map((entry) => entry.recipeId));
  }, [craftingList]);

  const isGlobalSearchMode = searchQuery.trim().length > 0;

  function toggleSourceMaterial(sourceKey) {
    setSelectedSourceKey((currentKey) =>
      currentKey === sourceKey ? null : sourceKey
    );
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
  }

  function selectJob(job) {
    setSelectedJob(job);
    setSelectedRecipeId(null);
    setSelectedIngredient(null);
    setSelectedSourceKey(null);
    clearSearch();
  }

  function selectLevelRange(levelRange) {
    setSelectedLevelRange(levelRange);
    setSelectedRecipeId(null);
    setSelectedIngredient(null);
    setSelectedSourceKey(null);
  }

  function selectRecipeType(recipeType) {
    setSelectedRecipeType(recipeType);
    setSelectedRecipeId(null);
    setSelectedIngredient(null);
    setSelectedSourceKey(null);
  }

  function selectRecipe(recipeId) {
    setSelectedRecipeId(recipeId);
    setSelectedIngredient(null);
    setSelectedSourceKey(null);
  }

  function selectIngredient(ingredient) {
    const normalizedIngredient = normalizeIngredientType(
      RECIPES,
      ingredient,
      recipeOutputIndex
    );

    setSelectedIngredient(normalizedIngredient);
    setSelectedSourceKey(null);
  }

  function isRecipeInCraftingList(recipeId) {
    return craftingRecipeIdSet.has(recipeId);
  }

  function toggleRecipeInCraftingList(recipeId) {
    setCraftingList((currentList) => {
      const alreadyInList = currentList.some(
        (entry) => entry.recipeId === recipeId
      );

      if (alreadyInList) {
        return currentList.filter((entry) => entry.recipeId !== recipeId);
      }

      return [...currentList, { recipeId, quantity: 1 }];
    });
  }

  function addVisibleRecipesToList() {
    setCraftingList((currentList) => {
      const existingRecipeIds = new Set(
        currentList.map((entry) => entry.recipeId)
      );

      const newEntries = recipeIds
        .filter((recipeId) => !existingRecipeIds.has(recipeId))
        .map((recipeId) => ({
          recipeId,
          quantity: 1,
        }));

      return [...currentList, ...newEntries];
    });
  }

  function addSelectedRecipeToList() {
    if (!selectedRecipeId || !mainRecipe) {
      return;
    }

    setCraftingList((currentList) => {
      const existingEntry = currentList.find(
        (entry) => entry.recipeId === selectedRecipeId
      );

      if (existingEntry) {
        return currentList.map((entry) =>
          entry.recipeId === selectedRecipeId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry
        );
      }

      return [...currentList, { recipeId: selectedRecipeId, quantity: 1 }];
    });
  }

  function completeCraftingListItem(recipeId) {
    setCraftingList((currentList) =>
      currentList.filter((entry) => entry.recipeId !== recipeId)
    );
  }

  function increaseCraftingListQuantity(recipeId) {
    setCraftingList((currentList) =>
      currentList.map((entry) =>
        entry.recipeId === recipeId
          ? { ...entry, quantity: entry.quantity + 1 }
          : entry
      )
    );
  }

  function decreaseCraftingListQuantity(recipeId) {
    setCraftingList((currentList) =>
      currentList.map((entry) =>
        entry.recipeId === recipeId
          ? { ...entry, quantity: Math.max(1, entry.quantity - 1) }
          : entry
      )
    );
  }

  function clearCraftingList() {
    setCraftingList([]);
    setSelectedSourceKey(null);
  }

  function buildShoppingListText() {
    if (shoppingMaterialRows.length === 0) {
      return "";
    }

    return shoppingMaterialRows
      .map(([materialName, quantity]) => `${materialName}: ${quantity}`)
      .join("\n");
  }

  async function copyShoppingList() {
    const text = buildShoppingListText();

    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied shopping list.");
    } catch {
      setCopyStatus("Could not copy automatically. You can copy from the box.");
    }

    window.setTimeout(() => {
      setCopyStatus("");
    }, 2200);
  }

  return (
    <main className="app">
      <header className="app-heading">
        <h1>FFXIV Shopping List</h1>
        <p>
          Pick recipes, build a crafting queue, and generate one clean material
          list.
        </p>
      </header>

      <section className="crafting-filters">
        <div className="job-tabs">
          {CRAFTING_JOBS.map((job) => (
            <button
              key={job}
              className={selectedJob === job ? "job-tab active" : "job-tab"}
              onClick={() => selectJob(job)}
              type="button"
            >
              {job}
            </button>
          ))}
        </div>

        <div className="filter-section">
          <div className="button-grid level-grid">
            {LEVEL_RANGES.map((levelRange) => (
              <button
                key={levelRange.label}
                className={
                  selectedLevelRange.label === levelRange.label
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() => selectLevelRange(levelRange)}
                type="button"
              >
                {levelRange.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="columns five-columns">
        <section className="panel">
          <h2>1) Crafting Log</h2>

          <p className="panel-subtitle">
            {isGlobalSearchMode
              ? "Searching all jobs, levels, categories, and ingredients."
              : `${selectedJob} recipes from ${selectedLevelRange.label}.`}
          </p>

          <input
            className="search panel-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setSearchQuery(searchInput);
              }

              if (event.key === "Escape") {
                clearSearch();
              }
            }}
            placeholder="Search all recipes, jobs, levels, or ingredients..."
          />

          <div className="quick-filter-group">
            {RECIPE_TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={
                  selectedRecipeType === filter.value && !isGlobalSearchMode
                    ? "quick-filter-button active"
                    : "quick-filter-button"
                }
                onClick={() => selectRecipeType(filter.value)}
                type="button"
                disabled={isGlobalSearchMode}
                title={
                  isGlobalSearchMode
                    ? "Recipe type filters are ignored while searching globally."
                    : ""
                }
              >
                {filter.label}
              </button>
            ))}
          </div>

          <button
            className="secondary-wide-button"
            type="button"
            onClick={addVisibleRecipesToList}
          >
            Add Visible Recipes to Crafting List
          </button>

          <p className="filtered-summary">
            {isGlobalSearchMode
              ? `Showing ${recipeIds.length} search result(s) across all jobs.`
              : `Showing ${recipeIds.length} recipe(s).`}
          </p>

          <div className="panel-scroll">
            <div className="list">
              {recipeIds.length === 0 && (
                <div className="empty">No recipes match the current filters.</div>
              )}

              {recipeIds.map((recipeId) => {
                const recipe = RECIPES[recipeId];
                const active = selectedRecipeId === recipeId;
                const inCraftingList = isRecipeInCraftingList(recipeId);

                return (
                  <div
                    key={recipeId}
                    className={
                      active
                        ? "card recipe-list-card active"
                        : "card recipe-list-card"
                    }
                  >
                    <button
                      className="recipe-select-button"
                      onClick={() => selectRecipe(recipeId)}
                      type="button"
                    >
                      <ItemIcon recipe={recipe} />

                      <span className="recipe-card-text">
                        <strong>
                          {recipe.name}
                          {getStarLabel(recipe.stars)}
                        </strong>

                        <span>
                          Lv. {recipe.level}
                          {getStarLabel(recipe.stars)} | {recipe.job} | Makes{" "}
                          {recipe.amountCreated}
                        </span>

                        {getRecipeObjectiveEntry(recipeId) && (
                          <span>
                            {recipeHasLeves(recipeId) &&
                              `Leves: ${
                                getRecipeObjectiveEntry(recipeId).leves.length
                              }`}
                            {recipeHasLeves(recipeId) &&
                            recipeHasQuests(recipeId)
                              ? " | "
                              : ""}
                            {recipeHasQuests(recipeId) &&
                              `Quests: ${
                                getRecipeObjectiveEntry(recipeId).quests.length
                              }`}
                          </span>
                        )}
                      </span>
                    </button>

                    <button
                      className={
                        inCraftingList
                          ? "recipe-toggle-button checked"
                          : "recipe-toggle-button"
                      }
                      onClick={() => toggleRecipeInCraftingList(recipeId)}
                      title={
                        inCraftingList
                          ? "Remove from Crafting List"
                          : "Add to Crafting List"
                      }
                      type="button"
                    >
                      {inCraftingList ? "✓" : "+"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>
            <ScrollText className="panel-icon" />
            2) Ingredients
          </h2>

          <p className="panel-subtitle">
            {selectedRecipeId && mainRecipe
              ? `${mainRecipe.name}${getStarLabel(mainRecipe.stars)} creates ${
                  mainRecipe.amountCreated
                }`
              : "Select a recipe first."}
          </p>

          {mainRecipe && (
            <button
              className="primary-button"
              onClick={addSelectedRecipeToList}
              type="button"
            >
              Add Selected Recipe to Crafting List
            </button>
          )}

          <div className="panel-scroll">
            <div className="list">
              {!mainRecipe && (
                <div className="empty">
                  Select a recipe from the Crafting Log to view its ingredients.
                </div>
              )}

              {mainRecipe?.ingredients.map((ingredient) => {
                const craftable = isCraftable(
                  RECIPES,
                  ingredient.name,
                  recipeOutputIndex
                );
                const type = craftable ? "recipe" : "material";
                const active = selectedIngredient?.name === ingredient.name;

                if (type === "material") {
                  return (
                    <ExpandableMaterialRow
                      key={`${ingredient.name}-${ingredient.quantity}`}
                      materialName={ingredient.name}
                      quantity={ingredient.quantity}
                      sourceKey={`ingredient-${selectedRecipeId}-${slugifyItemName(
                        ingredient.name
                      )}`}
                      selectedSourceKey={selectedSourceKey}
                      onToggle={toggleSourceMaterial}
                      largeIcon
                      showMaterialBadge
                    />
                  );
                }

                return (
                  <button
                    key={`${ingredient.name}-${ingredient.quantity}`}
                    className={active ? "card active" : "card"}
                    onClick={() => selectIngredient({ ...ingredient, type })}
                    type="button"
                  >
                    <div className="card-row">
                      <span className="item-title-row">
                        <ItemIcon name={ingredient.name} />
                        <strong>{ingredient.name}</strong>
                      </span>

                      <span className="badge recipe">{type}</span>
                    </div>

                    <span>Quantity needed: {ingredient.quantity}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>
            <PackageSearch className="panel-icon" />
            3) Recipe-as-Material
          </h2>

          <p className="panel-subtitle">
            Select a craftable ingredient from column two.
          </p>

          <div className="panel-scroll">
            {!selectedIngredient && (
              <div className="empty">
                Select a craftable ingredient to expand it here.
              </div>
            )}

            {selectedIngredient && !expandedRecipe && (
              <div className="empty">
                {selectedIngredient.name} is a raw material, so it has no recipe
                expansion.
              </div>
            )}

            {expandedRecipe && (
              <>
                <div className="expanded-header">
                  <span className="item-title-row">
                    <ItemIcon recipe={expandedRecipe} />
                    <strong>
                      {selectedIngredient.name}
                      {getStarLabel(expandedRecipe.stars)}
                    </strong>
                  </span>

                  <span>
                    Needed by main recipe: {selectedIngredient.quantity}
                  </span>

                  <span>
                    Lv. {expandedRecipe.level}
                    {getStarLabel(expandedRecipe.stars)} | {expandedRecipe.job}
                  </span>
                </div>

                <div className="list">
                  {expandedRecipe.ingredients.map((ingredient) => {
                    const craftable = isCraftable(
                      RECIPES,
                      ingredient.name,
                      recipeOutputIndex
                    );
                    const type = craftable ? "recipe" : "material";

                    if (type === "material") {
                      return (
                        <ExpandableMaterialRow
                          key={`${ingredient.name}-${ingredient.quantity}`}
                          materialName={ingredient.name}
                          quantity={ingredient.quantity}
                          sourceKey={`expanded-${
                            expandedRecipe.recipeId || expandedRecipe.name
                          }-${slugifyItemName(ingredient.name)}`}
                          selectedSourceKey={selectedSourceKey}
                          onToggle={toggleSourceMaterial}
                          largeIcon
                          showMaterialBadge
                        />
                      );
                    }

                    return (
                      <div
                        key={`${ingredient.name}-${ingredient.quantity}`}
                        className="card readonly"
                      >
                        <div className="card-row">
                          <span className="item-title-row">
                            <ItemIcon name={ingredient.name} />
                            <strong>{ingredient.name}</strong>
                          </span>

                          <span className="badge recipe">{type}</span>
                        </div>

                        <span>Quantity needed: {ingredient.quantity}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>
            <ClipboardList className="panel-icon" />
            4) Crafting List
          </h2>

          <p className="panel-subtitle">
            Recipes you plan to complete. Saved locally in this browser.
          </p>

          <div className="panel-scroll">
            {craftingList.length === 0 && (
              <div className="empty">
                Your crafting list is empty. Select a recipe and click “Add to
                Crafting List.”
              </div>
            )}

            {craftingList.length > 0 && (
              <>
                <div className="list">
                  {craftingList.map((entry) => {
                    const recipe = RECIPES[entry.recipeId];

                    if (!recipe) {
                      return null;
                    }

                    return (
                      <div key={entry.recipeId} className="card readonly">
                        <div className="card-row">
                          <span className="item-title-row">
                            <ItemIcon recipe={recipe} />
                            <strong>
                              {recipe.name}
                              {getStarLabel(recipe.stars)}
                            </strong>
                          </span>

                          <span className="badge recipe">x{entry.quantity}</span>
                        </div>

                        <span>
                          Lv. {recipe.level}
                          {getStarLabel(recipe.stars)} | {recipe.job}
                        </span>

                        <div className="crafting-actions">
                          <button
                            className="small-button"
                            onClick={() =>
                              decreaseCraftingListQuantity(entry.recipeId)
                            }
                            type="button"
                          >
                            -
                          </button>

                          <button
                            className="small-button"
                            onClick={() =>
                              increaseCraftingListQuantity(entry.recipeId)
                            }
                            type="button"
                          >
                            +
                          </button>

                          <button
                            className="complete-button"
                            onClick={() =>
                              completeCraftingListItem(entry.recipeId)
                            }
                            type="button"
                          >
                            Complete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  className="danger-button"
                  onClick={clearCraftingList}
                  type="button"
                >
                  Clear Crafting List
                </button>
              </>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>
            <ShoppingBasket className="panel-icon" />
            5) Grand Shopping List
          </h2>

          <p className="panel-subtitle">
            Combined raw materials for every recipe in your Crafting List.
          </p>

          <div className="panel-scroll">
            {craftingList.length === 0 && (
              <div className="empty">
                Add recipes to your Crafting List to generate a shopping list.
              </div>
            )}

            {craftingList.length > 0 && (
              <>
                <div className="section-heading-row">
                  <h3>Materials Needed</h3>

                  <button
                    className="secondary-button"
                    onClick={copyShoppingList}
                    type="button"
                  >
                    Copy List
                  </button>
                </div>

                <div className="shopping-view-toggle">
                  <button
                    className={
                      shoppingViewMode === "grouped"
                        ? "quick-filter-button active"
                        : "quick-filter-button"
                    }
                    onClick={() => setShoppingViewMode("grouped")}
                    type="button"
                  >
                    Grouped List
                  </button>

                  <button
                    className={
                      shoppingViewMode === "route"
                        ? "quick-filter-button active"
                        : "quick-filter-button"
                    }
                    onClick={() => setShoppingViewMode("route")}
                    type="button"
                  >
                    Route View
                  </button>
                </div>

                {copyStatus && <p className="copy-status">{copyStatus}</p>}

                <div className="raw-breakdown no-top-border">
                  {shoppingViewMode === "grouped" &&
                    groupedShoppingMaterials.map((group) => (
                      <div key={group.key} className="shopping-group">
                        <h3 className="shopping-group-title">{group.label}</h3>

                        <div className="material-list">
                          {group.rows.map(([materialName, quantity]) => (
                            <ExpandableMaterialRow
                              key={materialName}
                              materialName={materialName}
                              quantity={quantity}
                              sourceKey={`grand-${
                                group.key
                              }-${slugifyItemName(materialName)}`}
                              selectedSourceKey={selectedSourceKey}
                              onToggle={toggleSourceMaterial}
                            />
                          ))}
                        </div>
                      </div>
                    ))}

                  {shoppingViewMode === "route" && (
                    <div className="route-plan">
                      {shoppingRoutePlan.crystalRows.length > 0 && (
                        <div className="shopping-group">
                          <h3 className="shopping-group-title">
                            Crystals / Shards / Clusters
                          </h3>

                          <p className="route-note">
                            Check your stock first. These are not included in
                            routing.
                          </p>

                          <div className="material-list">
                            {shoppingRoutePlan.crystalRows.map(
                              ([materialName, quantity]) => (
                                <ExpandableMaterialRow
                                  key={materialName}
                                  materialName={materialName}
                                  quantity={quantity}
                                  sourceKey={`route-crystals-${slugifyItemName(
                                    materialName
                                  )}`}
                                  selectedSourceKey={selectedSourceKey}
                                  onToggle={toggleSourceMaterial}
                                />
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {shoppingRoutePlan.routeStops.map((stop) => (
                        <div key={stop.key} className="route-stop">
                          <h3 className="shopping-group-title">{stop.title}</h3>

                          <div className="material-list">
                            {stop.rows.map((row) => (
                              <div
                                key={row.materialName}
                                className="route-material-card"
                              >
                                <ExpandableMaterialRow
                                  materialName={row.materialName}
                                  quantity={row.quantity}
                                  sourceKey={`route-${
                                    stop.key
                                  }-${slugifyItemName(row.materialName)}`}
                                  selectedSourceKey={selectedSourceKey}
                                  onToggle={toggleSourceMaterial}
                                />

                                <div className="route-source-summary">
                                  <span>{row.sourceDetail}</span>
                                  {row.coordinatesText && (
                                    <span>{row.coordinatesText}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {shoppingRoutePlan.specialRows.length > 0 && (
                        <div className="shopping-group">
                          <h3 className="shopping-group-title">
                            Special / Needs Review
                          </h3>

                          <div className="material-list">
                            {shoppingRoutePlan.specialRows.map((row) => (
                              <div
                                key={row.materialName}
                                className="route-material-card"
                              >
                                <ExpandableMaterialRow
                                  materialName={row.materialName}
                                  quantity={row.quantity}
                                  sourceKey={`route-special-${slugifyItemName(
                                    row.materialName
                                  )}`}
                                  selectedSourceKey={selectedSourceKey}
                                  onToggle={toggleSourceMaterial}
                                />

                                <div className="route-source-summary">
                                  <span>{row.sourceDetail}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <textarea
                  className="shopping-list-box"
                  readOnly
                  value={buildShoppingListText()}
                  aria-label="Copyable shopping list"
                />
              </>
            )}
          </div>
        </section>
      </section>

      <footer className="support-footer">
        <a
          className="support-card"
          href="https://ko-fi.com/faytestudios"
          target="_blank"
          rel="noreferrer"
        >
          <strong>Support on Ko-fi</strong>
          <span>Help keep updates and new features coming.</span>
        </a>

        <span className="support-disclaimer">
          Fan-made FFXIV crafting utility. Not affiliated with Square Enix.
        </span>
      </footer>
    </main>
  );
}
export default App;