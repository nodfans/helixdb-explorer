export interface DataItem {
  id: string;
  label?: string;
  name?: string;
  title?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface SchemaNode {
  name: string;
  properties: Record<string, string>;
}
export type NodeType = SchemaNode;

export interface SchemaEdge {
  name: string;
  from_node?: string;
  to_node?: string;
  from?: string;
  to?: string;
  properties: Record<string, string>;
}
export type EdgeType = SchemaEdge;

export interface SchemaVector {
  name: string;
  properties: Record<string, string>;
}
export type VectorType = SchemaVector;

export interface SchemaQuery {
  name: string;
  parameters: Record<string, string>;
  returns: string[];
}

export interface SchemaInfo {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  vectors: SchemaVector[];
  queries: SchemaQuery[];
}

export interface NodesEdgesResponse {
  data: {
    nodes: DataItem[];
    edges: any[];
    vectors: any[];
  };
  stats?: {
    num_nodes: number;
    num_edges: number;
    num_vectors: number;
  };
  error?: string;
}

export interface ConnectionData {
  connected_nodes?: DataItem[];
  incoming_edges?: any[];
  outgoing_edges?: any[];
}

export interface NodeDetailsResponse {
  found?: boolean;
  node?: DataItem;
  data?: DataItem;
  [key: string]: any;
}

export interface ApiEndpointInfo {
  path: string;
  method: string;
  query_name: string;
  parameters: Array<{
    name: string;
    param_type: string;
  }>;
}

export interface EndpointConfig {
  id: string;
  name: string;
  method: string;
  url: string;
  description: string;
  params: Array<{
    name: string;
    type: string;
    param_type: string;
    required: boolean;
    description: string;
  }>;
  body?: any;
  labels?: string[];
  definition?: string;
}
