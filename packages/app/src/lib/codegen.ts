import { HQL_TYPES as SHARED_HQL_TYPES, ALL_HQL_KEYWORDS } from "./hql-syntax";

export const HQL_TYPES = SHARED_HQL_TYPES as any as readonly string[];

export type HqlType = (typeof HQL_TYPES)[number];

export interface PropertyDef {
  name: string;
  type: HqlType;
  isUnique?: boolean;
  isIndex?: boolean;
  isArray?: boolean;
  defaultValue?: string;
  description?: string;
}

export interface EntityDef {
  id: string;
  name: string;
  kind: "Node" | "Edge" | "Vector";
  properties: PropertyDef[];
  description?: string;
  vectorDim?: number;
  from?: string;
  to?: string;
  isUniqueRelation?: boolean;
  metadata?: {
    x?: number;
    y?: number;
  };
}

export interface QueryGenerationConfig {
  crud: {
    basic: boolean; // GetN, GetById, GetAll
    mutation: boolean; // AddN, Connect
    upsert: boolean; // UpsertN, UpsertE
    drop: boolean; // Delete/Drop
    pro_control: boolean; // Parameterized Order/Limit
  };
  discovery: {
    keyword_search: boolean; // SearchBM25
    vector_search: boolean; // SearchV
    vector_prefiltering: boolean; // SearchV + PREFILTER
    vector_upsert: boolean; // AddV, UpsertV
    multi_hop: boolean; // Friends of Friends
    mutual_connections: boolean; // Mutual friends
  };
  intelligence: {
    rich_detail: boolean; // Object hydration with edge counts
  };
  pathfinding: {
    bfs: boolean; // ShortestPath
    dijkstra: boolean; // Dijkstra
  };
  analytics: {
    aggregation: boolean; // Sum, Avg, Min, Max
    grouping: boolean; // AggregateBy/GroupBy
  };
}

export const DEFAULT_QUERY_CONFIG: QueryGenerationConfig = {
  crud: {
    basic: true,
    mutation: true,
    upsert: true,
    drop: true,
    pro_control: true,
  },
  discovery: {
    keyword_search: true,
    vector_search: true,
    vector_prefiltering: true,
    vector_upsert: true,
    multi_hop: true,
    mutual_connections: false,
  },
  intelligence: {
    rich_detail: true,
  },
  pathfinding: {
    bfs: false,
    dijkstra: false,
  },
  analytics: {
    aggregation: true,
    grouping: true,
  },
};

export interface Diagnostic {
  entityId: string;
  propertyIndex?: number;
  message: string;
  level: "error" | "warning" | "info";
  fixSuggestion?: string;
}

const RESERVED_TYPE_NAMES = ALL_HQL_KEYWORDS;

const NODE_RESERVED_FIELDS = ["id", "label", "type", "version"];
const EDGE_RESERVED_FIELDS = ["id", "label", "to_node", "from_node", "type", "version"];
const VEC_RESERVED_FIELDS = ["id", "label", "data", "score", "type", "version"];

// --- HQL DSL BUILDER CORE ---

/**
 * Represents a piece of HQL (Expression, Step, Source, or Query)
 */
abstract class HqlComponent {
  abstract toString(indent?: string): string;
}

/**
 * Handles property access, literals, and logical expressions
 */
class HqlExpr extends HqlComponent {
  constructor(private content: string) {
    super();
  }

  static prop(name: string) {
    return new HqlExpr(`_::{${name}}`);
  }
  static id() {
    return new HqlExpr("_::ID");
  }
  static wrap(content: string) {
    return new HqlExpr(content);
  }

  static lit(val: any, type: HqlType): HqlExpr {
    if (val === "NOW" && type === "Date") return new HqlExpr("NOW");
    if (type === "String" || (type === "Date" && val !== "NOW")) {
      return new HqlExpr(`"${val}"`);
    }
    if (type === "Boolean") return new HqlExpr(String(val).toUpperCase());
    if (Array.isArray(val)) return new HqlExpr(`[${val.join(", ")}]`);
    return new HqlExpr(String(val));
  }

  op(name: string, ...args: (HqlExpr | string | number)[]): HqlExpr {
    const formattedArgs = args.map((a) => (a instanceof HqlExpr ? a.toString() : String(a)));
    return new HqlExpr(`${this.content}::${name}(${formattedArgs.join(", ")})`);
  }

