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
    vector_search: false,
    vector_upsert: false,
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

export class HqlCodeGen {
  /**
   * Generates full HQL schema including automated ID fields
   */
  static generateSchema(entities: EntityDef[]): string {
    if (entities.length === 0) {
      return "{}";
    }

    const segments: string[] = [];

    for (const entity of entities) {
      if (!entity) continue;
      const entitySegments: string[] = [];
      const properties = entity.properties || [];

      if (entity.kind === "Node") {
        entitySegments.push(`N::${entity.name} {`);
        const fields = this.generateFields(properties, "    ");
        if (fields) entitySegments.push(fields);
        entitySegments.push("}");
      } else if (entity.kind === "Edge") {
        const uniqueMod = entity.isUniqueRelation ? " UNIQUE" : "";
        entitySegments.push(`E::${entity.name}${uniqueMod} {`);
        entitySegments.push(`    From: ${entity.from || "Undefined"},`);
        entitySegments.push(`    To: ${entity.to || "Undefined"},`);
        const fields = this.generateFields(properties, "        ");
        entitySegments.push("    Properties: {");
        if (fields) entitySegments.push(fields);
        entitySegments.push("    }");
        entitySegments.push("}");
      } else if (entity.kind === "Vector") {
        entitySegments.push(`V::${entity.name} {`);
        const fields = this.generateFields(properties, "    ");
        if (fields) entitySegments.push(fields);
        entitySegments.push("}");
      }
      segments.push(entitySegments.join("\n"));
    }

    return segments.join("\n\n").trim();
  }

