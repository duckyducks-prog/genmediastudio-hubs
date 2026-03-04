import { registerNode } from "../registry/nodeRegistry";
import { NodeType } from "../types";
import DownloadNode from "./DownloadNode";

registerNode({
  type: NodeType.Download,
  component: DownloadNode,
  defaultData: () => ({
    inputData: null,
    type: "image",
    label: "Download",
  }),
});
