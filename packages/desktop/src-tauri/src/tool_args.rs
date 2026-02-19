use helix_db::protocol::value::Value;
use serde::{Serialize, Deserialize};

/// MIRROR: This file mirrors `helix-db/src/helix_gateway/mcp/tools.rs`
/// Any changes in the backend protocol should be reflected here.

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EdgeType {
    Node,
    Vec,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[serde(tag = "tool_name", content = "args")]
pub enum ToolArgs {
    OutStep {
        edge_label: String,
        edge_type: EdgeType,
        filter: Option<FilterTraversal>,
    },
    OutEStep {
        edge_label: String,
        filter: Option<FilterTraversal>,
    },
    InStep {
        edge_label: String,
        edge_type: EdgeType,
        filter: Option<FilterTraversal>,
    },
    InEStep {
        edge_label: String,
        filter: Option<FilterTraversal>,
    },
    NFromType {
        node_type: String,
    },
    VFromType {
        vector_type: String,
    },
    EFromType {
        edge_type: String,
    },
    FilterItems {
        #[serde(default)]
        filter: FilterTraversal,
    },
    OrderBy {
        properties: String,
        order: Order,
    },
    SearchKeyword {
        query: String,
        limit: usize,
        label: String,
    },
    SearchVecText {
        query: String,
        label: String,
        k: usize,
    },
    SearchVec {
        vector: Vec<f64>,
        k: usize,
        min_score: Option<f64>,
        cutoff: Option<usize>,
    },
    SearchV {
        label: String,
        vector: Vec<f64>,
        k: usize,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Order {
    #[serde(rename = "asc")]
    Asc,
    #[serde(rename = "desc")]
    Desc,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct FilterProperties {
    pub key: String,
    pub value: Value,
    pub operator: Option<Operator>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct FilterTraversal {
    pub properties: Option<Vec<Vec<FilterProperties>>>,
    pub filter_traversals: Option<Vec<ToolArgs>>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Operator {
    #[serde(rename = "==")]
    Eq,
    #[serde(rename = "!=")]
    Neq,
    #[serde(rename = ">")]
    Gt,
    #[serde(rename = "<")]
    Lt,
    #[serde(rename = ">=")]
    Gte,
    #[serde(rename = "<=")]
    Lte,
}
