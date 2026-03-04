import { NodeType } from "../types";
import { getNodeRegistration } from "./nodeRegistry";

export function getDefaultNodeData(type: NodeType): Record<string, any> {
  const reg = getNodeRegistration(type);
  if (!reg) {
    return {};
  }
  return reg.defaultData();
}
