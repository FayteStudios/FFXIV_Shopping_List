import carpenter from "./carpenter.json";
import blacksmith from "./blacksmith.json";
import armorer from "./armorer.json";
import goldsmith from "./goldsmith.json";
import leatherworker from "./leatherworker.json";
import weaver from "./weaver.json";
import alchemist from "./alchemist.json";
import culinarian from "./culinarian.json";

const recipes = {
  ...carpenter,
  ...blacksmith,
  ...armorer,
  ...goldsmith,
  ...leatherworker,
  ...weaver,
  ...alchemist,
  ...culinarian,
};

export default recipes;