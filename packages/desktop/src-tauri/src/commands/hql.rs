use helix_db::helixc::parser::{HelixParser, write_to_temp_file};
use helix_db::helixc::parser::types::*;
use crate::hql::{processor, translator, executor};
use crate::hql::tool_args::ToolArgs;
use crate::commands::network::map_reqwest_error;

fn expression_to_json(expr: &Expression) -> Option<serde_json::Value> {
    match &expr.expr {
        ExpressionType::StringLiteral(s) => Some(serde_json::Value::String(s.clone())),
        ExpressionType::IntegerLiteral(i) => Some(serde_json::Value::Number((*i).into())),
        ExpressionType::FloatLiteral(f) => serde_json::Number::from_f64(*f).map(serde_json::Value::Number),
        ExpressionType::BooleanLiteral(b) => Some(serde_json::Value::Bool(*b)),
        ExpressionType::ArrayLiteral(arr) => {
            let values: Vec<serde_json::Value> = arr.iter().filter_map(expression_to_json).collect();
            Some(serde_json::Value::Array(values))
        },
        _ => None,
    }
}

#[tauri::command]
pub async fn execute_dynamic_hql(url: String, code: String, params: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    let code = processor::preprocess_hql(&code);

    fn try_parse(code: &str) -> Result<Source, String> {
        let content = write_to_temp_file(vec![code]);
        HelixParser::parse_source(&content).map_err(|e| format!("{:?}", e))
    }

    let source = if code.trim().to_uppercase().starts_with("QUERY") {
        try_parse(&code).map_err(|e| {
            format!("Failed to parse Query: {}\nCode: '{}'", e, code)
        })?
    } else {
        match try_parse(&code) {
            Ok(s) => s,
            Err(_) => {
                let wrapped = format!("QUERY ExplorerTmp() => {}", code);
                try_parse(&wrapped).map_err(|e| {
                    format!("Failed to parse HQL: {}", e)
                })?
            }
        }
    };

    if source.queries.len() > 1 {
        return Err("Multiple queries detected in editor. Please select a specific query to execute, or ensure only one query exists.".to_string());
    }
    
    let query = source.queries.first().ok_or_else(|| "No query found in parsed source".to_string())?;
    let mut params_val = params.unwrap_or(serde_json::json!({}));

    let mut variable_assignments = std::collections::HashMap::<String, &Traversal>::new();
    let mut variable_search_tools = std::collections::HashMap::<String, ToolArgs>::new();
    let mut return_vars = Vec::<String>::new();

    for stmt in &query.statements {
        match &stmt.statement {
            StatementType::Assignment(assign) => {
                if let Some(val) = expression_to_json(&assign.value) {
                    if let serde_json::Value::Object(map) = &mut params_val {
                        map.insert(assign.variable.clone(), val);
                    }
                }

                match &assign.value.expr {
                    ExpressionType::Traversal(t) => {
                        variable_assignments.insert(assign.variable.clone(), &**t);
                    },
                    ExpressionType::StringLiteral(s) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            map.insert(assign.variable.clone(), serde_json::Value::String(s.clone()));
                        }
                    },
                    ExpressionType::IntegerLiteral(i) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            map.insert(assign.variable.clone(), serde_json::Value::Number((*i).into()));
                        }
                    },
                    ExpressionType::FloatLiteral(f) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            if let Some(n) = serde_json::Number::from_f64(*f) {
                                map.insert(assign.variable.clone(), serde_json::Value::Number(n));
                            }
                        }
                    },
                    ExpressionType::BooleanLiteral(b) => {
                        if let serde_json::Value::Object(map) = &mut params_val {
                            map.insert(assign.variable.clone(), serde_json::Value::Bool(*b));
                        }
                    },
                    ExpressionType::AddNode(_) | ExpressionType::AddEdge(_) | ExpressionType::AddVector(_) => {
                        return Err("Explorer Mode is Read-Only: The underlying MCP protocol does not support writing data. For more details, refer to https://docs.helix-db.com/guides/mcp-guide. To modify data (Add/Update/Delete), please use Migrations or the HTTP API.".to_string());
                    },
                    ExpressionType::BM25Search(bm25) => {
                        let tool = translator::map_bm25_to_tool(bm25).map_err(|e| e.to_string())?;
                        variable_search_tools.insert(assign.variable.clone(), tool);
                    },
                    ExpressionType::SearchVector(sv) => {
                        let tool = translator::map_search_vector_to_tool(sv, &params_val).map_err(|e| e.to_string())?;
                        variable_search_tools.insert(assign.variable.clone(), tool);
                    },
                    _ => {}
                }
            },
            StatementType::Expression(expr) => {
                match &expr.expr {
                    ExpressionType::Traversal(t) => {
                         variable_assignments.insert("_implicit_".to_string(), &**t);
                    },
                    ExpressionType::AddNode(_) | ExpressionType::AddEdge(_) | ExpressionType::AddVector(_) => {
                        return Err("Explorer Mode is Read-Only: The underlying MCP protocol does not support writing data. For more details, refer to https://docs.helix-db.com/guides/mcp-guide. To modify data (Add/Update/Delete), please use Migrations or the HTTP API.".to_string());
                    },
                    ExpressionType::BM25Search(bm25) => {
                        let tool = translator::map_bm25_to_tool(bm25).map_err(|e| e.to_string())?;
                        variable_search_tools.insert("_implicit_".to_string(), tool);
                        return_vars.push("_implicit_".to_string());
                    },
                    ExpressionType::SearchVector(sv) => {
                        let tool = translator::map_search_vector_to_tool(sv, &params_val).map_err(|e| e.to_string())?;
                        variable_search_tools.insert("_implicit_".to_string(), tool);
                        return_vars.push("_implicit_".to_string());
                    },
                    _ => {}
                }
            }
            StatementType::Drop(_) | StatementType::ForLoop(_) => {
                return Err("Explorer Mode is Read-Only: The underlying MCP protocol does not support writing data or complex control flow. For more details, refer to https://docs.helix-db.com/guides/mcp-guide. To modify data (Add/Update/Delete), please use Migrations or the HTTP API.".to_string());
            }
        }
    }

    if !query.return_values.is_empty() {
        for ret in &query.return_values {
            match ret {
                ReturnType::Expression(expr) => {
                     if let ExpressionType::Identifier(id) = &expr.expr {
                         return_vars.push(id.clone());
                     }
                },
                ReturnType::Array(rets) => {
                    for r in rets {
                        if let ReturnType::Expression(expr) = r {
                            if let ExpressionType::Identifier(id) = &expr.expr {
                                return_vars.push(id.clone());
                            }
                        }
                    }
                },
                _ => {} 
            }
        }
    } else if let Some(_) = variable_assignments.get("_implicit_") {
        return_vars.push("_implicit_".to_string());
    } else if variable_search_tools.contains_key("_implicit_") {
        return_vars.push("_implicit_".to_string());
    } else if return_vars.is_empty() && (!variable_assignments.is_empty() || !variable_search_tools.is_empty()) {
        if let Some(last_stmt) = query.statements.last() {
             if let StatementType::Assignment(assign) = &last_stmt.statement {
                 return_vars.push(assign.variable.clone());
             }
        }
    }

    if return_vars.is_empty() {
        return Err("No executable traversal or return statement found.".to_string());
    }

    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build client: {}", e))?;

    let query_name = &query.name;
    if query_name != "ExplorerTmp" && !query.parameters.is_empty() {
        let compiled_url = format!("{}/{}", url, query_name);
        let compiled_resp = client.post(&compiled_url)
            .json(&params_val)
            .send()
            .await;

        if let Ok(resp) = compiled_resp {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    return Ok(translator::normalize_value(json));
                }
            }
        }
    }

    let mut final_map = serde_json::Map::new();

    {
        use rand::seq::SliceRandom;
        let mut rng = rand::thread_rng();
        return_vars.shuffle(&mut rng);
    }

    for var_name in return_vars {
        let search_tool = variable_search_tools.get(&var_name);
        
        let traversal = if search_tool.is_none() {
             match translator::resolve_traversal(&var_name, &variable_assignments)? {
                Some(t) => Some(t),
                None => None,
             }
        } else {
             None
        };

        if search_tool.is_none() && traversal.is_none() {
            continue;
        }

        let init_resp = client.post(format!("{}/mcp/init", url))
            .send()
            .await
            .map_err(|e| map_reqwest_error(e, "Init failed"))?;
        
        if !init_resp.status().is_success() {
            let status = init_resp.status();
            let err_text = init_resp.text().await.unwrap_or_else(|_| String::new());
            return Err(format!("Init request failed ({}): {}", status, err_text));
        }

        let init_body = init_resp.text().await.map_err(|e| format!("Failed to read init body: {}", e))?;
        let connection_id: String = serde_json::from_str(&init_body)
            .map_err(|e| format!("Failed to parse connection_id from '{}': {}", init_body, e))?;

        let result = if let Some(tool) = search_tool {
             executor::execute_search_tool(&client, &url, &connection_id, tool).await?
        } else if let Some(t) = traversal {
             executor::execute_pipeline(&client, &url, &connection_id, &t, &params_val).await?
        } else {
             serde_json::Value::Null
        };
        
        if var_name == "_implicit_" && final_map.is_empty() {
             return Ok(translator::normalize_value(result));
        }
        
        final_map.insert(var_name, result);
    }

    if final_map.len() == 1 && final_map.contains_key("_implicit_") {
        return Ok(translator::normalize_value(final_map.get("_implicit_").unwrap().clone()));
    }

    Ok(translator::normalize_value(serde_json::Value::Object(final_map)))
}

