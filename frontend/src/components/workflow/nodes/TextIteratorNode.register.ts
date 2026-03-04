import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import TextIteratorNode from "./TextIteratorNode";

registerNode({
  type: NodeType.TextIterator,
  component: TextIteratorNode,
  defaultData: () => ({
    fixedSection: "",
    variableItems: [],
    batchInput: "",
    separator: "Newline",
    dynamicOutputCount: 0,
    label: "Text Iterator",
    outputs: {},
  }),
});
