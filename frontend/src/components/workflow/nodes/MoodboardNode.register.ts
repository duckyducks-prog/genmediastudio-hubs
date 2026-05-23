import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import MoodboardNode from "./MoodboardNode";

registerNode({
  type: NodeType.Moodboard,
  component: MoodboardNode,
  defaultData: () => ({
    label: "Moodboard",
    images: [],
    imageRefs: [],
  }),
});
