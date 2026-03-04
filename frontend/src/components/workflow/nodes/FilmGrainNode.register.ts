import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import FilmGrainNode from "./FilmGrainNode";

registerNode({
  type: NodeType.FilmGrain,
  component: FilmGrainNode,
  defaultData: () => ({
    intensity: 50,
    size: 1,
    shadows: 30,
    highlights: 30,
    midtonesBias: 80,
    label: "Film Grain",
    outputs: {},
  }),
});
