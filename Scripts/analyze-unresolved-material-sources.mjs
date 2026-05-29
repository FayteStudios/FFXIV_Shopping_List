import fs from "node:fs/promises";
import path from "node:path";

const INPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishing.unresolved-report.json"
);

const OUTPUT_PATH = path.resolve(
  "src/data/materialSources.withDropsShopsLootSpecialAndFishing.unresolved-categories.json"
);

const CATEGORY_RULES = [
  {
    key: "skybuilders_or_diadem",
    label: "Skybuilders / Diadem / Ishgard Restoration",
    patterns: [
      /skybuilders?/i,
      /diadem/i,
      /approved grade/i,
      /artisanal skybuilders/i,
    ],
  },
  {
    key: "flowerpot_or_housing_flowers",
    label: "Flowerpot / Housing Flowers",
    patterns: [
      /arums?/i,
      /brightlilies/i,
      /byregotia/i,
      /campanulas/i,
      /carnations/i,
      /cattleyas/i,
      /champa/i,
      /cherry blossoms/i,
      /chrysanthemums/i,
      /cornflowers/i,
      /cosmos/i,
      /dahlias/i,
      /daisies/i,
      /hyacinths/i,
      /hydrangeas/i,
      /lilies of the valley/i,
      /lupins/i,
      /morning glories/i,
      /moth orchids/i,
      /oldroses/i,
      /paperflowers/i,
      /sunflowers/i,
      /sweet peas/i,
      /tea flowers/i,
      /triteleia/i,
      /tulips/i,
      /violas/i,
    ],
  },
  {
    key: "project_collectible_materials",
    label: "Project / Quest / Custom Delivery Materials",
    patterns: [
      /component materials/i,
      /supply materials/i,
      /repair kit materials/i,
      /souvenir/i,
      /materials$/i,
      /automaton/i,
      /airship/i,
      /submersible/i,
      /aetheroconductive/i,
      /aetheric shielding/i,
    ],
  },
  {
    key: "crafted_intermediates",
    label: "Crafted Intermediates",
    patterns: [
      /ingot$/i,
      /nugget$/i,
      /lumber$/i,
      /leather$/i,
      /cloth$/i,
      /yarn$/i,
      /thread$/i,
      /plate$/i,
      /whetstone$/i,
      /glue$/i,
      /oil$/i,
      /silk$/i,
      /velvet$/i,
      /velveteen$/i,
      /serge$/i,
      /charcoal$/i,
      /wax$/i,
      /candle$/i,
      /soup$/i,
      /sugar$/i,
      /cube$/i,
      /tile$/i,
      /flour$/i,
      /butter$/i,
      /cheese$/i,
      /juice$/i,
    ],
  },
  {
    key: "fish_or_ocean_items",
    label: "Fish / Fishing / Ocean Items",
    patterns: [
      /fish/i,
      /tuna/i,
      /bream/i,
      /eel/i,
      /sole/i,
      /loach/i,
      /oyster/i,
      /salmon/i,
      /shrimp/i,
      /coral/i,
      /crab/i,
      /blowfish/i,
      /bass/i,
      /carp/i,
      /cod/i,
      /herring/i,
      /mackerel/i,
      /trout/i,
      /sardine/i,
      /squid/i,
      /octopus/i,
      /clam/i,
      /mussel/i,
      /aetherlouse/i,
    ],
  },
  {
    key: "raid_trial_dungeon_or_special_loot",
    label: "Raid / Trial / Dungeon / Special Loot",
    patterns: [
      /allagan/i,
      /alexander/i,
      /alexandrian/i,
      /bismarck/i,
      /whorl/i,
      /revelry/i,
      /blissful/i,
      /behemoth/i,
      /atomos/i,
      /unmaking/i,
      /demimateria/i,
      /aetherstone/i,
      /exoplating/i,
      /plating/i,
      /catalyst/i,
      /shroud/i,
      /baleen/i,
      /barb/i,
      /blade/i,
    ],
  },
  {
    key: "gardening_or_seeds",
    label: "Gardening / Seeds / Growable Items",
    patterns: [
      /seed/i,
      /sapling/i,
      /melon/i,
      /rose/i,
      /blood pepper/i,
      /azeyma rose/i,
      /plant/i,
    ],
  },
  {
    key: "food_or_vendor_likely",
    label: "Food / Vendor-Likely Items",
    patterns: [
      /milk/i,
      /cheese/i,
      /baguette/i,
      /bouillon/i,
      /soup/i,
      /sugar/i,
      /butter/i,
      /flour/i,
      /salt/i,
      /pepper/i,
      /tea/i,
      /coffee/i,
      /juice/i,
      /fruit/i,
    ],
  },
];

function matchCategory(name) {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(name))) {
      return {
        key: rule.key,
        label: rule.label,
      };
    }
  }

  return {
    key: "uncategorized",
    label: "Uncategorized",
  };
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function summarizeCategories(unresolved) {
  const categories = {};

  for (const [materialKey, material] of Object.entries(unresolved)) {
    const category = matchCategory(material.name);

    if (!categories[category.key]) {
      categories[category.key] = {
        label: category.label,
        count: 0,
        statusCounts: {},
        examples: [],
        items: {},
      };
    }

    const bucket = categories[category.key];

    bucket.count += 1;
    bucket.statusCounts[material.status] =
      (bucket.statusCounts[material.status] ?? 0) + 1;

    if (bucket.examples.length < 25) {
      bucket.examples.push({
        key: materialKey,
        name: material.name,
        itemId: material.itemId ?? null,
        status: material.status,
      });
    }

    bucket.items[materialKey] = material;
  }

  return Object.fromEntries(
    Object.entries(categories).sort(([, left], [, right]) => right.count - left.count)
  );
}

async function main() {
  const report = await readJson(INPUT_PATH);
  const unresolved = report.unresolved ?? {};

  const categories = summarizeCategories(unresolved);

  const output = {
    metadata: {
      sourceFile:
        "materialSources.withDropsShopsLootSpecialAndFishing.unresolved-report.json",
      totalMaterials: report.metadata?.totalMaterials ?? null,
      unresolvedCount: Object.keys(unresolved).length,
      fishingAdditionCount: report.metadata?.fishingAdditionCount ?? null,
      note: "Heuristic category report for deciding which source type to implement next after gathering, monster drops, shops, loot, special-category sources, and fishing.",
    },
    originalStatusCounts: report.statusCounts,
    categorySummary: Object.fromEntries(
      Object.entries(categories).map(([key, value]) => [
        key,
        {
          label: value.label,
          count: value.count,
          statusCounts: value.statusCounts,
          examples: value.examples,
        },
      ])
    ),
    categories,
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log("");
  console.log(`Read ${INPUT_PATH}`);
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log("");
  console.log("Unresolved category summary:");

  for (const [key, category] of Object.entries(output.categorySummary)) {
    console.log(`  ${key}: ${category.count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});