import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import StickyNoteNode from "./StickyNoteNode";

registerNode({
  type: NodeType.StickyNote,
  component: StickyNoteNode,
  defaultData: () => ({
    label: "Sticky Note",
    content: "Enter your note here...",
    color: "yellow",
  }),
});
