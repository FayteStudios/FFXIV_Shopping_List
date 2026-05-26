import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  PackageSearch,
  ScrollText,
  ShoppingBasket,
} from "lucide-react";
import "./App.css";
import recipes from "./data/recipes/index.js";
import icons from "./data/icons.json";
import {
  calculateCraftingListRawMaterials,
  calculateRawMaterials,
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

const ELEMENT_ORDER = ["Fire", "Ice", "Wind", "Earth", "Lightning", "Water"];
const CATALYST_TYPE_ORDER = ["Shard", "Crystal", "Cluster"];

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

function recipeMatchesSearch(recipeName, search) {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return recipeName.toLowerCase().includes(query);
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
  return Object.keys(recipes)
    .filter((recipeId) => {
      const recipe = recipes[recipeId];

      return (
        recipeMatchesJob(recipe, selectedJob) &&
        recipeMatchesLevelRange(recipe, selectedLevelRange) &&
        recipeMatchesSearch(recipe.name, search) &&
        recipeMatchesTypeFilter(recipe, selectedRecipeType)
      );
    })
    .sort((a, b) => {
      const recipeA = recipes[a];
      const recipeB = recipes[b];

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

function App() {
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState("Carpenter");
  const [selectedLevelRange, setSelectedLevelRange] = useState(LEVEL_RANGES[0]);
  const [selectedRecipeType, setSelectedRecipeType] = useState("standard");
  const [selectedRecipeId, setSelectedRecipeId] = useState(null);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [craftingList, setCraftingList] = useState(() => loadCraftingList());
  const [copyStatus, setCopyStatus] = useState("");

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

  const rawMaterialTotals = selectedRecipeId
    ? calculateRawMaterials(RECIPES, selectedRecipeId)
    : {};

  const craftingListRawTotals = calculateCraftingListRawMaterials(
    RECIPES,
    craftingList
  );

  const expandedRecipe =
    selectedIngredient?.type === "recipe"
      ? findBestRecipeForItem(RECIPES, selectedIngredient.name, mainRecipe?.job)
      : null;

  function selectJob(job) {
    setSelectedJob(job);
    setSelectedRecipeType("standard");
    setSelectedRecipeId(null);
    setSelectedIngredient(null);
    setSearch("");
  }

  function selectLevelRange(levelRange) {
    setSelectedLevelRange(levelRange);
    setSelectedRecipeType("standard");
    setSelectedRecipeId(null);
    setSelectedIngredient(null);
  }

  function selectRecipeType(recipeType) {
    setSelectedRecipeType(recipeType);
    setSelectedRecipeId(null);
    setSelectedIngredient(null);
  }

  function selectRecipe(recipeId) {
    setSelectedRecipeId(recipeId);
    setSelectedIngredient(null);
  }

  function selectIngredient(ingredient) {
    const normalizedIngredient = normalizeIngredientType(RECIPES, ingredient);
    setSelectedIngredient(normalizedIngredient);
  }

  function isRecipeInCraftingList(recipeId) {
    return craftingList.some((entry) => entry.recipeId === recipeId);
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
  }

  function buildShoppingListText() {
    const materialRows = sortShoppingMaterials(
      Object.entries(craftingListRawTotals)
    );

    if (materialRows.length === 0) {
      return "FFXIV Crafting Shopping List\n\nNo materials needed.";
    }

    const lines = materialRows.map(
      ([materialName, quantity]) => `${materialName} x${quantity}`
    );

    return ["FFXIV Crafting Shopping List", "", ...lines].join("\n");
  }

  async function copyShoppingList() {
    const text = buildShoppingListText();

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied shopping list to clipboard.");
    } catch {
      setCopyStatus("Could not copy automatically. Use the text box below.");
    }
  }

  return (
    <main className="app">
      <header className="app-heading">
        <h1>FFXIV Crafting Shopping List</h1>
        <p>
          Browse recipes by crafting class and level range, then build a
          personal crafting list.
        </p>
      </header>

      <div className="crafting-filters">
        <nav className="job-tabs" aria-label="Crafting classes">
          {CRAFTING_JOBS.map((job) => (
            <button
              key={job}
              className={selectedJob === job ? "job-tab active" : "job-tab"}
              onClick={() => selectJob(job)}
            >
              {job}
            </button>
          ))}
        </nav>

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
              >
                {levelRange.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="columns five-columns">
        <div className="panel">
          <h2>
            <BookOpen className="panel-icon" />
            1) Crafting Log
          </h2>

          <input
            className="search panel-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search visible recipes..."
          />

          <div className="quick-filter-group" aria-label="Recipe type filters">
            {RECIPE_TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                className={
                  selectedRecipeType === filter.value
                    ? "quick-filter-button active"
                    : "quick-filter-button"
                }
                onClick={() => selectRecipeType(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <p className="filtered-summary">
            Showing {recipeIds.length} {selectedJob} recipes in levels{" "}
            {selectedLevelRange.label}.
          </p>

          {recipeIds.length > 0 && (
            <button
              className="secondary-wide-button"
              onClick={addVisibleRecipesToList}
            >
              Add All Visible Recipes
            </button>
          )}

          <div className="list">
            {recipeIds.length === 0 && (
              <div className="empty small-empty">
                No recipes match this class, range, and filter.
              </div>
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
                      ? "card active recipe-list-card"
                      : "card recipe-list-card"
                  }
                >
                  <button
                    className="recipe-select-button"
                    onClick={() => selectRecipe(recipeId)}
                  >
                    <ItemIcon recipe={recipe} />

                    <span className="recipe-card-text">
                      <strong>
                        {recipe.name}
                        {getStarLabel(recipe.stars)}
                      </strong>
                      <span>
                        Lv. {recipe.level}
                        {getStarLabel(recipe.stars)} | {recipe.job}
                        {recipe.category ? ` | ${recipe.category}` : ""}
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
                  >
                    {inCraftingList ? "✓" : "+"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
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
            <button className="primary-button" onClick={addSelectedRecipeToList}>
              Add Selected Recipe to Crafting List
            </button>
          )}

          <div className="list">
            {!mainRecipe && (
              <div className="empty">
                Select a recipe from the Crafting Log to view its ingredients.
              </div>
            )}

            {mainRecipe?.ingredients.map((ingredient) => {
              const craftable = isCraftable(RECIPES, ingredient.name);
              const type = craftable ? "recipe" : "material";
              const active = selectedIngredient?.name === ingredient.name;

              return (
                <button
                  key={`${ingredient.name}-${ingredient.quantity}`}
                  className={active ? "card active" : "card"}
                  onClick={() => selectIngredient({ ...ingredient, type })}
                >
                  <div className="card-row">
                    <span className="item-title-row">
                      <ItemIcon name={ingredient.name} />
                      <strong>{ingredient.name}</strong>
                    </span>

                    <span
                      className={type === "recipe" ? "badge recipe" : "badge"}
                    >
                      {type}
                    </span>
                  </div>
                  <span>Quantity needed: {ingredient.quantity}</span>
                </button>
              );
            })}
          </div>

          {mainRecipe && (
            <div className="raw-breakdown">
              <h3>Raw Material Total</h3>

              {sortShoppingMaterials(Object.entries(rawMaterialTotals)).map(
                ([materialName, quantity]) => (
                  <div key={materialName} className="raw-row">
                    <span className="item-title-row">
                      <ItemIcon name={materialName} small />
                      <span>{materialName}</span>
                    </span>
                    <strong>{quantity}</strong>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>
            <PackageSearch className="panel-icon" />
            3) Recipe-as-Material
          </h2>

          <p className="panel-subtitle">
            Select a craftable ingredient from column two.
          </p>

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

                <span>Needed by main recipe: {selectedIngredient.quantity}</span>
                <span>
                  Lv. {expandedRecipe.level}
                  {getStarLabel(expandedRecipe.stars)} | {expandedRecipe.job}
                </span>
              </div>

              <div className="list">
                {expandedRecipe.ingredients.map((ingredient) => {
                  const craftable = isCraftable(RECIPES, ingredient.name);
                  const type = craftable ? "recipe" : "material";

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

                        <span
                          className={
                            type === "recipe" ? "badge recipe" : "badge"
                          }
                        >
                          {type}
                        </span>
                      </div>
                      <span>Quantity needed: {ingredient.quantity}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h2>
            <ClipboardList className="panel-icon" />
            4) Crafting List
          </h2>

          <p className="panel-subtitle">
            Recipes you plan to complete. Saved locally in this browser.
          </p>

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
                        >
                          -
                        </button>

                        <button
                          className="small-button"
                          onClick={() =>
                            increaseCraftingListQuantity(entry.recipeId)
                          }
                        >
                          +
                        </button>

                        <button
                          className="complete-button"
                          onClick={() =>
                            completeCraftingListItem(entry.recipeId)
                          }
                        >
                          Complete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button className="danger-button" onClick={clearCraftingList}>
                Clear Crafting List
              </button>
            </>
          )}
        </div>

        <div className="panel">
          <h2>
            <ShoppingBasket className="panel-icon" />
            5) Grand Shopping List
          </h2>

          <p className="panel-subtitle">
            Combined raw materials for every recipe in your Crafting List.
          </p>

          {craftingList.length === 0 && (
            <div className="empty">
              Add recipes to your Crafting List to generate a shopping list.
            </div>
          )}

          {craftingList.length > 0 && (
            <>
              <div className="section-heading-row">
                <h3>Materials Needed</h3>

                <button className="secondary-button" onClick={copyShoppingList}>
                  Copy List
                </button>
              </div>

              {copyStatus && <p className="copy-status">{copyStatus}</p>}

              <div className="raw-breakdown no-top-border">
                {sortShoppingMaterials(
                  Object.entries(craftingListRawTotals)
                ).map(([materialName, quantity]) => (
                  <div key={materialName} className="raw-row">
                    <span className="item-title-row">
                      <ItemIcon name={materialName} small />
                      <span>{materialName}</span>
                    </span>

                    <strong>{quantity}</strong>
                  </div>
                ))}
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