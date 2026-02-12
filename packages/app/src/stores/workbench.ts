import { createStore } from "solid-js/store";
import { EndpointConfig } from "../lib/types";

export type QueryState = {
  params: Record<string, any>;
  result: string | null;
  rawResult: any;
  error: string | null;
  viewMode: "json" | "table";
};

export interface WorkbenchState {
  endpoints: EndpointConfig[];
  selectedEndpoint: EndpointConfig | null;
  params: Record<string, any>;
  result: string | null;
  rawResult: any;
  error: string | null;
  viewMode: "json" | "table";
  searchQuery: string;
  showParamsSidebar: boolean;
  queryStateCache: Record<string, QueryState>;
  sidebarWidth: number;
  rightSidebarWidth: number;
  loading: boolean;
}

const [workbenchState, setWorkbenchState] = createStore<WorkbenchState>({
  endpoints: [],
  selectedEndpoint: null,
  params: {},
  result: null,
  rawResult: null,
  error: null,
  viewMode: "table",
  searchQuery: "",
  showParamsSidebar: false,
  queryStateCache: {},
  sidebarWidth: 200,
  rightSidebarWidth: 240,
  loading: false,
});

export { workbenchState, setWorkbenchState };