  gOp(name: string, typeParam: string, ...args: (HqlExpr | string | number)[]): HqlExpr {
    const formattedArgs = args.map((a) => (a instanceof HqlExpr ? a.toString() : String(a)));
    let s = `${this.content}::${name}<${typeParam}>`;
    if (formattedArgs.length > 0) s += `(${formattedArgs.join(", ")})`;
    return new HqlExpr(s);
  }

  add(suffix: string): HqlExpr {
    return new HqlExpr(`${this.content}${suffix}`);
  }

  toString() {
    return this.content;
  }
}

/**
 * Represents an HQL Step (e.g., ::WHERE, ::ORDER)
 */
class HqlStep extends HqlComponent {
  constructor(
    public name: string,
    public typeParam?: string,
    public args: (HqlExpr | string | number)[] = []
  ) {
    super();
  }

  toString() {
    let s = `::${this.name}`;
    if (this.typeParam) s += `<${this.typeParam}>`;
    if (this.args.length > 0) {
      const formattedArgs = this.args.map((a) => (a instanceof HqlExpr ? a.toString() : String(a)));
      s += `(${formattedArgs.join(", ")})`;
    }
    return s;
  }
}

/**
 * Represents an HQL Projection block { key: val, ... }
 */
class HqlProjection extends HqlComponent {
  constructor(private fields: Record<string, string | HqlExpr>) {
    super();
  }

  toString(indent: string = ""): string {
    const lines = Object.entries(this.fields).map(([k, v]) => {
      const val = v instanceof HqlExpr ? v.toString() : String(v);
      return `${indent}    ${k}: ${val}`;
    });
    return `{\n${lines.join(",\n")}\n${indent}}`;
  }
}

/**
 * Represents an HQL Source (e.g., N<User>, SearchV<Doc>)
 */
class HqlSource extends HqlComponent {
  private steps: (HqlStep | HqlProjection)[] = [];

  constructor(
    public name: string,
    public typeParam?: string,
    public args: (HqlExpr | string | number)[] = []
  ) {
    super();
  }

  step(name: string, ...args: (HqlExpr | string | number)[]): this {
    this.steps.push(new HqlStep(name, undefined, args));
    return this;
  }

  gStep(name: string, typeParam: string, ...args: (HqlExpr | string | number)[]): this {
    this.steps.push(new HqlStep(name, typeParam, args));
    return this;
  }

  project(fields: Record<string, string | HqlExpr>): this {
    this.steps.push(new HqlProjection(fields));
    return this;
  }

  toString(indent: string = "") {
    let s = this.typeParam ? `${this.name}<${this.typeParam}>` : this.name;
    if (this.args.length > 0) {
      const formattedArgs = this.args.map((a) => (a instanceof HqlExpr ? a.toString() : String(a)));
      s += `(${formattedArgs.join(", ")})`;
    }

    for (const step of this.steps) {
      if (step instanceof HqlStep) {
        s += `\n${indent}    ${step.toString()}`;
      } else if (step instanceof HqlProjection) {
        s += `\n${indent}    ::${step.toString(indent + "    ")}`;
      }
    }
    return s;
  }
}

/**
 * Container for a full HQL Query
 */
class HqlQuery extends HqlComponent {
  private elements: { target?: string; source: HqlSource }[] = [];
  private returnExpr?: string | HqlExpr;

  constructor(
    public name: string,
    public params: { name: string; type: string }[] = []
  ) {
    super();
  }

  assign(target: string, source: HqlSource): this {
    this.elements.push({ target, source });
    return this;
  }

  statement(source: HqlSource): this {
    this.elements.push({ source });
    return this;
  }

  returns(expr: string | HqlExpr): this {
    this.returnExpr = expr;
    return this;
  }

  toString(): string {
    const paramStr = this.params.map((p) => `${p.name}: ${p.type}`).join(", ");
    let s = `QUERY ${this.name}(${paramStr}) =>\n`;

    for (const { target, source } of this.elements) {
      if (target) {
        s += `    ${target} <- ${source.toString("    ")}\n`;
      } else {
        s += `    ${source.toString("    ")}\n`;
      }
    }

    if (this.returnExpr) {
      const ret = this.returnExpr instanceof HqlExpr ? this.returnExpr.toString() : this.returnExpr;
      s += `    RETURN ${ret}`;
    }

    return s;
  }
}

/**
 * Represents an HQL Entity Definition (N::, E::, V::)
 */
class HqlEntityDefBuilder extends HqlComponent {
  constructor(
    public kind: "N" | "E" | "V",
    public name: string,
    public properties: PropertyDef[],
    public options: { from?: string; to?: string; unique?: boolean; description?: string } = {}
  ) {
    super();
  }

