import json
import re
from pathlib import Path
from collections import defaultdict

INPUT_FILE = Path("src/data/recipes.json")
OUTPUT_DIR = Path("src/data/recipes")

JOB_TO_FILENAME = {
    "Carpenter": "carpenter.json",
    "Blacksmith": "blacksmith.json",
    "Armorer": "armorer.json",
    "Goldsmith": "goldsmith.json",
    "Leatherworker": "leatherworker.json",
    "Weaver": "weaver.json",
    "Alchemist": "alchemist.json",
    "Culinarian": "culinarian.json",
}

def to_js_import_name(job_name):
    return re.sub(r"[^a-zA-Z0-9]", "", job_name[:1].lower() + job_name[1:])

def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(f"Could not find {INPUT_FILE}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with INPUT_FILE.open("r", encoding="utf-8") as file:
        recipes = json.load(file)

    grouped = defaultdict(dict)
    unknown_job_recipes = {}

    for recipe_id, recipe in recipes.items():
        job = recipe.get("job")

        if job in JOB_TO_FILENAME:
            grouped[job][recipe_id] = recipe
        else:
            unknown_job_recipes[recipe_id] = recipe

    for job, filename in JOB_TO_FILENAME.items():
        output_path = OUTPUT_DIR / filename

        with output_path.open("w", encoding="utf-8") as file:
            json.dump(grouped[job], file, indent=2, ensure_ascii=False)
            file.write("\n")

        print(f"Wrote {len(grouped[job])} {job} recipes to {output_path}")

    if unknown_job_recipes:
        unknown_path = OUTPUT_DIR / "_unknown-job.json"

        with unknown_path.open("w", encoding="utf-8") as file:
            json.dump(unknown_job_recipes, file, indent=2, ensure_ascii=False)
            file.write("\n")

        print(f"WARNING: Wrote {len(unknown_job_recipes)} recipes with missing/unknown jobs to {unknown_path}")

    index_path = OUTPUT_DIR / "index.js"

    import_lines = []
    merge_lines = []

    for job, filename in JOB_TO_FILENAME.items():
        import_name = to_js_import_name(job)
        import_lines.append(f'import {import_name} from "./{filename}";')
        merge_lines.append(f"  ...{import_name},")

    index_content = "\n".join(import_lines)
    index_content += "\n\n"
    index_content += "const recipes = {\n"
    index_content += "\n".join(merge_lines)
    index_content += "\n};\n\n"
    index_content += "export default recipes;\n"

    index_path.write_text(index_content, encoding="utf-8")
    print(f"Wrote merged recipe index to {index_path}")

if __name__ == "__main__":
    main()