#[tauri::command]
pub async fn validate_hql(code: String) -> Result<Vec<Diagnostic>, String> {
    let code = processor::preprocess_hql(&code);
    let content = write_to_temp_file(vec![&code]);

    match HelixParser::parse_source(&content) {
        Ok(_) => Ok(vec![]),
        Err(e) => {
            let e_str = format!("{:?}", e);
            let mut diagnostics = Vec::new();
            let re = regex::Regex::new(r"-->\s+(\d+):(\d+)").unwrap();
            
            if let Some(caps) = re.captures(&e_str) {
                let line_one_based: usize = caps[1].parse().unwrap_or(0);
                if line_one_based > 0 {
                     let lines: Vec<&str> = code.split('\n').collect();
                     if line_one_based <= lines.len() {
                         let mut start_offset = 0;
                         for i in 0..(line_one_based - 1) {
                             start_offset += lines[i].len() + 1;
                         }
                         let line_len = lines[line_one_based - 1].len();
                         
                         let original_message = format!("Syntax Error: {}", e);
                         let custom_message = map_custom_error(&lines[line_one_based - 1], &original_message)
                            .unwrap_or(original_message);
                         
                         diagnostics.push(Diagnostic {
                             from: start_offset,
                             to: start_offset + line_len,
                             severity: "error".to_string(),
                             message: custom_message,
                         });
                     }
                }
            } else {
                 diagnostics.push(Diagnostic {
                     from: 0,
                     to: code.len(),
                     severity: "error".to_string(),
                     message: format!("Syntax Error: {}", e),
                 });
            }
            Ok(diagnostics)
        }
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct Diagnostic {
    pub from: usize,
    pub to: usize,
    pub severity: String,
    pub message: String,
}

fn map_custom_error(code_snippet: &str, original_error: &str) -> Option<String> {
    let trimmed = code_snippet.trim();
    if trimmed.contains("!_") && original_message_contains(original_error, "expected anonymous_traversal") {
        return Some("Direct negation of traversal is not supported by the DB. Use !AND(...) or !EXISTS(...) instead.".to_string());
    }
    None
}

fn original_message_contains(original: &str, pattern: &str) -> bool {
    original.contains(pattern)
}

#[derive(serde::Serialize, Clone)]
pub struct CompletionItem {
    pub label: String,
    pub kind: String,
    pub detail: Option<String>,
}

#[derive(serde::Deserialize, Clone, Debug)]
pub struct SchemaSummary {
    pub nodes: Vec<SchemaItem>,
    pub edges: Vec<SchemaItem>,
    pub vectors: Vec<SchemaItem>,
}

#[derive(serde::Deserialize, Clone, Debug)]
pub struct SchemaItem {
    pub name: String,
}

#[tauri::command]
pub fn get_hql_completion(code: String, cursor: usize, schema: Option<SchemaSummary>) -> Vec<CompletionItem> {
    let keywords = vec![
        "QUERY", "MIGRATION", "RETURN", "UPDATE", "DROP", "FOR", "IN", "AS", 
        "DEFAULT", "UNIQUE", "INDEX", "EXISTS", "NOW", "NONE", "Properties"
    ];
    
    let traversals = vec![
        "N", "E", "V", 
        "Out", "In", "OutE", "InE", "FromN", "ToN", "FromV", "ToV",
        "ShortestPath", "ShortestPathDijkstras", "ShortestPathBFS", "ShortestPathAStar",
        "PREFILTER", "RerankRRF", "RerankMMR", "Embed",
        "AddN", "AddE", "AddV", "BatchAddV", "UpsertN", "UpsertE", "UpsertV",
        "WHERE", "ORDER", "RANGE", "COUNT", "FIRST", "AGGREGATE_BY", "GROUP_BY", "ID",
        "AND", "OR", "GT", "GTE", "LT", "LTE", "EQ", "NEQ", "IS_IN", "CONTAINS",
        "Asc", "Desc"
    ];

    let types = vec![
        "String", "Boolean", "F32", "F64", "I8", "I16", "I32", "I64", 
        "U8", "U16", "U32", "U64", "U128", "ID", "Date"
    ];

    let math_funcs = vec![
        "ADD", "SUB", "MUL", "DIV", "POW", "MOD", "ABS", "SQRT", "LN", "LOG10", 
        "LOG", "EXP", "CEIL", "FLOOR", "ROUND", "SIN", "COS", "TAN", 
        "ASIN", "ACOS", "ATAN", "ATAN2", "PI", "MIN", "MAX", "SUM", "AVG"
    ];

    let prefix = if cursor <= code.len() {
        &code[..cursor]
    } else {
        &code
    };
    let trimmed_prefix = prefix.trim_end();
    
    let mut schema_nodes = Vec::new();
    let mut schema_edges = Vec::new();
    let mut schema_vectors = Vec::new();

    if let Some(s) = schema {
        for n in s.nodes {
            schema_nodes.push(CompletionItem {
                label: n.name,
                kind: "class".to_string(),
                detail: Some("Node".to_string()),
            });
        }
        for e in s.edges {
            schema_edges.push(CompletionItem {
                label: e.name,
                kind: "interface".to_string(),
                detail: Some("Edge".to_string()),
            });
        }
        for v in s.vectors {
            schema_vectors.push(CompletionItem {
                label: v.name,
                kind: "namespace".to_string(),
                detail: Some("Vector".to_string()),
            });
        }
    }

    let re_search_generic = regex::Regex::new(r"Search(V|BM25)\s*<\s*$").unwrap();
    if re_search_generic.is_match(trimmed_prefix) {
        return schema_nodes;
    }

    if trimmed_prefix.ends_with("::") {
        let mut items: Vec<CompletionItem> = types.into_iter().map(|t| CompletionItem {
            label: t.to_string(),
            kind: "type".to_string(),
            detail: Some("Type".to_string()),
        }).collect();
        items.extend(schema_nodes.clone());
        return items;
    }
    
    let re_traversal_start = regex::Regex::new(r"(N|E|V|AddN|AddE|AddV|UpsertN|UpsertE|UpsertV)\s*\(\s*$").unwrap();
    if re_traversal_start.is_match(trimmed_prefix) {
         let mut items = Vec::new();
         items.extend(schema_nodes.clone());
         items.extend(schema_edges.clone());
         items.extend(schema_vectors.clone());
         return items;
    }
    
    let mut items = Vec::new();

    for k in keywords {
        items.push(CompletionItem {
            label: k.to_string(),
            kind: "keyword".to_string(),
            detail: None,
        });
    }

    for t in traversals {
        items.push(CompletionItem {
            label: t.to_string(),
            kind: "function".to_string(),
            detail: Some("Traversal".to_string()),
        });
    }

    items.push(CompletionItem {
        label: "SearchBM25".to_string(),
        kind: "function".to_string(),
        detail: Some("SearchBM25<T>(query, limit)".to_string()),
    });
    items.push(CompletionItem {
        label: "SearchV".to_string(),
        kind: "function".to_string(),
        detail: Some("SearchV<T>(vector, k)".to_string()),
    });

    for m in math_funcs {
        items.push(CompletionItem {
            label: m.to_string(),
            kind: "function".to_string(),
            detail: Some("Math".to_string()),
        });
    }

    for t in types {
        items.push(CompletionItem {
            label: t.to_string(),
            kind: "type".to_string(),
            detail: None,
        });
    }

    items.extend(schema_nodes);
    items.extend(schema_edges);
    items.extend(schema_vectors);

    items
}

// ============================================
// Formatting Logic
// ============================================
const MAX_SINGLE_LINE_LENGTH: usize = 120;
const EXPAND_THRESHOLD: usize = 40;
const CHAIN_EXPAND_THRESHOLD: usize = 80;
const INDENT: &str = "    ";
const BLOCK_KEYWORDS: &[&str] = &["WHERE", "UPDATE", "MIGRATION", "THEN", "ELSE", "=>"];
const TERMINATOR_KEYWORDS: &[&str] = &["RETURN", "QUERY", "MIGRATION", "UPDATE", "INSERT", "DELETE"];
const TRAVERSAL_ENDERS: &[&str] = &["N", "E", ">", ":", "WHERE", "AND", "OR", "NOT", "EQ", "GT", "LT"];

fn ends_with_any(text: &str, keywords: &[&str]) -> bool {
    keywords.iter().any(|kw| text.ends_with(kw))
}

fn is_terminator_keyword(word: &str) -> bool {
    TERMINATOR_KEYWORDS.contains(&word)
}

fn trim_trailing_spaces(s: &mut String) {
    while s.ends_with(' ') {
        s.pop();
    }
}

#[derive(Debug)]
struct BracketAnalysis {
    content_len: usize,
    comma_count: usize,
    has_local_newline: bool,
    has_comment: bool,
}

impl BracketAnalysis {
    fn analyze<I>(iter: &mut I, open_char: char) -> Self
    where
        I: Iterator<Item = char> + Clone,
    {
        let mut content_len = 0;
        let mut has_local_newline = false;
        let mut has_comment = false;
        let mut nesting = 0;
        let mut comma_count = 0;
        
        let close_char = match open_char {
            '{' => '}',
            '(' => ')',
            '[' => ']',
            _ => return Self::default(),
        };
        
        let mut in_string = false;
        let mut quote_char = ' ';
        let mut escaped = false;
        let mut look_content = iter.clone();
        
        loop {
            let cc = match look_content.next() {
                Some(c) => c,
                None => break,
            };

            if in_string {
                content_len += 1;
                if escaped {
                    escaped = false;
                } else if cc == '\\' {
                    escaped = true;
                } else if cc == quote_char {
                    in_string = false;
                }
                continue;
            }

            if cc == '"' || cc == '\'' || cc == '`' {
                in_string = true;
                quote_char = cc;
                content_len += 1;
                continue;
            }

            if cc == close_char && nesting == 0 {
                break;
            } else if cc == open_char {
                nesting += 1;
                content_len += 2;
            } else if cc == close_char {
                if nesting > 0 {
                    nesting -= 1;
                }
                content_len += 2;
            } else if cc == ',' && nesting == 0 {
                comma_count += 1;
                content_len += 1;
            } else if cc == '\n' {
                if nesting == 0 {
                    has_local_newline = true;
                }
            } else if cc == '/' {
                if look_content.clone().next() == Some('/') {
                    has_comment = true;
                    break;
                }
                content_len += 1;
            } else if cc == '#' {
                has_comment = true;
                break;
            } else {
                content_len += 1;
                if content_len > MAX_SINGLE_LINE_LENGTH {
                    break;
                }
            }
        }
        
        Self {
            content_len,
            comma_count,
            has_local_newline,
            has_comment,
        }
    }
    
    fn should_expand(
        &self,
        is_query_params: bool,
        is_query_body: bool,
        is_property_escape: bool,
    ) -> bool {
        if self.has_comment || is_query_body || self.content_len > MAX_SINGLE_LINE_LENGTH {
            return true;
        }
        if !is_property_escape && self.has_local_newline && self.content_len > EXPAND_THRESHOLD {
            return true;
        }
        if !is_query_params && self.comma_count > 0 && self.content_len > EXPAND_THRESHOLD {
            return true;
        }
        false
    }
}

impl Default for BracketAnalysis {
    fn default() -> Self {
        Self {
            content_len: 0,
            comma_count: 0,
            has_local_newline: false,
            has_comment: false,
        }
    }
}

fn peek_next_non_whitespace<I>(iter: &mut I) -> char
where
    I: Iterator<Item = char> + Clone,
{
    let mut look = iter.clone();
    while let Some(nc) = look.next() {
        if !nc.is_whitespace() {
            return nc;
        }
    }
    ' '
}

fn peek_word<I>(iter: &mut I) -> String
where
    I: Iterator<Item = char> + Clone,
{
    let mut look = iter.clone();
    let mut word = String::new();
    while let Some(nc) = look.next() {
        if !nc.is_whitespace() {
            if nc.is_alphabetic() {
                word.push(nc);
                break;
            }
            return String::new();
        }
    }
    while let Some(nc) = look.clone().next() {
        if nc.is_alphanumeric() || nc == '_' {
            word.push(nc);
            look.next();
        } else {
            break;
        }
    }
    word
}

fn is_multi_step_chain<I>(
    iter: &mut I,
    in_multi: bool,
    is_in_expression: bool,
) -> bool
where
    I: Iterator<Item = char> + Clone,
{
    if in_multi || is_in_expression {
        return in_multi;
    }
    let mut look = iter.clone();
    let mut nesting = 0;
    let mut double_colon_count = 0;
    let mut total_length = 0;
    let mut in_string = false;
    let mut quote_char = ' ';
    let mut escaped = false;
    
    while let Some(nc) = look.next() {
        total_length += 1;
        if in_string {
            if escaped { escaped = false; }
            else if nc == '\\' { escaped = true; }
            else if nc == quote_char { in_string = false; }
            continue;
        }
        if nc == '"' || nc == '\'' || nc == '`' {
            in_string = true;
            quote_char = nc;
            continue;
        }
        match nc {
            '{' | '(' | '[' => nesting += 1,
            '}' | ')' | ']' => {
                if nesting == 0 { break; }
                nesting -= 1;
            }
            ':' if nesting == 0 => {
                if look.clone().next() == Some(':') {
                    double_colon_count += 1;
                    look.next();
                    total_length += 1;
                }
            }
            ';' if nesting == 0 => break,
            '\n' if nesting == 0 => {
                if peek_next_non_whitespace(&mut look) != ':' { break; }
            }
            c if c.is_alphabetic() && nesting == 0 => {
                let mut word = String::new();
                word.push(c);
                while let Some(ic) = look.clone().next() {
                    if ic.is_alphanumeric() || ic == '_' {
                        word.push(ic);
                        look.next();
                        total_length += 1;
                    } else { break; }
                }
                if is_terminator_keyword(&word) { break; }
                let next_nc = peek_next_non_whitespace(&mut look);
                if next_nc == '<' || next_nc == '=' { break; }
            }
            _ => {}
        }
    }
    if double_colon_count == 1 && total_length < CHAIN_EXPAND_THRESHOLD {
        return false;
    }
    double_colon_count > 0
}

#[tauri::command]
pub fn format_hql(code: String) -> Result<String, String> {
    let mut processed = String::new();
    let mut item_iter = code.chars().peekable();
    let iter = &mut item_iter;
    let mut in_string = false;
    let mut quote_char = ' ';
    let mut escaped = false;
    let mut expand_stack = Vec::new();
    let mut tight_stack = Vec::new();
    let mut traversal_expand_stack = vec![false];
    let mut bracket_stack = Vec::new();

    while let Some(c) = iter.next() {
        if in_string {
            processed.push(c);
            if escaped { escaped = false; }
            else if c == '\\' { escaped = true; }
            else if c == quote_char { in_string = false; }
            continue;
        }
        if c == '"' || c == '\'' || c == '`' {
            in_string = true;
            quote_char = c;
            processed.push(c);
            continue;
        }
        if c == '/' && iter.peek() == Some(&'/') {
            processed.push(c);
            processed.push(iter.next().unwrap());
            while let Some(&nc) = iter.peek() {
                if nc == '\n' { break; }
                processed.push(iter.next().unwrap());
            }
            continue;
        }
        if c == '#' {
            processed.push(c);
            while let Some(&nc) = iter.peek() {
                if nc == '\n' { break; }
                processed.push(iter.next().unwrap());
            }
            continue;
        }
        match c {
            ';' => {
                if let Some(top) = traversal_expand_stack.first_mut() { *top = false; }
                processed.push(';');
                processed.push('\n');
            }
            '=' => {
                if let Some(top) = traversal_expand_stack.first_mut() { *top = false; }
                if iter.peek() == Some(&'>') {
                    iter.next();
                    trim_trailing_spaces(&mut processed);
                    processed.push_str(" =>");
                    if peek_next_non_whitespace(iter) == '{' { processed.push(' '); }
                    else { processed.push('\n'); }
                } else { processed.push(c); }
            }
            '{' | '(' | '[' => {
                trim_trailing_spaces(&mut processed);
                let next_non_ws = peek_next_non_whitespace(iter);
                let analysis = BracketAnalysis::analyze(iter, c);
                let p_trimmed = processed.trim_end();
                let is_traversal = ends_with_any(p_trimmed, TRAVERSAL_ENDERS);
                let is_query_params = c == '(' && expand_stack.is_empty() && !is_traversal && !p_trimmed.is_empty();
                let is_block_keyword = ends_with_any(p_trimmed, BLOCK_KEYWORDS);
                let is_query_body = c == '{' && is_block_keyword;
                let is_property_escape = c == '{' && p_trimmed.ends_with("::");
                let should_expand = analysis.should_expand(is_query_params, is_query_body, is_property_escape);
                
                if !processed.is_empty() && !processed.ends_with('\n') && !processed.ends_with(' ') && !processed.ends_with('(') && !processed.ends_with('[') && !processed.ends_with('{') && !processed.ends_with('<') && !processed.ends_with("::") {
                    if c == '{' || c == '[' { processed.push(' '); }
                }
                if c == '<' {
                    if iter.peek() == Some(&'-') {
                        iter.next();
                        trim_trailing_spaces(&mut processed);
                        processed.push_str(" <-");
                        if let Some(top) = traversal_expand_stack.last_mut() { *top = false; }
                        if peek_next_non_whitespace(iter) != '\n' { processed.push(' '); }
                        continue;
                    }
                }
                processed.push(c);
                expand_stack.push(should_expand);
                tight_stack.push(is_property_escape);
                traversal_expand_stack.push(false);
                bracket_stack.push(c);

                if should_expand {
                    if (c == '(' || c == '[') && next_non_ws == '{' {}
                    else { processed.push('\n'); }
                } else if c == '{' && !is_property_escape { processed.push(' '); }
            }
            '}' | ')' | ']' => {
                trim_trailing_spaces(&mut processed);
                let is_tight = tight_stack.pop().unwrap_or(false);
                traversal_expand_stack.pop();
                bracket_stack.pop();
                if let Some(should_expand) = expand_stack.pop() {
                    if should_expand {
                        if !processed.ends_with('\n') {
                            if (c == ')' || c == ']') && processed.ends_with('}') {}
                            else { processed.push('\n'); }
                        }
                        processed.push(c);
                        let mut keep_on_line = false;
                        let mut look_ahead = iter.clone();
                        while let Some(nc) = look_ahead.next() {
                            if nc == ')' || nc == ',' || nc == ']' || nc == ';' || nc == '.' || nc == ':' || nc == '>' || nc == '=' {
                                keep_on_line = true;
                                break;
                            }
                            if !nc.is_whitespace() { break; }
                        }
                        if !keep_on_line { processed.push('\n'); }
                    } else {
                        if c == '}' && !processed.ends_with('{') && !is_tight { processed.push(' '); }
                        processed.push(c);
                    }
                } else { processed.push(c); }
            }
            ',' => {
                processed.push(',');
                if expand_stack.last() == Some(&true) {
                    let next_non_ws = peek_next_non_whitespace(iter);
                    if next_non_ws == '{' || next_non_ws == '(' || next_non_ws == '[' { processed.push(' '); }
                    else { processed.push('\n'); }
                } else { processed.push(' '); }
            }
            ':' => {
                if iter.peek() == Some(&':') {
                    iter.next();
                    let in_multi = *traversal_expand_stack.last().unwrap_or(&false);
                    let is_in_expression = bracket_stack.iter().any(|&b| b == '(' || b == '[');
                    let is_multi_step = is_multi_step_chain(iter, in_multi, is_in_expression);
                    if is_multi_step {
                        if let Some(top) = traversal_expand_stack.last_mut() { *top = true; }
                        if !processed.ends_with('\n') {
                            trim_trailing_spaces(&mut processed);
                            processed.push('\n');
                        }
                    } else {
                        trim_trailing_spaces(&mut processed);
                        if processed.ends_with('\n') {
                            while processed.ends_with(' ') || processed.ends_with('\n') { processed.pop(); }
                        }
                        let p_trimmed = processed.trim_end();
                        if p_trimmed.ends_with("<-") || p_trimmed.ends_with('=') || p_trimmed.ends_with("RETURN") { processed.push(' '); }
                    }
                    processed.push_str("::");
                } else {
                    processed.push(':');
                    if iter.peek() != Some(&' ') && iter.peek() != Some(&':') { processed.push(' '); }
                }
            }
            '\n' => {
                let next_non_ws = peek_next_non_whitespace(iter);
                if next_non_ws == ':' {
                    let mut look_colon = iter.clone();
                    while let Some(nc) = look_colon.next() { if nc == ':' { break; } }
                    if look_colon.peek() == Some(&':') {
                        let mut look_chain = look_colon.clone();
                        look_chain.next();
                        let mut nesting = 0;
                        let mut is_multi = false;
                        let mut total_length = 0;
                        while let Some(nc) = look_chain.next() {
                            total_length += 1;
                            match nc {
                                '{' | '(' | '[' => nesting += 1,
                                '}' | ')' | ']' => { if nesting == 0 { break; } nesting -= 1; }
                                ':' if nesting == 0 && look_chain.peek() == Some(&':') => { is_multi = true; break; }
                                ';' if nesting == 0 => break,
                                '\n' if nesting == 0 => { if peek_next_non_whitespace(&mut look_chain) != ':' { break; } }
                                c if c.is_alphabetic() && nesting == 0 => {
                                    let word = peek_word(&mut look_chain);
                                    if is_terminator_keyword(&word) { break; }
                                    let next_nc = peek_next_non_whitespace(&mut look_chain);
                                    if next_nc == '<' || next_nc == '=' { break; }
                                }
                                _ => {}
                            }
                        }
                        if !(is_multi || total_length > CHAIN_EXPAND_THRESHOLD) && traversal_expand_stack.last() == Some(&false) {
                            if !processed.ends_with(' ') && !processed.is_empty() { processed.push(' '); }
                            continue;
                        }
                    }
                } else if next_non_ws == 'R' {
                    if peek_word(iter) == "RETURN" {
                        if let Some(top) = traversal_expand_stack.last_mut() { *top = false; }
                        if !processed.ends_with('\n') && !processed.is_empty() { processed.push('\n'); }
                        continue;
                    }
                }
                if (processed.ends_with('(') || processed.ends_with('[')) && next_non_ws == '{' 
                   || processed.ends_with('}') && (next_non_ws == ')' || next_non_ws == ']') {}
                else if expand_stack.last() == Some(&false) {
                    if !processed.ends_with(' ') && !processed.ends_with('(') && !processed.ends_with('[') && !processed.ends_with('{') { processed.push(' '); }
                } else if !processed.ends_with('\n') && !processed.is_empty() { processed.push('\n'); }
            }
            _ => {
                if c.is_whitespace() {
                    if is_terminator_keyword(&peek_word(iter)) {
                        if !processed.ends_with('\n') && !processed.is_empty() {
                            if let Some(top) = traversal_expand_stack.last_mut() { *top = false; }
                            processed.push('\n');
                            continue;
                        }
                    }
                    if !processed.is_empty() && !processed.ends_with('\n') && !processed.ends_with(' ') { processed.push(' '); }
                } else { processed.push(c); }
            }
        }
    }
    Ok(format_hql_lines(processed))
}

fn format_hql_lines(code: String) -> String {
    let mut output: Vec<String> = Vec::new();
    let lines = code.lines();
    let mut indent_level = 0;
    let mut comment_buffer: Vec<String> = Vec::new();
    let mut in_string_block = false;
    let mut quote_char_block = ' ';

    for line in lines {
        if in_string_block {
            let mut escaped = false;
            for c in line.chars() {
                if escaped { escaped = false; }
                else if c == '\\' { escaped = true; }
                else if c == quote_char_block { in_string_block = false; }
            }
            output.push(line.to_string());
            continue;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() { comment_buffer.push(String::new()); continue; }
        if trimmed.starts_with("//") || trimmed.starts_with("#") { comment_buffer.push(trimmed.to_string()); continue; }
        if (trimmed.starts_with('}') || trimmed.starts_with(']') || trimmed.starts_with(')')) && indent_level > 0 { indent_level -= 1; }
        if trimmed.starts_with("QUERY") || trimmed.starts_with("MIGRATION") {
            indent_level = 0;
            if !output.is_empty() && !output.last().unwrap_or(&String::new()).is_empty() {
                if !comment_buffer.first().map(|s| s.is_empty()).unwrap_or(false) {
                    if comment_buffer.is_empty() { output.push(String::new()); }
                    else { comment_buffer.insert(0, String::new()); }
                }
            }
        }        
        if trimmed.starts_with("RETURN") { indent_level = 1; }
        let mut actual_indent = indent_level;
        if trimmed.starts_with("::") { actual_indent += 1; }
        let current_indent = INDENT.repeat(actual_indent);
        for comment in comment_buffer.drain(..) {
            if comment.is_empty() { output.push(String::new()); }
            else { output.push(format!("{}{}", current_indent, comment)); }
        }
        output.push(format!("{}{}", current_indent, trimmed));

        let mut escaped = false;
        for c in trimmed.chars() {
            if in_string_block {
                if escaped { escaped = false; }
                else if c == '\\' { escaped = true; }
                else if c == quote_char_block { in_string_block = false; }
            } else if c == '"' || c == '\'' || c == '`' {
                in_string_block = true;
                quote_char_block = c;
            }
        }

        if !in_string_block {
            let effective_code = if let Some(idx) = trimmed.find("//") { &trimmed[..idx] }
                                else if let Some(idx) = trimmed.find('#') { &trimmed[..idx] }
                                else { trimmed }.trim();
            let mut sc_in_string = false;
            let mut sc_quote = ' ';
            let mut sc_escaped = false;
            let mut last_char = ' ';
            let mut last_char_in_string = false;
            for c in effective_code.chars() {
                 if sc_in_string {
                    if sc_escaped { sc_escaped = false; }
                    else if c == '\\' { sc_escaped = true; }
                    else if c == sc_quote { sc_in_string = false; }
                    last_char_in_string = true;
                    last_char = c;
                 } else if c == '"' || c == '\'' || c == '`' {
                    sc_in_string = true; sc_quote = c; last_char_in_string = true; last_char = c;
                 } else if !c.is_whitespace() { last_char = c; last_char_in_string = false; }
            }
            if !last_char_in_string && (last_char == '{' || last_char == '[' || last_char == '(' || effective_code.ends_with("=>")) {
                 if trimmed.starts_with("::") { indent_level = actual_indent + 1; }
                 else { indent_level += 1; }
            }
        }
    }
    for comment in comment_buffer {
        let current_indent = INDENT.repeat(indent_level);
        if comment.is_empty() { output.push(String::new()); }
        else { output.push(format!("{}{}", current_indent, comment)); }
    }
    output.join("\n").trim().to_string()
}

#[tauri::command]
pub fn get_vector_projections(vectors: Vec<Vec<f64>>) -> Result<Vec<Vec<f64>>, String> {
    if vectors.is_empty() { return Ok(Vec::new()); }
    let n = vectors.len();
    let d = vectors[0].len();
    for (i, v) in vectors.iter().enumerate() {
        if v.len() != d { return Err(format!("Vector at index {} has dimension {}, expected {}", i, v.len(), d)); }
    }
    if d < 2 {
        return Ok(vectors.iter().map(|v| {
            let mut out = v.clone();
            if out.len() == 1 { out.push(0.0); }
            out
        }).collect());
    }
    let mut means = vec![0.0; d];
    for v in &vectors { for i in 0..d { means[i] += v[i]; } }
    for i in 0..d { means[i] /= n as f64; }
    let mut centered = vectors.clone();
    for v in &mut centered { for i in 0..d { v[i] -= means[i]; } }

    fn power_iteration(data: &[Vec<f64>], num_iters: usize) -> Vec<f64> {
        let d = data[0].len();
        let mut v = vec![0.1; d];
        for _ in 0..num_iters {
            let mut next_v = vec![0.0; d];
            let mut x_v = vec![0.0; data.len()];
            for (i, row) in data.iter().enumerate() { for (j, &val) in row.iter().enumerate() { x_v[i] += val * v[j]; } }
            for (i, row) in data.iter().enumerate() { for (j, &val) in row.iter().enumerate() { next_v[j] += val * x_v[i]; } }
            let norm = next_v.iter().map(|x| x * x).sum::<f64>().sqrt();
            if norm < 1e-9 { break; }
            v = next_v.iter().map(|x| x / norm).collect();
        }
        v
    }
    let v1 = power_iteration(&centered, 20);
    let mut deflated = centered.clone();
    for i in 0..n {
        let dot = centered[i].iter().zip(v1.iter()).map(|(a, b)| a * b).sum::<f64>();
        for j in 0..d { deflated[i][j] -= dot * v1[j]; }
    }
    let v2 = power_iteration(&deflated, 20);
    let mut projection = Vec::with_capacity(n);
    for row in &centered {
        let x = row.iter().zip(v1.iter()).map(|(a, b)| a * b).sum::<f64>();
        let y = row.iter().zip(v2.iter()).map(|(a, b)| a * b).sum::<f64>();
        projection.push(vec![x, y]);
    }
    Ok(projection)
}