  toString(indent: string = ""): string {
    const segments: string[] = [];
    if (this.options.description) {
      segments.push(`${indent}// ${this.options.description}`);
    }

    let header = `${this.kind}::${this.name}`;
    if (this.kind === "E" && this.options.unique) header += " UNIQUE";
    header += " {";
    segments.push(`${indent}${header}`);

    if (this.kind === "E") {
      segments.push(`${indent}    From: ${this.options.from || "Undefined"},`);
      segments.push(`${indent}    To: ${this.options.to || "Undefined"},`);
      segments.push(`${indent}    Properties: {`);
      const fields = this.formatFields(this.properties, indent + "        ");
      if (fields) segments.push(fields);
      segments.push(`${indent}    }`);
    } else {
      const fields = this.formatFields(this.properties, indent + "    ");
      if (fields) segments.push(fields);
    }

    segments.push(`${indent}}`);
    return segments.join("\n");
  }

  private formatFields(props: PropertyDef[], indent: string): string {
    return props
      .filter((p) => p && p.name)
      .map((p) => {
        let lines: string[] = [];
        if (p.description) lines.push(`${indent}// ${p.description}`);

        let line = indent;
        if (p.isUnique) line += "UNIQUE INDEX ";
        else if (p.isIndex) line += "INDEX ";

        const baseType = p.type === "Timestamp" ? "Date" : p.type || "String";
        const finalType = p.isArray ? `[${baseType}]` : baseType;

        line += `${p.name}: ${finalType}`;
        if (p.defaultValue != null) {
          const val = p.type === "String" || (p.type === "Date" && p.defaultValue !== "NOW") ? `"${p.defaultValue}"` : p.defaultValue;
          line += ` DEFAULT ${val}`;
        }
        lines.push(line);
        return lines.join("\n");
      })
      .join(",\n");
  }
}

export class HqlCodeGen {
  /**
   * Generates full HQL schema including automated ID fields
   */
  static generateSchema(entities: EntityDef[]): string {
    if (entities.length === 0) {
      return "";
    }

    return entities
      .filter((e) => e != null)
      .map((entity) => {
        let kind: "N" | "E" | "V" = "N";
        if (entity.kind === "Edge") kind = "E";
        else if (entity.kind === "Vector") kind = "V";

        return new HqlEntityDefBuilder(kind, entity.name, entity.properties || [], {
          from: entity.from,
          to: entity.to,
          unique: entity.isUniqueRelation,
          description: entity.description,
        }).toString();
      })
      .join("\n\n")
      .trim();
  }

