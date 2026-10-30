import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
const require = createRequire(import.meta.url);
const AirportGraph = require("../public/airport-map/graph.js");
describe("reachable facility ordering", () => {
  const graph = new AirportGraph({nodes:[[1,0,0,1,1],[2,0,0,1,1],[3,0,0,1,1],[4,0,0,1,1],[5,0,0,2,1],[6,0,0,1,3]],edges:[[1,2,100],[1,3,30],[1,5,1],[1,6,1],[6,4,1]]});
  it("orders facilities by corridor distance, excluding unreachable and foreign-terminal nodes", () => {
    expect(graph.rank(1,[{id:"far",node:2},{id:"near",node:3},{id:"other",node:5},{id:"stairs",node:4}],1)).toEqual([{id:"near",distance:30},{id:"far",distance:100}]);
  });
  it("does not guess a ranking when the starting node is not in the building", () => {
    expect(graph.rank(5,[{id:"near",node:3}],1)).toEqual([]);
  });
});