  private static generateFields(properties: PropertyDef[], indent: string = "    "): string {
    if (!properties) return "";
    return properties
      .filter((p) => p && p.name)
      .map((p) => {
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

        return line;
      })
      .join(",\n");
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
        if (entity.kind === "Vector" && discovery.vector_search) {
          discoverySegments.push(this.buildVectorSearchQuery(entity));
          discoverySegments.push(this.buildHybridSearchQuery(entity));
        }
        if (entity.kind === "Vector" && discovery.vector_upsert) {
          discoverySegments.push(this.buildAddVectorQuery(entity));
          discoverySegments.push(this.buildUpsertVectorQuery(entity));
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
    const params = node.properties.map((p) => `${p.name}: ${p.isArray ? `[${p.type}]` : p.type}`).join(", ");
    const assignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");

    const queryName = `Upsert${this.toPascalCase(node.name)}`;
    return (
      `QUERY ${queryName}(id: ID, ${params}) =>\n` + `    existing <- N<${node.name}>(id)\n` + `    upsert_node <- existing::UpsertN({\n` + `${assignments}\n` + `    })\n` + `    RETURN upsert_node`
    );
  }
  private static buildUpsertEdgeQuery(edge: EntityDef): string {
    if (edge.properties.length === 0) return "";
    const propParams = edge.properties.map((p) => `${p.name}: ${p.isArray ? `[${p.type === "Timestamp" ? "Date" : p.type}]` : p.type === "Timestamp" ? "Date" : p.type}`).join(", ");
    const propAssignments = edge.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const params = propParams ? `from_id: ID, to_id: ID, ${propParams}` : "from_id: ID, to_id: ID";

    const queryName = `Upsert${this.toPascalCase(edge.name)}`;
    return `QUERY ${queryName}(${params}) =>\n` + `    edge <- E<${edge.name}>::UpsertE({\n${propAssignments}\n    })::From(from_id)::To(to_id)\n` + `    RETURN edge`;
  }

  private static buildAddVectorQuery(node: EntityDef): string {
    const propParams = node.properties.map((p) => `${p.name}: ${p.isArray ? `[${p.type}]` : p.type}`).join(", ");
    const propAssignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const params = propParams ? `data: [F64], ${propParams}` : "data: [F64]";

    const body = node.properties.length > 0 ? `AddV<${node.name}>(data, {\n${propAssignments}\n    })` : `AddV<${node.name}>(data)`;

    const queryName = `Add${this.toPascalCase(node.name)}Vector`;
    return `QUERY ${queryName}(${params}) =>\n` + `    new_v <- ${body}\n` + `    RETURN new_v`;
  }

  private static buildUpsertVectorQuery(node: EntityDef): string {
    if (node.properties.length === 0) return "";
    const propParams = node.properties.map((p) => `${p.name}: ${p.isArray ? `[${p.type}]` : p.type}`).join(", ");
    const propAssignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const params = propParams ? `id: ID, data: [F64], ${propParams}` : "id: ID, data: [F64]";

    const queryName = `Upsert${this.toPascalCase(node.name)}Vector`;
    return `QUERY ${queryName}(${params}) =>\n` + `    existing <- V<${node.name}>(id)\n` + `    upsert_v <- existing::UpsertV(data, {\n${propAssignments}\n    })\n` + `    RETURN upsert_v`;
  }

  private static buildVectorSearchQuery(node: EntityDef): string {
    const queryName = `Search${this.toPascalCase(node.name)}`;
    return `QUERY ${queryName}(vec: [F64], limit: I32) =>\n` + `    results <- SearchV<${node.name}>(vec, limit)\n` + `    RETURN results`;
  }

  private static buildHybridSearchQuery(node: EntityDef): string {
    const queryName = `HybridSearch${this.toPascalCase(node.name)}`;
    return `QUERY ${queryName}(vec: [F64], limit: I32) =>\n` + `    results <- SearchV<${node.name}>(vec, limit)::RerankRRF(k: 60)\n` + `    RETURN results`;
  }

  private static buildCreateNodeQuery(node: EntityDef): string {
    const params = node.properties.map((p) => `${p.name}: ${p.isArray ? `[${p.type}]` : p.type}`).join(", ");
    const assignments = node.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");

    const body = node.properties.length > 0 ? `AddN<${node.name}>({\n${assignments}\n    })` : `AddN<${node.name}>`;

    const queryName = `Create${this.toPascalCase(node.name)}`;
    return `QUERY ${queryName}(${params}) =>\n` + `    new_node <- ${body}\n` + `    RETURN new_node`;
  }

  private static buildDeleteNodeQuery(node: EntityDef): string {
    const queryName = `Delete${this.toPascalCase(node.name)}`;
    return `QUERY ${queryName}(id: ID) =>\n` + `    DROP N<${node.name}>(id)\n` + `    RETURN "Deleted"`;
  }

  private static buildGetNodeByIdQuery(node: EntityDef): string {
    const queryName = `Get${this.toPascalCase(node.name)}ById`;
    return `QUERY ${queryName}(id: ID) =>\n` + `    result <- N<${node.name}>(id)\n` + `    RETURN result`;
  }

  private static buildGetNodeByUniqueQuery(node: EntityDef, prop: PropertyDef): string {
    const fName = this.toPascalCase(prop.name); // Includes underscore removal
    const queryName = `Get${this.toPascalCase(node.name)}By${fName}`;
    return `QUERY ${queryName}(val: ${prop.type}) =>\n` + `    result <- N<${node.name}>::WHERE(_::{${prop.name}}::EQ(val))\n` + `    RETURN result`;
  }

  private static buildGetNodeQuery(node: EntityDef, proControl: boolean = false): string {
    const queryName = `GetAll${this.toPascalCase(node.name)}`;
    if (proControl) {
      return (
        `QUERY ${queryName}(offset: I32, limit: I32, order_field: String, is_desc: Boolean) =>\n` +
        `    results <- N<${node.name}>\n` +
        `        ::ORDER<Asc>(_::ID)\n` +
        `        ::RANGE(offset, limit)\n` +
        `    RETURN results`
      );
    }
    return `QUERY ${queryName}(limit: I32) =>\n` + `    results <- N<${node.name}>::RANGE(0, limit)\n` + `    RETURN results`;
  }

  private static buildConnectQuery(edge: EntityDef): string {
    const propParams = edge.properties.map((p) => `${p.name}: ${p.isArray ? `[${p.type === "Timestamp" ? "Date" : p.type}]` : p.type === "Timestamp" ? "Date" : p.type}`).join(", ");
    const propAssignments = edge.properties.map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const params = propParams ? `from_id: ID, to_id: ID, ${propParams}` : "from_id: ID, to_id: ID";

    const body = edge.properties.length > 0 ? `AddE<${edge.name}>({\n${propAssignments}\n    })` : `AddE<${edge.name}>`;

    const queryName = `Connect${this.toPascalCase(edge.name)}`;
    return `QUERY ${queryName}(${params}) =>\n` + `    edge <- ${body}::From(from_id)::To(to_id)\n` + `    RETURN edge`;
  }

  private static buildTraversalQuery(edge: EntityDef): string {
    const queryName = `Get${this.toPascalCase(edge.name)}Of${this.toPascalCase(edge.from || "")}`;
    return `QUERY ${queryName}(start_id: ID) =>\n` + `    results <- N<${edge.from}>(start_id)::Out<${edge.name}>\n` + `    RETURN results`;
  }

  private static buildShortestPathQuery(edge: EntityDef): string {
    const queryName = `ShortestPath${this.toPascalCase(edge.name)}`;
    return `QUERY ${queryName}(start: ID, end: ID) =>\n` + `    path <- N<${edge.from}>(start)\n` + `        ::ShortestPathBFS<${edge.name}>::To(end)\n` + `    RETURN path`;
  }

  private static buildDijkstraQuery(edge: EntityDef, weightField: string): string {
    const queryName = `WeightedPath${this.toPascalCase(edge.name)}`;
    return `QUERY ${queryName}(start: ID, end: ID) =>\n` + `    path <- N<${edge.from}>(start)\n` + `        ::ShortestPathDijkstras<${edge.name}>(_::{${weightField}})::To(end)\n` + `    RETURN path`;
  }

  private static buildCountQuery(node: EntityDef): string {
    const queryName = `Count${this.toPascalCase(node.name)}`;
    return `QUERY ${queryName}() =>\n` + `    total <- N<${node.name}>::COUNT\n` + `    RETURN total`;
  }

  private static buildGroupByQuery(node: EntityDef, field: string): string {
    const fNode = this.toPascalCase(node.name);
    const fField = this.toPascalCase(field);
    const queryName = `GroupBy${fNode}By${fField}`;
    return `QUERY ${queryName}() =>\n` + `    groups <- N<${node.name}>::GROUP_BY(${field})\n` + `    RETURN groups`;
  }

  private static buildMathAggQuery(node: EntityDef, field: string, op: string): string {
    const fNode = this.toPascalCase(node.name);
    const fField = this.toPascalCase(field);
    const opTitle = op.charAt(0) + op.slice(1).toLowerCase();

    // MAX/MIN are binary in this version (Math.max(a, b)),
    // but SUM/AVG/COUNT remain unary aggregates.
    if (op === "MAX" || op === "MIN") return "";

    const queryName = `${opTitle}${fNode}${fField}`;
    return `QUERY ${queryName}() =>\n` + `    result <- N<${node.name}>\n` + `    RETURN ${op}(result::{${field}})`;
  }

  /* --- Advanced Business Intelligence Queries --- */

  private static buildTextSearchQuery(node: EntityDef): string {
    const queryName = `Search${this.toPascalCase(node.name)}ByKeyword`;
    return `QUERY ${queryName}(text: String, limit: I32) =>\n` + `    results <- SearchBM25<${node.name}>(text, limit)\n` + `    RETURN results`;
  }

  private static buildTwoHopQuery(edge: EntityDef): string {
    const queryName = `Explore${this.toPascalCase(edge.name)}Network`;
    const steps = edge.from === edge.to ? `::Out<${edge.name}>\n        ::Out<${edge.name}>` : `::Out<${edge.name}>`;
    return `QUERY ${queryName}(start_id: ID, limit: I32) =>\n` + `    network <- N<${edge.from}>(start_id)\n` + `        ${steps}\n` + `        ::RANGE(0, limit)\n` + `    RETURN network`;
  }

  private static buildMutualConnectionsQuery(edge: EntityDef): string {
    const queryName = `GetMutual${this.toPascalCase(edge.name)}`;
    return (
      `QUERY ${queryName}(a_id: ID, b_id: ID) =>\n` +
      `    mutual <- N<${edge.from}>(a_id)::Out<${edge.name}>\n` +
      `        ::WHERE(EXISTS(_::In<${edge.name}>::WHERE(_::ID::EQ(b_id))))\n` +
      `    RETURN mutual`
    );
  }

  private static buildRichDetailQuery(node: EntityDef, allEntities: EntityDef[]): string {
    const queryName = `Get${this.toPascalCase(node.name)}DeepDetail`;
    const relatedEdges = allEntities.filter((e) => e.kind === "Edge" && (e.from === node.name || e.to === node.name));

    const props = (node.properties || []).map((p) => `        ${p.name}: ${p.name}`).join(",\n");
    const counts = relatedEdges
      .slice(0, 3) // Don't overwhelm with too many counts
      .map((e) => {
        const direction = e.from === node.name ? "Out" : "In";
        return `        ${e.name.toLowerCase()}_count: _::${direction}E<${e.name}>::COUNT`;
      })
      .join(",\n");

    return (
      `QUERY ${queryName}(id: ID) =>\n` +
      `    origin <- N<${node.name}>(id)\n` +
      `    detail <- origin::{\n` +
      `        node_id: _::ID,\n` +
      `${props}${props && counts ? ",\n" : ""}${counts}\n` +
      `    }\n` +
      `    RETURN detail`
    );
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
