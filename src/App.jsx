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
import {
  calculateCraftingListRawMaterials,
  calculateRawMaterials,
  createRecipeOutputIndex,
  findBestRecipeForItem,
  isCraftable,
  normalizeIngredientType,
} from "./utils/recipeUtils";
import { loadCraftingList, saveCraftingList } from "./utils/storageUtils";

const RECIPES = recipes;

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
];

const ICON_BASE_PATH = `${import.meta.env.BASE_URL}icons/items/`;

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

function getIconEntryForName(name) {
  return icons[slugifyItemName(name)] || null;
}

function getIconEntryForRecipe(recipe) {
  if (recipe?.icon && icons[recipe.icon]) {
    return icons[recipe.icon];
  }

  return getIconEntryForName(recipe?.name || "");
}

function ItemIcon({ name, recipe, small = false }) {
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

  const terms = query.split(/\s+/).filter(Boolean);

  const searchableText = [
    recipe.name,
    recipe.job,
    recipe.category,
    recipe.level,
    recipe.stars ? "star starred expert" : "",
    ...(recipe.ingredients || []).map((ingredient) => ingredient.name),
  ]
    .filter((value) => value !== undefined && value !== null)
    .join(" ")
    .toLowerCase();

  return terms.every((term) => searchableText.includes(term));
}

function isSpecialRecipe(recipe) {
  return recipe.category === "Other" || recipe.category === "Skybuilders";
}

function isFurnitureRecipe(recipe) {
  return recipe.category === "Furniture";
}

function isStarredRecipe(recipe) {
  return (recipe.stars || 0) > 0;
}

function recipeMatchesTypeFilter(recipe, selectedRecipeType) {
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

function getStarLabel(stars = 0) {
  if (!stars) {
    return "";
  }

  return " " + "★".repeat(stars);
}

function getFilteredRecipeIds(
  recipes,
  selectedJob,
  selectedLevelRange,
  search,
  selectedRecipeType
) {
  const hasSearch = search.trim().length > 0;

  return Object.keys(recipes)
    .filter((recipeId) => {
      const recipe = recipes[recipeId];

      if (hasSearch) {
        return recipeMatchesSearch(recipe, search);
      }

      return (
        recipeMatchesJob(recipe, selectedJob) &&
        recipeMatchesLevelRange(recipe, selectedLevelRange) &&
        recipeMatchesTypeFilter(recipe, selectedRecipeType)
      );
    })
    .sort((a, b) => {
      const recipeA = recipes[a];
      const recipeB = recipes[b];

      if (hasSearch && recipeA.job !== recipeB.job) {
        return recipeA.job.localeCompare(recipeB.job);
      }

      if (recipeA.level !== recipeB.level) {
        return recipeA.level - recipeB.level;
      }

      const starsA = recipeA.stars || 0;
      const starsB = recipeB.stars || 0;

      if (starsA !== starsB) {
        return starsA - starsB;
      }

      return recipeA.name.localeCompare(recipeB.name);
    });
}

function sortShoppingMaterials(entries) {
  return [...entries].sort(([nameA], [nameB]) =>
    nameA.localeCompare(nameB)
  );
}
function getMaterialSourceEntry(materialName) {
  return materialSources[slugifyItemName(materialName)] || null;
}

function toTitleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && word === word.toUpperCase()) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function getNpcNames(source) {
  if (!Array.isArray(source.npcs)) {
    return [];
  }

  return source.npcs
    .map((npc) => npc?.name)
    .filter(Boolean)
    .filter((name, index, names) => names.indexOf(name) === index);
}

function getFirstMonsterPosition(source) {
  if (!Array.isArray(source.positions) || source.positions.length === 0) {
    return null;
  }

  return source.positions.find((position) => !position?.fate) || source.positions[0];
}

