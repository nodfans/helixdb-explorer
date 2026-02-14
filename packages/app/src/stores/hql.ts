import { createStore } from "solid-js/store";

export interface HqlTab {
  id: string;
  name: string;
  code: string;
  output: string;
  rawOutput: any;
  status: "idle" | "loading" | "success" | "error";
  queryStatus: "idle" | "loading" | "success" | "error";
  syncStatus: "idle" | "loading" | "success" | "error";
  executionTime?: number;
  diagnostics?: any[];
  viewMode?: "table" | "json" | "log";
  logs?: string;
  tableData?: any[];
  multiTableData?: Record<string, any[]>;
  selectedRows?: any[];
}

export interface HqlState {
  tabs: HqlTab[];
  activeTabId: string;
  schema: any | null;
}

const defaultTab: HqlTab = {
  id: "default",
  name: "Query 1",
  code: "",
  output: "",
  rawOutput: null,
  status: "idle",
  queryStatus: "idle",
  syncStatus: "idle",
  diagnostics: [],
  viewMode: "table",
  logs: "",
  tableData: [],
  selectedRows: [],
};

const [hqlStore, setHqlStore] = createStore<HqlState>({
  tabs: [defaultTab],
  activeTabId: "default",
  schema: null,
});

export { hqlStore, setHqlStore };