  /**
   * Intelligent Query Generation based on Entity Relationships
   */
  static generateQueries(entities: EntityDef[], config: QueryGenerationConfig = DEFAULT_QUERY_CONFIG): string {
    const allEntitiesSegments: string[] = [];

    const queryConfig = config || DEFAULT_QUERY_CONFIG;
    const crud = queryConfig.crud || DEFAULT_QUERY_CONFIG.crud;
    const discovery = queryConfig.discovery || DEFAULT_QUERY_CONFIG.discovery;
    const intelligence = queryConfig.intelligence || DEFAULT_QUERY_CONFIG.intelligence;
    const pathfinding = queryConfig.pathfinding || DEFAULT_QUERY_CONFIG.pathfinding;
    const analytics = queryConfig.analytics || DEFAULT_QUERY_CONFIG.analytics;

    for (const entity of entities) {
      if (!entity) continue;

      const crudSegments: string[] = [];
      const discoverySegments: string[] = [];
      const pathfindingSegments: string[] = [];
      const analyticsSegments: string[] = [];
      const intelligenceSegments: string[] = [];

      // 1. Data Operations (CRUD)
      if (entity.kind === "Node") {
        if (crud.mutation) crudSegments.push(this.buildCreateNodeQuery(entity));
        if (crud.upsert) crudSegments.push(this.buildUpsertNodeQuery(entity));
        if (crud.basic) {
          crudSegments.push(this.buildGetNodeByIdQuery(entity));
          for (const prop of entity.properties || []) {
            if (prop.isUnique) {
              crudSegments.push(this.buildGetNodeByUniqueQuery(entity, prop));
            }
          }
          crudSegments.push(this.buildGetNodeQuery(entity, crud.pro_control));
        }
        if (crud.drop) crudSegments.push(this.buildDeleteNodeQuery(entity));

        // Smart Intelligence Views
        if (intelligence.rich_detail) {
          intelligenceSegments.push(this.buildRichDetailQuery(entity, entities));
        }
      }

      if (entity.kind === "Edge" && entity.from && entity.to) {
        if (crud.mutation) crudSegments.push(this.buildConnectQuery(entity));
        if (crud.upsert) crudSegments.push(this.buildUpsertEdgeQuery(entity));
        if (crud.basic) {
          crudSegments.push(this.buildTraversalQuery(entity));
        }

        // Graph Discovery
        if (discovery.multi_hop) {
          discoverySegments.push(this.buildTwoHopQuery(entity));
        }
        if (discovery.mutual_connections) {
          discoverySegments.push(this.buildMutualConnectionsQuery(entity));
        }
      }

      // 2. Search & Discovery
      if (entity.kind === "Vector" || entity.kind === "Node") {
        if (entity.kind === "Vector") {
          if (discovery.vector_search) {
            discoverySegments.push(this.buildVectorSearchQuery(entity));
            discoverySegments.push(this.buildHybridSearchQuery(entity));
          }

          if (discovery.vector_prefiltering) {
            // Smart: Detect indexed properties to use as PREFILTER candidates
            const filterCandidates = (entity.properties || []).filter((p) => p.isIndex || p.isUnique || p.type === "Boolean");
            for (const p of filterCandidates) {
              discoverySegments.push(this.buildPrefilteredVectorSearchQuery(entity, p));
              discoverySegments.push(this.buildHybridSearchQuery(entity, p));
            }
          }

          if (discovery.vector_upsert) {
            discoverySegments.push(this.buildAddVectorQuery(entity));
            discoverySegments.push(this.buildUpsertVectorQuery(entity));
          }
        }
        if (discovery.keyword_search) {
          const stringProps = (entity.properties || []).filter((p) => p.type === "String");
          if (stringProps.length > 0) {
            discoverySegments.push(this.buildTextSearchQuery(entity));
          }
        }
      }

      // 3. Pathfinding & Traversal
      if (entity.kind === "Edge") {
        if (pathfinding.bfs) pathfindingSegments.push(this.buildShortestPathQuery(entity));

        if (pathfinding.dijkstra) {
          const weightProp = (entity.properties || []).find((p) => p && ["I32", "I64", "F32", "F64"].includes(p.type));
          if (weightProp) {
            pathfindingSegments.push(this.buildDijkstraQuery(entity, weightProp.name));
          }
        }
      }

      // 4. Contextual Analytics
      if (entity.kind === "Node") {
        const properties = entity.properties || [];
        if (analytics.aggregation) {
          analyticsSegments.push(this.buildCountQuery(entity));
          const numeric = properties.filter((p) => p && !p.isArray && ["I32", "I64", "F32", "F64"].includes(p.type));
          for (const prop of numeric) {
            analyticsSegments.push(this.buildMathAggQuery(entity, prop.name, "SUM"));
            analyticsSegments.push(this.buildMathAggQuery(entity, prop.name, "AVG"));
            analyticsSegments.push(this.buildMathAggQuery(entity, prop.name, "MIN"));
            analyticsSegments.push(this.buildMathAggQuery(entity, prop.name, "MAX"));
          }
        }

        if (analytics.grouping) {
          const categorical = properties.filter((p) => p && !p.isArray && (p.type === "String" || p.type === "Boolean"));
          for (const cat of categorical) {
            analyticsSegments.push(this.buildGroupByQuery(entity, cat.name));
          }
        }
      }

      // Join inner items with single blank line
      const blocks: string[] = [];

      const cleanCrud = crudSegments
        .filter((s) => s.trim() !== "")
        .join("\n\n")
        .trim();
      if (cleanCrud) blocks.push(`// --- DATA OPERATIONS (CRUD) ---\n${cleanCrud}`);

      const cleanDiscovery = discoverySegments
        .filter((s) => s.trim() !== "")
        .join("\n\n")
        .trim();
      if (cleanDiscovery) blocks.push(`// --- SEARCH & DISCOVERY ---\n${cleanDiscovery}`);

      const cleanPath = pathfindingSegments
        .filter((s) => s.trim() !== "")
        .join("\n\n")
        .trim();
      if (cleanPath) blocks.push(`// --- PATHFINDING & TRAVERSAL ---\n${cleanPath}`);

      const cleanIntelligence = intelligenceSegments
        .filter((s) => s.trim() !== "")
        .join("\n\n")
        .trim();
      if (cleanIntelligence) blocks.push(`// --- SMART VIEWS & INSIGHTS ---\n${cleanIntelligence}`);

      const cleanAnalytics = analyticsSegments
        .filter((s) => s.trim() !== "")
        .join("\n\n")
        .trim();
      if (cleanAnalytics) blocks.push(`// --- CONTEXTUAL ANALYTICS ---\n${cleanAnalytics}`);

      // Join categories with SINGLE blank lines (\n\n)
      const entityBlock = blocks.join("\n\n");
      if (entityBlock) allEntitiesSegments.push(entityBlock);
    }

    return allEntitiesSegments.join("\n\n");
  }

