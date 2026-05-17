import { Handle, useEdges, useNodeId } from 'reactflow';
import type { ComponentProps } from 'react';

type ConnectedHandleProps = ComponentProps<typeof Handle> & {
  'data-connector-type'?: string;
};

export function ConnectedHandle({ id, type, className, ...props }: ConnectedHandleProps) {
  const nodeId = useNodeId();
  const edges = useEdges();

  const isConnected = edges.some((edge) => {
    if (type === 'target') {
      return edge.target === nodeId && (!id || edge.targetHandle === id);
    }
    return edge.source === nodeId && (!id || edge.sourceHandle === id);
  });

  const cleanedClassName = (className ?? '')
    .split(' ')
    .filter((cls: string) => cls !== '!border-background')
    .join(' ');

  return (
    <Handle
      id={id}
      type={type}
      className={cleanedClassName}
      data-connected={isConnected ? 'true' : 'false'}
      {...props}
    />
  );
}
