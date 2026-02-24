import { createStore } from "solid-js/store";
import { EndpointConfig } from "../lib/types";

export type QueryState = {
  params: Record<string, any>;
  result: string | null;
  rawResult: any;
  error: string | null;
  viewMode: "json" | "table";
};

export const queryStateCache = new Map<string, QueryState>();

export interface WorkbenchState {
  endpoints: EndpointConfig[];
  selectedEndpoint: EndpointConfig | null;
  params: Record<string, any>;
  result: string | null;
  rawResult: any;
  error: string | null;
  viewMode: "json" | "table";
  searchQuery: string;
  resultSearchQuery: string;
  showParamsSidebar: boolean;
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
  resultSearchQuery: "",
  showParamsSidebar: false,
  sidebarWidth: 220,
  rightSidebarWidth: 220,
  loading: false,
});

export { workbenchState, setWorkbenchState };