  // Helper for strict PascalCase (removes underscores)
  private static toPascalCase(str: string): string {
    return str
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  private static buildUpsertNodeQuery(node: EntityDef): string {
    if (node.properties.length === 0) return "";
    const params = node.properties.map((p) => ({ name: p.name, type: p.isArray ? `[${p.type}]` : p.type }));
    params.unshift({ name: "id", type: "ID" });

    const assignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const assignmentsObj = new HqlExpr(`{\n${assignments}\n    }`);

    return new HqlQuery(`Upsert${this.toPascalCase(node.name)}`, params)
      .assign("existing", new HqlSource("N", node.name, [new HqlExpr("id")]))
      .assign("upsert_node", new HqlSource("existing").step("UpsertN", assignmentsObj))
      .returns("upsert_node")
      .toString();
  }
  private static buildUpsertEdgeQuery(edge: EntityDef): string {
    if (edge.properties.length === 0) return "";
    const params = edge.properties.map((p) => ({
      name: p.name,
      type: p.isArray ? `[${p.type === "Timestamp" ? "Date" : p.type}]` : p.type === "Timestamp" ? "Date" : p.type,
    }));
    params.unshift({ name: "from_id", type: "ID" }, { name: "to_id", type: "ID" });

    const assignments = edge.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const assignmentsObj = new HqlExpr(`{\n${assignments}\n    }`);

    return new HqlQuery(`Upsert${this.toPascalCase(edge.name)}`, params)
      .assign("edge", new HqlSource("E", edge.name).step("UpsertE", assignmentsObj).step("From", "from_id").step("To", "to_id"))
      .returns("edge")
      .toString();
  }

  private static buildAddVectorQuery(node: EntityDef): string {
    const params = node.properties.map((p) => ({ name: p.name, type: p.isArray ? `[${p.type}]` : p.type }));
    params.unshift({ name: "data", type: "[F64]" });

    const assignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const body =
      node.properties.length > 0 ? new HqlSource("AddV", node.name, [new HqlExpr("data"), new HqlExpr(`{\n${assignments}\n    }`)]) : new HqlSource("AddV", node.name, [new HqlExpr("data")]);

    return new HqlQuery(`Add${this.toPascalCase(node.name)}Vector`, params).assign("new_v", body).returns("new_v").toString();
  }

  private static buildUpsertVectorQuery(node: EntityDef): string {
    if (node.properties.length === 0) return "";
    const params = node.properties.map((p) => ({ name: p.name, type: p.isArray ? `[${p.type}]` : p.type }));
    params.unshift({ name: "id", type: "ID" }, { name: "data", type: "[F64]" });

    const assignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const assignmentsObj = new HqlExpr(`{\n${assignments}\n    }`);

    return new HqlQuery(`Upsert${this.toPascalCase(node.name)}Vector`, params)
      .assign("existing", new HqlSource("V", node.name, [new HqlExpr("id")]))
      .assign("upsert_v", new HqlSource("existing").step("UpsertV", new HqlExpr("data"), assignmentsObj))
      .returns("upsert_v")
      .toString();
  }

  private static buildPrefilteredVectorSearchQuery(node: EntityDef, filterProp: PropertyDef): string {
    const fNode = this.toPascalCase(node.name);
    const fProp = this.toPascalCase(filterProp.name);

    return new HqlQuery(`Search${fNode}FilteredBy${fProp}`, [
      { name: "vec", type: "[F64]" },
      { name: "filter_val", type: filterProp.type },
      { name: "limit", type: "I32" },
    ])
      .assign("results", new HqlSource("SearchV", node.name, [new HqlExpr("vec"), new HqlExpr("limit")]).step("PREFILTER", HqlExpr.prop(filterProp.name).op("EQ", "filter_val")))
      .returns("results")
      .toString();
  }

  private static buildVectorSearchQuery(node: EntityDef): string {
    return new HqlQuery(`Search${this.toPascalCase(node.name)}`, [
      { name: "vec", type: "[F64]" },
      { name: "limit", type: "I32" },
    ])
      .assign("results", new HqlSource("SearchV", node.name, [new HqlExpr("vec"), new HqlExpr("limit")]))
      .returns("results")
      .toString();
  }

  private static buildHybridSearchQuery(node: EntityDef, filterProp?: PropertyDef): string {
    const fNode = this.toPascalCase(node.name);
    const params = [
      { name: "vec", type: "[F64]" },
      { name: "limit", type: "I32" },
    ];

    if (filterProp) {
      params.push({ name: "filter_val", type: filterProp.type });
      const fProp = this.toPascalCase(filterProp.name);
      return new HqlQuery(`HybridSearch${fNode}FilteredBy${fProp}`, params)
        .assign(
          "results",
          new HqlSource("SearchV", node.name, [new HqlExpr("vec"), new HqlExpr("limit")]).step("PREFILTER", HqlExpr.prop(filterProp.name).op("EQ", "filter_val")).step("RerankRRF", "k: 60")
        )
        .returns("results")
        .toString();
    }

    return new HqlQuery(`HybridSearch${fNode}`, params)
      .assign("results", new HqlSource("SearchV", node.name, [new HqlExpr("vec"), new HqlExpr("limit")]).step("RerankRRF", "k: 60"))
      .returns("results")
      .toString();
  }

  private static buildCreateNodeQuery(node: EntityDef): string {
    const params = node.properties.map((p) => ({ name: p.name, type: p.isArray ? `[${p.type}]` : p.type }));
    const assignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const body = node.properties.length > 0 ? new HqlSource("AddN", node.name, [new HqlExpr(`{\n${assignments}\n    }`)]) : new HqlSource("AddN", node.name);

    return new HqlQuery(`Create${this.toPascalCase(node.name)}`, params).assign("new_node", body).returns("new_node").toString();
  }

  private static buildDeleteNodeQuery(node: EntityDef): string {
    return new HqlQuery(`Delete${this.toPascalCase(node.name)}`, [{ name: "id", type: "ID" }])
      .statement(new HqlSource("DROP N", node.name, [new HqlExpr("id")]))
      .returns(HqlExpr.lit("Deleted", "String"))
      .toString();
  }

  private static buildGetNodeByIdQuery(node: EntityDef): string {
    return new HqlQuery(`Get${this.toPascalCase(node.name)}ById`, [{ name: "id", type: "ID" }])
      .assign("result", new HqlSource("N", node.name, [new HqlExpr("id")]))
      .returns("result")
      .toString();
  }

  private static buildGetNodeByUniqueQuery(node: EntityDef, prop: PropertyDef): string {
    const fNode = this.toPascalCase(node.name);
    const fProp = this.toPascalCase(prop.name);

    return new HqlQuery(`Get${fNode}By${fProp}`, [{ name: "val", type: prop.type }])
      .assign("result", new HqlSource("N", node.name).step("WHERE", HqlExpr.prop(prop.name).op("EQ", "val")))
      .returns("result")
      .toString();
  }

  private static buildGetNodeQuery(node: EntityDef, proControl: boolean = false): string {
    const queryName = `GetAll${this.toPascalCase(node.name)}`;
    if (proControl) {
      return new HqlQuery(queryName, [
        { name: "offset", type: "I32" },
        { name: "limit", type: "I32" },
        { name: "order_field", type: "String" },
        { name: "is_desc", type: "Boolean" },
      ])
        .assign("results", new HqlSource("N", node.name).step("ORDER<Asc>", HqlExpr.id()).step("RANGE", "offset", "limit"))
        .returns("results")
        .toString();
    }
    return new HqlQuery(queryName, [{ name: "limit", type: "I32" }])
      .assign("results", new HqlSource("N", node.name).step("RANGE", 0, "limit"))
      .returns("results")
      .toString();
  }

  private static buildConnectQuery(edge: EntityDef): string {
    const params = edge.properties.map((p) => ({
      name: p.name,
      type: p.isArray ? `[${p.type === "Timestamp" ? "Date" : p.type}]` : p.type === "Timestamp" ? "Date" : p.type,
    }));
    params.unshift({ name: "from_id", type: "ID" }, { name: "to_id", type: "ID" });

    const propAssignments = edge.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const assignmentsObj = new HqlExpr(`{\n${propAssignments}\n    }`);

    const body = edge.properties.length > 0 ? new HqlSource("AddE", edge.name, [assignmentsObj]) : new HqlSource("AddE", edge.name);

    return new HqlQuery(`Connect${this.toPascalCase(edge.name)}`, params).assign("edge", body.step("From", "from_id").step("To", "to_id")).returns("edge").toString();
  }

  private static buildTraversalQuery(edge: EntityDef): string {
    const fNode = this.toPascalCase(edge.from || "");
    const fEdge = this.toPascalCase(edge.name);
    return new HqlQuery(`Get${fEdge}Of${fNode}`, [{ name: "start_id", type: "ID" }])
      .assign("results", new HqlSource("N", edge.from, [new HqlExpr("start_id")]).gStep("Out", edge.name))
      .returns("results")
      .toString();
  }

  private static buildShortestPathQuery(edge: EntityDef): string {
    return new HqlQuery(`ShortestPath${this.toPascalCase(edge.name)}`, [
      { name: "start", type: "ID" },
      { name: "end", type: "ID" },
    ])
      .assign("path", new HqlSource("N", edge.from, [new HqlExpr("start")]).gStep("ShortestPathBFS", edge.name).step("To", "end"))
      .returns("path")
      .toString();
  }

  private static buildDijkstraQuery(edge: EntityDef, weightField: string): string {
    return new HqlQuery(`WeightedPath${this.toPascalCase(edge.name)}`, [
      { name: "start", type: "ID" },
      { name: "end", type: "ID" },
    ])
      .assign("path", new HqlSource("N", edge.from, [new HqlExpr("start")]).gStep("ShortestPathDijkstras", edge.name, HqlExpr.prop(weightField)).step("To", "end"))
      .returns("path")
      .toString();
  }

  private static buildCountQuery(node: EntityDef): string {
    return new HqlQuery(`Count${this.toPascalCase(node.name)}`).assign("total", new HqlSource("N", node.name).step("COUNT")).returns("total").toString();
  }

  private static buildGroupByQuery(node: EntityDef, field: string): string {
    const fNode = this.toPascalCase(node.name);
    const fField = this.toPascalCase(field);
    return new HqlQuery(`GroupBy${fNode}By${fField}`).assign("groups", new HqlSource("N", node.name).step("GROUP_BY", field)).returns("groups").toString();
  }

  private static buildMathAggQuery(node: EntityDef, field: string, op: string): string {
    if (op === "MAX" || op === "MIN") return "";
    const fNode = this.toPascalCase(node.name);
    const fField = this.toPascalCase(field);
    const opTitle = op.charAt(0) + op.slice(1).toLowerCase();

    return new HqlQuery(`${opTitle}${fNode}${fField}`).assign("result", new HqlSource("N", node.name)).returns(`${op}(result::{${field}})`).toString();
  }

  /* --- Advanced Business Intelligence Queries --- */

  private static buildTextSearchQuery(node: EntityDef): string {
    return new HqlQuery(`Search${this.toPascalCase(node.name)}ByKeyword`, [
      { name: "text", type: "String" },
      { name: "limit", type: "I32" },
    ])
      .assign("results", new HqlSource("SearchBM25", node.name, [new HqlExpr("text"), new HqlExpr("limit")]))
      .returns("results")
      .toString();
  }

  private static buildTwoHopQuery(edge: EntityDef): string {
    const fNode = this.toPascalCase(edge.name);
    const source = new HqlSource("N", edge.from, [new HqlExpr("start_id")]);

    source.gStep("Out", edge.name);
    if (edge.from === edge.to) {
      source.gStep("Out", edge.name);
    }
    source.step("RANGE", 0, "limit");

    return new HqlQuery(`Explore${fNode}Network`, [
      { name: "start_id", type: "ID" },
      { name: "limit", type: "I32" },
    ])
      .assign("network", source)
      .returns("network")
      .toString();
  }

  private static buildMutualConnectionsQuery(edge: EntityDef): string {
    const fNode = this.toPascalCase(edge.name);

    const existsCheck = new HqlExpr("EXISTS(_").gOp("In", edge.name).op("WHERE", HqlExpr.id().op("EQ", "b_id")).add(")");

    return new HqlQuery(`GetMutual${fNode}`, [
      { name: "a_id", type: "ID" },
      { name: "b_id", type: "ID" },
    ])
      .assign("mutual", new HqlSource("N", edge.from, [new HqlExpr("a_id")]).gStep("Out", edge.name).step("WHERE", existsCheck))
      .returns("mutual")
      .toString();
  }

  private static buildRichDetailQuery(node: EntityDef, allEntities: EntityDef[]): string {
    const fNode = this.toPascalCase(node.name);
    const relatedEdges = allEntities.filter((e) => e.kind === "Edge" && (e.from === node.name || e.to === node.name));

    const projectionFields: Record<string, string | HqlExpr> = {
      node_id: HqlExpr.id(),
    };

    for (const p of node.properties || []) {
      projectionFields[p.name] = p.name;
    }

    relatedEdges.slice(0, 3).forEach((e) => {
      const direction = e.from === node.name ? "Out" : "In";
      const countExpr = new HqlExpr(`_::${direction}E<${e.name}>::COUNT`);
      projectionFields[`${e.name.toLowerCase()}_count`] = countExpr;
    });

    return new HqlQuery(`Get${fNode}DeepDetail`, [{ name: "id", type: "ID" }])
      .assign("origin", new HqlSource("N", node.name, [new HqlExpr("id")]))
      .assign("detail", new HqlSource("origin").project(projectionFields))
      .returns("detail")
      .toString();
  }

  /**
   * Advanced validation with cross-entity reference checking
   */
  static validate(entities: EntityDef[]): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const entityNames = entities.map((e) => e.name);
    const usedNames = new Set<string>();

    for (const entity of entities) {
      const name = entity.name.trim();

      // 1. Name validation
      if (!name) {
        diagnostics.push({
          entityId: entity.id,
          message: "Entity name is required",
          level: "error",
        });
      } else {
        // Helix Strict Identifier Check
        if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) {
          diagnostics.push({
            entityId: entity.id,
            message: "Standard: Entity names must start with an Uppercase letter and only contain Alphanumeric/Underscore",
            level: "error",
          });
        }

        // Reserved Names Check
        if (RESERVED_TYPE_NAMES.includes(name)) {
          diagnostics.push({
            entityId: entity.id,
            message: `Reserved keyword: '${name}' cannot be used as an entity name`,
            level: "error",
          });
        }

        if (usedNames.has(name.toLowerCase())) {
          diagnostics.push({
            entityId: entity.id,
            message: `Duplicate name: '${name}' (Helix names are case-insensitive)`,
            level: "error",
          });
        }
        usedNames.add(name.toLowerCase());
      }

      // 2. Edge Reference validation
      if (entity.kind === "Edge") {
        if (entity.from && !entityNames.includes(entity.from)) {
          diagnostics.push({
            entityId: entity.id,
            message: `Unknown source: '${entity.from}'`,
            level: "error",
          });
        }
        if (entity.to && !entityNames.includes(entity.to)) {
          diagnostics.push({
            entityId: entity.id,
            message: `Unknown target: '${entity.to}'`,
            level: "error",
          });
        }
        if (!entity.from || !entity.to) {
          diagnostics.push({
            entityId: entity.id,
            message: "Relations must connect two entities",
            level: "info",
          });
        }
      }

      // 3. Property validation
      const seenProps = new Set<string>();
      const reservedFields = entity.kind === "Node" ? NODE_RESERVED_FIELDS : entity.kind === "Edge" ? EDGE_RESERVED_FIELDS : VEC_RESERVED_FIELDS;

      entity.properties.forEach((prop, idx) => {
        const pName = prop.name.trim().toLowerCase();

        if (!prop.name.trim()) {
          diagnostics.push({
            entityId: entity.id,
            propertyIndex: idx,
            message: "Property name missing",
            level: "error",
          });
        } else {
          if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(prop.name)) {
            diagnostics.push({
              entityId: entity.id,
              propertyIndex: idx,
              message: "Invalid characters in property name",
              level: "error",
            });
          }

          // Reserved Keyword / Field Check
          // Relaxed: Only check for entity-specific internal fields (managed by Helix)
          // Property names can usually be HQL keywords as they are scoped.
          if (reservedFields.includes(pName)) {
            diagnostics.push({
              entityId: entity.id,
              propertyIndex: idx,
              message: `'${prop.name}' is a reserved internal field managed by Helix`,
              level: "error",
            });
          }

          // Case-insensitive duplicate check
          if (seenProps.has(pName)) {
            diagnostics.push({
              entityId: entity.id,
              propertyIndex: idx,
              message: `Duplicate property: '${prop.name}'`,
              level: "error",
            });
          }
          seenProps.add(pName);
        }
      });
    }

    return diagnostics;
  }
}
