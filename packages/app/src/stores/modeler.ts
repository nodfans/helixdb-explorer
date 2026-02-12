import { createStore } from "solid-js/store";
import { EntityDef, DEFAULT_QUERY_CONFIG, QueryGenerationConfig } from "../lib/codegen";

export interface ModelerState {
  entities: EntityDef[];
  queryConfig: QueryGenerationConfig;
  sidebarWidth: number;
  schemaCode: string;
  queryCode: string;
  isDirty: boolean;
  isCompiling: boolean;
  lastError: string | null;
  activeTab: "schema" | "queries";
}

const [modelerStore, setModelerStore] = createStore<ModelerState>({
  entities: [],
  queryConfig: DEFAULT_QUERY_CONFIG,
  sidebarWidth: 480,
  schemaCode: "",
  queryCode: "",
  isDirty: false,
  isCompiling: false,
  lastError: null,
  activeTab: "schema",
});

export { modelerStore, setModelerStore };
