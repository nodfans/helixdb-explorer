import { createStore } from "solid-js/store";
import { EndpointConfig } from "../lib/types";

export type QueryState = {
  params: Record<string, any>;
  result: string | null;
  rawResult: any;
  error: unknown | null;
  viewMode: "json" | "table";
};

export const queryStateCache = new Map<string, QueryState>();

const deepClone = <T>(v: T): T => (v ? JSON.parse(JSON.stringify(v)) : v);

export interface WorkbenchState {
  endpoints: EndpointConfig[];
  selectedEndpoint: EndpointConfig | null;
  params: Record<string, any>;
  result: string | null;
  rawResult: any;
  error: unknown | null;
  viewMode: "json" | "table";
  searchQuery: string;
  resultSearchQuery: string;
  showParamsSidebar: boolean;
  sidebarWidth: number;
  rightSidebarWidth: number;
  loading: boolean;
}

const createInitialWorkbenchState = (): WorkbenchState => ({
  endpoints: [],
  selectedEndpoint: null,
  params: {},
  result: null,
  rawResult: null,
  error: null,
  viewMode: "table",
  searchQuery: "",
  resultSearchQuery: "",
  showParamsSidebar: false,
  sidebarWidth: 220,
  rightSidebarWidth: 220,
  loading: false,
});

const [workbenchState, setWorkbenchState] = createStore<WorkbenchState>(createInitialWorkbenchState());

export type WorkbenchResetScope = "workspace" | "view";

export function resetWorkbenchState(scope: WorkbenchResetScope = "workspace") {
  if (scope === "view") {
    setWorkbenchState({
      resultSearchQuery: "",
      showParamsSidebar: false,
      error: null,
      loading: false,
    });
    return;
  }

  const current = workbenchState;
  const initial = createInitialWorkbenchState();
  setWorkbenchState({
    ...initial,
    // Preserve layout/search preferences for better UX continuity.
    sidebarWidth: current.sidebarWidth,
    rightSidebarWidth: current.rightSidebarWidth,
    searchQuery: current.searchQuery,
  });
  queryStateCache.clear();
}

export function activateWorkbenchEndpoint(endpoint: EndpointConfig) {
  const current = workbenchState.selectedEndpoint;
  if (current) {
    queryStateCache.set(current.id, {
      params: deepClone(workbenchState.params),
      result: workbenchState.result,
      rawResult: deepClone(workbenchState.rawResult),
      error: workbenchState.error,
      viewMode: workbenchState.viewMode,
    });
  }

  setWorkbenchState("selectedEndpoint", deepClone(endpoint));
  setWorkbenchState("showParamsSidebar", endpoint.params && endpoint.params.length > 0);

  const cached = queryStateCache.get(endpoint.id);
  if (cached) {
    setWorkbenchState("params", deepClone(cached.params));
    setWorkbenchState("result", cached.result);
    setWorkbenchState("rawResult", deepClone(cached.rawResult));
    setWorkbenchState("error", cached.error);
    setWorkbenchState("viewMode", cached.viewMode);
    return;
  }

  const initialParams: Record<string, any> = {};
  endpoint.params.forEach((p) => {
    initialParams[p.name] = p.param_type.toLowerCase().includes("bool") ? false : "";
  });
  setWorkbenchState("params", initialParams);
  setWorkbenchState("result", null);
  setWorkbenchState("rawResult", null);
  setWorkbenchState("error", null);
}

export { workbenchState, setWorkbenchState };