function getCoordinatesText(coordinates) {
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

function getSourceTitle(source) {
  if (!source) {
    return "Source";
  }

  if (source.type === "monsterDrop") {
    return `Monster Drop · ${toTitleCase(source.monsterName || "Unknown Monster")}`;
  }

  if (source.type === "shop") {
    const shopType = source.shopType || source.gatheringType || "Shop";
    return `Vendor · ${shopType}`;
  }

  if (source.type === "loot") {
    return source.sourceCategory
      ? `Loot · ${source.sourceCategory}`
      : "Loot Source";
  }

  if (source.type === "fishing") {
    const parts = [
      "Fisher",
      source.gatheringType,
      source.level ? `Lv. ${source.level}` : null,
    ].filter(Boolean);

    return parts.join(" · ");
  }

  if (source.type === "instance") {
    return source.instanceCategory
      ? `${source.instanceCategory} · Loot`
      : "Instance Loot";
  }

  if (source.type === "crafted") {
    const parts = [
      "Crafted",
      source.recipeJobName,
      source.level ? `Lv. ${source.level}` : null,
    ].filter(Boolean);

    return parts.join(" · ");
  }

  if (source.type === "special") {
    const parts = [
      "Special",
      source.gatheringType || source.sourceCategory,
    ].filter(Boolean);

    return parts.join(" · ");
  }

  const parts = [
    source.gatheringClass,
    source.gatheringType,
    source.level ? `Lv. ${source.level}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Source";
}

function getSourceLocation(source) {
  if (!source) {
    return "Location unknown";
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

    return "Monster location not listed";
  }

  if (source.type === "shop") {
    const npcNames = getNpcNames(source);

    if (npcNames.length > 0) {
      const visibleNames = npcNames.slice(0, 3).join(", ");
      const extraCount = npcNames.length - 3;

      return extraCount > 0
        ? `${visibleNames}, +${extraCount} more`
        : visibleNames;
    }

    return "Vendor location unknown";
  }

  if (source.type === "loot") {
    return source.sourceItemName || "Loot source unknown";
  }

  if (source.type === "instance") {
    return source.instanceName || source.zone || "Instance location unknown";
  }

  if (source.type === "special") {
    return source.sourceCategory || "Special source";
  }

  if (source.type === "crafted") {
    return source.recipeJobName || "Crafting recipe";
  }

  const locationParts = [source.zone, source.area].filter(Boolean);

  if (locationParts.length > 0) {
    return locationParts.join(" — ");
  }

  if (source.zoneId || source.mapId) {
    return `Map ID ${source.mapId ?? "?"}, Zone ID ${source.zoneId ?? "?"}`;
  }

  return "Location unknown";
}

function getSourceAvailabilityText(source) {
  if (!source?.timed) {
    return "Always available";
  }

  const times =
    source.spawnTimes && source.spawnTimes.length > 0
      ? source.spawnTimes.join(", ")
      : "Timed";

  return source.duration ? `${times} for ${source.duration}` : times;
}

function getSourceDetailLines(source) {
  if (!source) {
    return [];
  }

  const lines = [];

  if (source.type === "monsterDrop") {
    const position = getFirstMonsterPosition(source);

    if (position?.level) {
      lines.push(`Monster level: ${position.level}`);
    }

    const positionCoordinates = getCoordinatesText(position?.coordinates);

    if (positionCoordinates) {
      lines.push(positionCoordinates);
    }

    if (source.positions?.length > 1) {
      lines.push(`${source.positions.length} known spawn entries`);
    }

    lines.push("Monster drop");

    return lines;
  }

  if (source.type === "shop") {
    if (source.priceText) {
      lines.push(`Cost: ${source.priceText}`);
    } else if (Array.isArray(source.currencies) && source.currencies.length > 0) {
      lines.push(
        `Cost: ${source.currencies
          .map((currency) => `${currency.amount} ${currency.name}`)
          .join(", ")}`
      );
    }

    if (source.purchasedItem?.amount && source.purchasedItem.amount > 1) {
      lines.push(`Purchase amount: ${source.purchasedItem.amount}`);
    }

    lines.push(`${source.nodeType || "Shop Purchase"} · ${getSourceAvailabilityText(source)}`);

    return lines;
  }

  if (source.type === "loot") {
    if (source.sourceItemName) {
      lines.push(`From: ${source.sourceItemName}`);
    }

    lines.push(`${source.nodeType || "Loot Source"} · ${getSourceAvailabilityText(source)}`);

    return lines;
  }

  if (source.type === "instance") {
    lines.push(`${source.nodeType || "Instance Loot"} · ${getSourceAvailabilityText(source)}`);
    return lines;
  }

  if (source.type === "crafted") {
    if (source.amountCreated) {
      lines.push(`Creates: ${source.amountCreated}`);
    }

    if (Array.isArray(source.ingredients) && source.ingredients.length > 0) {
      const ingredientPreview = source.ingredients
        .slice(0, 3)
        .map((ingredient) => `${ingredient.quantity} ${ingredient.name}`)
        .join(", ");

      lines.push(`Ingredients: ${ingredientPreview}`);
    }

    lines.push("Crafting recipe");

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

    lines.push(`${source.nodeType || "Special Source"} · ${getSourceAvailabilityText(source)}`);

    return lines;
  }

  const coordinatesText = getCoordinatesText(source.coordinates);

  if (coordinatesText) {
    lines.push(coordinatesText);
  }

  lines.push(`${source.nodeType || "Source"} · ${getSourceAvailabilityText(source)}`);

  if (source.hidden) {
    lines.push("Hidden item/node");
  }

  return lines;
}

function MaterialSourceDetails({ materialName }) {
  if (!materialName) {
    return (
      <div className="material-source-box empty small-empty">
        Select a material to see where it comes from.
      </div>
    );
  }

  const entry = getMaterialSourceEntry(materialName);

  if (!entry) {
    return (
      <div className="material-source-box empty small-empty">
        No source data found for {materialName}.
      </div>
    );
  }

  if (!entry.sources || entry.sources.length === 0) {
    return (
      <div className="material-source-box empty small-empty">
        {materialName} does not have a direct source yet.
        <br />
        Status: {entry.status}
      </div>
    );
  }

  return (
    <div className="material-source-box">
      <div className="material-source-header">
        <span className="item-title-row">
          <ItemIcon name={materialName} small />
          <strong>{materialName}</strong>
        </span>

        <span className="badge">{entry.sources.length} source(s)</span>
      </div>

      <div className="material-source-list">
        {entry.sources.slice(0, 8).map((source, index) => {
          const detailLines = getSourceDetailLines(source);

          return (
            <div key={`${materialName}-source-${index}`} className="source-card">
              <strong>{getSourceTitle(source)}</strong>

              <span>{getSourceLocation(source)}</span>

              {detailLines.map((line, lineIndex) => (
                <span key={`${materialName}-source-${index}-line-${lineIndex}`}>
                  {line}
                </span>
              ))}
            </div>
          );
        })}

        {entry.sources.length > 8 && (
          <p className="source-overflow-note">
            Showing first 8 of {entry.sources.length} sources.
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
  const isExpanded = selectedSourceKey === sourceKey;

  return (
    <div
      className={
        isExpanded ? "card material-card expanded" : "card material-card"
      }
    >
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

          {quantity !== undefined && quantity !== null && (
            <strong>{quantity}</strong>
          )}

          <span className="material-expand-indicator">
            {isExpanded ? "−" : "+"}
          </span>
        </span>
      </button>

      {isExpanded && (
        <div className="material-source-panel">
          <MaterialSourceDetails materialName={materialName} />
        </div>
      )}
    </div>
  );

  
  
}
function App() {
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState("Carpenter");
  const [selectedLevelRange, setSelectedLevelRange] = useState(LEVEL_RANGES[0]);
  const [selectedRecipeType, setSelectedRecipeType] = useState("standard");
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [selectedSourceKey, setSelectedSourceKey] = useState(null);
  const [craftingList, setCraftingList] = useState(() => loadCraftingList());
  const [copyStatus, setCopyStatus] = useState("");

  const recipeOutputIndex = useMemo(() => {
    return createRecipeOutputIndex(RECIPES);
  }, []);

  useEffect(() => {
    saveCraftingList(craftingList);
  }, [craftingList]);

  const recipeIds = useMemo(() => {
    return getFilteredRecipeIds(
      RECIPES,
      selectedJob,
      selectedLevelRange,
      search,
      selectedRecipeType
    );
  }, [selectedJob, selectedLevelRange, search, selectedRecipeType]);

  const mainRecipe = selectedRecipeId ? RECIPES[selectedRecipeId] : null;

  const rawMaterialTotals = useMemo(() => {
    if (!selectedRecipeId) {
      return {};
    }

    return calculateRawMaterials(
      RECIPES,
      selectedRecipeId,
      1,
      null,
      recipeOutputIndex
    );
  }, [selectedRecipeId, recipeOutputIndex]);

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

  const craftingRecipeIdSet = useMemo(() => {
    return new Set(craftingList.map((entry) => entry.recipeId));
  }, [craftingList]);

  const isGlobalSearchMode = search.trim().length > 0;

  function toggleSourceMaterial(sourceKey) {
    setSelectedSourceKey((currentKey) =>
      currentKey === sourceKey ? null : sourceKey
    );
  }

  function selectJob(job) {
    setSelectedJob(job);
    setSelectedRecipeType("standard");
    setSelectedRecipeId(null);
    setSelectedIngredient(null);
    setSelectedSourceKey(null);
    setSearch("");
  }

  function selectLevelRange(levelRange) {
    setSelectedLevelRange(levelRange);
    setSelectedRecipeType("standard");
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
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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

                {copyStatus && <p className="copy-status">{copyStatus}</p>}

                <div className="raw-breakdown no-top-border">
                  <div className="material-list">
                    {shoppingMaterialRows.map(([materialName, quantity]) => (
                      <ExpandableMaterialRow
                        key={materialName}
                        materialName={materialName}
                        quantity={quantity}
                        sourceKey={`grand-${slugifyItemName(materialName)}`}
                        selectedSourceKey={selectedSourceKey}
                        onToggle={toggleSourceMaterial}
                      />
                    ))}
                  </div>
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