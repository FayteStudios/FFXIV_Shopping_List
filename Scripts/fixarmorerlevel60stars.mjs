// scripts/fixArmorerLevel60Stars.mjs
import fs from "fs";
import path from "path";

const TARGET_FILE = path.resolve("src/data/recipes/armorer.json");

const recipes = JSON.parse(fs.readFileSync(TARGET_FILE, "utf8"));

let fixed = 0;

for (const recipe of Object.values(recipes)) {
  if (recipe.job !== "Armorer" || recipe.level !== 60) continue;

  if ([2, 4, 6, 8].includes(recipe.stars)) {
    recipe.stars = recipe.stars / 2;
    fixed++;
  }
}

fs.writeFileSync(TARGET_FILE, JSON.stringify(recipes, null, 2) + "\n");

console.log(`Fixed ${fixed} Armorer level 60 star values.`);