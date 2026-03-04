import { NodeType } from "../types";
import { ComponentType } from "react";

export interface NodeRegistration {
  type: NodeType;
  component: ComponentType<any> | null;
  defaultData: () => Record<string, any>;
}

const registry = new Map<NodeType, NodeRegistration>();

export function registerNode(reg: NodeRegistration): void {
  registry.set(reg.type, reg);
}

export function getNodeRegistration(
  type: NodeType,
): NodeRegistration | undefined {
  return registry.get(type);
}

export function getAllRegistrations(): Map<NodeType, NodeRegistration> {
  return registry;
}
