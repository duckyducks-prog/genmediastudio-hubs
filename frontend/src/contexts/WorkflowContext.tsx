import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Node, Edge } from "reactflow";

// Generation mode type
export type GenerationMode = "explore" | "project";

// State shape
export interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  isDirty: boolean;
  lastSaved: Date | null;
  mode: GenerationMode;
}

// Actions
export type WorkflowAction =
  | { type: "SET_NODES"; payload: Node[] }
  | { type: "UPDATE_NODES_WITH_FUNCTION"; payload: (nodes: Node[]) => Node[] }
  | { type: "SET_EDGES"; payload: Edge[] }
  | { type: "UPDATE_EDGES_WITH_FUNCTION"; payload: (edges: Edge[]) => Edge[] }
  | { type: "SET_VIEWPORT"; payload: { x: number; y: number; zoom: number } }
  | { type: "UPDATE_NODE"; payload: { id: string; data: any } }
  | { type: "ADD_NODE"; payload: Node }
  | { type: "REMOVE_NODE"; payload: string }
  | { type: "ADD_EDGE"; payload: Edge }
  | { type: "REMOVE_EDGE"; payload: string }
  | { type: "CLEAR_WORKFLOW" }
  | { type: "LOAD_WORKFLOW"; payload: WorkflowState }
  | { type: "MARK_SAVED" }
  | { type: "SET_MODE"; payload: GenerationMode };

// Initial state
const initialState: WorkflowState = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  isDirty: false,
  lastSaved: null,
  mode: "explore",
};

// Reducer
function workflowReducer(
  state: WorkflowState,
  action: WorkflowAction,
): WorkflowState {
  switch (action.type) {
    case "SET_NODES":
      return { ...state, nodes: action.payload, isDirty: true };

    case "UPDATE_NODES_WITH_FUNCTION":
      return { ...state, nodes: action.payload(state.nodes), isDirty: true };

    case "SET_EDGES":
      return { ...state, edges: action.payload, isDirty: true };

    case "UPDATE_EDGES_WITH_FUNCTION":
      return { ...state, edges: action.payload(state.edges), isDirty: true };

    case "SET_VIEWPORT":
      return { ...state, viewport: action.payload };

    case "UPDATE_NODE":
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === action.payload.id
            ? { ...node, data: { ...node.data, ...action.payload.data } }
            : node,
        ),
        isDirty: true,
      };

    case "ADD_NODE":
      return {
        ...state,
        nodes: [...state.nodes, action.payload],
        isDirty: true,
      };

    case "REMOVE_NODE":
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.payload),
        edges: state.edges.filter(
          (e) => e.source !== action.payload && e.target !== action.payload,
        ),
        isDirty: true,
      };

    case "ADD_EDGE":
      return {
        ...state,
        edges: [...state.edges, action.payload],
        isDirty: true,
      };

    case "REMOVE_EDGE":
      return {
        ...state,
        edges: state.edges.filter((e) => e.id !== action.payload),
        isDirty: true,
      };

    case "CLEAR_WORKFLOW":
      return { ...initialState, isDirty: false };

    case "LOAD_WORKFLOW":
      return { ...action.payload, isDirty: false };

    case "MARK_SAVED":
      return { ...state, isDirty: false, lastSaved: new Date() };

    case "SET_MODE":
      return { ...state, mode: action.payload, isDirty: true };

    default:
      return state;
  }
}

// Context
interface WorkflowContextType {
  state: WorkflowState;
  dispatch: React.Dispatch<WorkflowAction>;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

// Storage key
const STORAGE_KEY = "genmedia-workflow-state";

// Provider component
export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, initialState, () => {
    // Initialize from localStorage if available
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...parsed,
            isDirty: false,
            lastSaved: parsed.lastSaved ? new Date(parsed.lastSaved) : null,
            mode: parsed.mode || "explore",
          };
        } catch (e) {
          console.warn("Failed to parse saved workflow:", e);
        }
      }
    }
    return initialState;
  });

  // Auto-save to localStorage on changes (debounced)
  // Note: We strip out large data (outputs, image data) to avoid quota exceeded errors
  useEffect(() => {
    if (!state.isDirty) return;

    const timeout = setTimeout(() => {
      try {
        // Strip out large output data from nodes to avoid localStorage quota issues
        const nodesSafeForStorage = state.nodes.map((node) => {
          const { data, ...nodeRest } = node;
          return {
            ...nodeRest,
            // Only save essential node data, exclude outputs/image data
            data: {
              label: (data as any).label,
              ...(Object.fromEntries(
                Object.entries(data as any).filter(
                  ([key]) =>
                    ![
                      "outputs",
                      "imageUrl",
                      "videoUrl",
                      "image",
                      "video",
                      "imageData",
                      "videoData",
                    ].includes(key),
                ),
              ) as any),
            },
          };
        });

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            nodes: nodesSafeForStorage,
            edges: state.edges,
            viewport: state.viewport,
            mode: state.mode,
            lastSaved: new Date().toISOString(),
          }),
        );
        dispatch({ type: "MARK_SAVED" });
      } catch (error) {
        if (error instanceof Error && error.message.includes("quota")) {
          console.warn(
            "[WorkflowContext] localStorage quota exceeded. Workflow changes were not saved to browser storage, but your current session is not affected.",
          );
          dispatch({ type: "MARK_SAVED" });
        } else {
          console.error("[WorkflowContext] Error saving workflow:", error);
        }
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeout);
  }, [state.nodes, state.edges, state.viewport, state.isDirty]);

  return (
    <WorkflowContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkflowContext.Provider>
  );
}

// Main hook to access context
export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflow must be used within WorkflowProvider");
  }
  return context;
}

// Convenience hook for nodes
export function useWorkflowNodes() {
  const { state, dispatch } = useWorkflow();

  // Create stable setNodes function that reads current state when called
  const setNodes = useCallback(
    (nodes: Node[] | ((prev: Node[]) => Node[])) => {
      // We need to handle both direct values and updater functions
      // For updater functions, we need the current state which we can get via a custom action
      if (typeof nodes === "function") {
        dispatch({ type: "UPDATE_NODES_WITH_FUNCTION", payload: nodes });
      } else {
        dispatch({ type: "SET_NODES", payload: nodes });
      }
    },
    [dispatch], // Only depend on dispatch, which is stable
  );

  return [state.nodes, setNodes] as const;
}

// Convenience hook for edges
export function useWorkflowEdges() {
  const { state, dispatch } = useWorkflow();

  // Create stable setEdges function that reads current state when called
  const setEdges = useCallback(
    (edges: Edge[] | ((prev: Edge[]) => Edge[])) => {
      if (typeof edges === "function") {
        dispatch({ type: "UPDATE_EDGES_WITH_FUNCTION", payload: edges });
      } else {
        dispatch({ type: "SET_EDGES", payload: edges });
      }
    },
    [dispatch], // Only depend on dispatch, which is stable
  );

  return [state.edges, setEdges] as const;
}
