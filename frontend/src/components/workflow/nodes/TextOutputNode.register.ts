import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import TextOutputNode from "./TextOutputNode";

registerNode({
  type: NodeType.TextOutput,
  component: TextOutputNode,
  defaultData: () => ({
    textContent: "",
    label: "Text Output",
  }),
});
