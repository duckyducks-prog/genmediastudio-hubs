import React from "react";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import NodeErrorFallback from "../nodes/NodeErrorFallback";

/**
 * Wraps a React Flow node component with an error boundary.
 * If the node crashes, the fallback preserves Handle elements so edges stay connected.
 */
export function withNodeErrorBoundary(
  NodeComponent: React.ComponentType<any>,
  nodeType: string,
) {
  const WrappedNode = (props: any) => (
    <SectionErrorBoundary
      sectionName={nodeType}
      fallback={<NodeErrorFallback nodeType={nodeType} />}
    >
      <NodeComponent {...props} />
    </SectionErrorBoundary>
  );
  WrappedNode.displayName = `Guarded(${nodeType})`;
  return WrappedNode;
}
