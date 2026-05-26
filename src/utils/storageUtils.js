const CRAFTING_LIST_KEY = "ffxivCraftingList";

export function loadCraftingList() {
  try {
    const savedList = localStorage.getItem(CRAFTING_LIST_KEY);

    if (!savedList) {
      return [];
    }

    const parsedList = JSON.parse(savedList);

    if (!Array.isArray(parsedList)) {
      return [];
    }

    return parsedList.filter((entry) => entry.recipeId && entry.quantity);
  } catch {
    return [];
  }
}

export function saveCraftingList(craftingList) {
  localStorage.setItem(CRAFTING_LIST_KEY, JSON.stringify(craftingList));
}