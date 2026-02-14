// helix_db imports refined 
use helix_db::protocol::value::Value;
use helix_db::helixc::parser::types::{
    Traversal, StartNode, StepType, GraphStepType, Expression, ExpressionType, 
    Object, FieldValue, FieldValueType, IdType, ValueType, BooleanOpType
};
use crate::tool_args::{ToolArgs, EdgeType, FilterProperties, FilterTraversal, Operator, Order};




#[derive(Debug, Clone, PartialEq)]
pub enum FinalAction {
    Collect { range: Option<(usize, Option<usize>)> }, // (start, end)
    Count,
    Aggregate { properties: Vec<String> },
    GroupBy { properties: Vec<String> },
} 

pub fn map_bm25_to_tool(bm25: &helix_db::helixc::parser::types::BM25Search) -> Result<ToolArgs, String> {
    let label = bm25.type_arg.clone().unwrap_or_default();
    let query = match &bm25.data {
        Some(vt) => vt.to_string(),
        None => return Err("SearchBM25 requires a query string".to_string()),
    };
    let limit = match &bm25.k {
        Some(ev) => match ev.value {
            helix_db::helixc::parser::types::EvaluatesToNumberType::I32(i) => i as usize,
            helix_db::helixc::parser::types::EvaluatesToNumberType::I64(i) => i as usize,
            _ => 10,
        },
        None => 10,
    };

    Ok(ToolArgs::SearchKeyword {
        query,
        limit,
        label,
    })
}

pub fn map_traversal_to_tools(traversal: &Traversal, params: &serde_json::Value) -> Result<(Vec<ToolArgs>, FinalAction, Vec<String>), String> {
    let mut tools = Vec::new();
    let mut final_action = FinalAction::Collect { range: None };
    let mut id_filters_out = Vec::new();

    // Map StartNode
    // IDs are handled separately (client-side filter or property-based re-filter).
    match &traversal.start {
        StartNode::Node { node_type, ids } => {
            tools.push(ToolArgs::NFromType { node_type: node_type.clone() });
            if let Some(ids) = ids {
                let (id_strings, props) = extract_ids_and_props(ids, params)?;
                // Return ID strings for caller to handle
                id_filters_out = id_strings;
                if !props.is_empty() {
                    tools.push(ToolArgs::FilterItems { 
                        filter: FilterTraversal {
                            properties: Some(vec![props]),
                            filter_traversals: None,
                        }
                    });
                }
            }
        }
        StartNode::Edge { edge_type, ids } => {
            tools.push(ToolArgs::EFromType { edge_type: edge_type.clone() });
            if let Some(ids) = ids {
                let (id_strings, props) = extract_ids_and_props(ids, params)?;
                id_filters_out = id_strings;
                if !props.is_empty() {
                    tools.push(ToolArgs::FilterItems { 
                        filter: FilterTraversal {
                            properties: Some(vec![props]),
                            filter_traversals: None,
                        }
                    });
                }
            }
        }
        StartNode::Vector { vector_type, ids } => {
            tools.push(ToolArgs::NFromType { node_type: vector_type.clone() });
            if let Some(ids) = ids {
                let (id_strings, props) = extract_ids_and_props(ids, params)?;
                id_filters_out = id_strings;
                if !props.is_empty() {
                    tools.push(ToolArgs::FilterItems { 
                        filter: FilterTraversal {
                            properties: Some(vec![props]),
                            filter_traversals: None,
                        }
                    });
                }
            }
        }
        StartNode::SearchVector(sv) => {
            tools.push(map_search_vector_to_tool(sv, params)?);
        }
        StartNode::Identifier(_) => {
        }
        StartNode::Anonymous => {} 
    }

    // Map Steps
    for (i, step) in traversal.steps.iter().enumerate() {
        match &step.step {
            StepType::Node(gs) | StepType::Edge(gs) => {
                 match &gs.step {
                     GraphStepType::Out(edge_type) => {
                         tools.push(ToolArgs::OutStep { 
                             edge_label: edge_type.clone(), 
                             edge_type: EdgeType::Node, 
                             filter: None 
                         });
                     }
                     GraphStepType::In(edge_type) => {
                         tools.push(ToolArgs::InStep { 
                             edge_label: edge_type.clone(), 
                             edge_type: EdgeType::Node, 
                             filter: None 
                         });
                     }
                     GraphStepType::OutE(edge_type) => {
                         tools.push(ToolArgs::OutEStep { 
                             edge_label: edge_type.clone(), 
                             filter: None 
                         });
                     }
                     GraphStepType::InE(edge_type) => {
                         tools.push(ToolArgs::InEStep { 
                             edge_label: edge_type.clone(), 
                             filter: None 
                         });
                     }
                     GraphStepType::SearchVector(sv) => {
                         tools.push(map_search_vector_to_tool(sv, params)?);
                     }
                     GraphStepType::FromN | GraphStepType::ToN => {
                         // Convert recent edge step to node step (MCP fusion)
                         let mut found = false;
                         for tool in tools.iter_mut().rev() {
                             match tool {
                                 ToolArgs::OutEStep { edge_label, filter } => {
                                     *tool = ToolArgs::OutStep { 
                                         edge_label: edge_label.clone(), 
                                         edge_type: EdgeType::Node, 
                                         filter: filter.clone() 
                                     };
                                     found = true;
                                     break;
                                 }
                                 ToolArgs::InEStep { edge_label, filter } => {
                                     *tool = ToolArgs::InStep { 
                                         edge_label: edge_label.clone(), 
                                         edge_type: EdgeType::Node, 
                                         filter: filter.clone() 
                                     };
                                     found = true;
                                     break;
                                 }
                                 ToolArgs::FilterItems { .. } => continue, // Skip filters to find the edge source
                                 _ => break, // Other tools break the fusion chain
                             }
                         }
                         if !found {
                             return Err("::ToN or ::FromN must follow an edge traversal step (like ::OutE or ::InE)".to_string());
                         }
                     }
                     _ => {} 
                 }
            }
            StepType::Where(expr) => {
                let filter = map_expression_to_filter(expr, params)?;
                tools.push(ToolArgs::FilterItems { filter });
            }
            StepType::OrderBy(order_by) => {
                let property = match &order_by.expression.expr {
                    ExpressionType::Identifier(id) => id.clone(),
                    ExpressionType::Traversal(t) => extract_property_from_traversal(t)?,
                    _ => return Err("ORDER BY currently only supports simple identifiers or _::{prop}".to_string()),
                };
                let order = match order_by.order_by_type {
                    helix_db::helixc::parser::types::OrderByType::Asc => Order::Asc,
                    helix_db::helixc::parser::types::OrderByType::Desc => Order::Desc,
                };
                tools.push(ToolArgs::OrderBy {
                    properties: property,
                    order,
                });
            }
            StepType::Count => {
                final_action = FinalAction::Count;
            }
            StepType::Aggregate(agg) => {
                final_action = FinalAction::Aggregate { 
                    properties: agg.properties.clone() 
                };
            }
            StepType::GroupBy(group) => {
                final_action = FinalAction::GroupBy { 
                    properties: group.properties.clone() 
                };
            }
            StepType::Range((start_expr, end_expr)) => {
                 let start = match extract_value(start_expr, params)? {
                     Value::I32(val) => val as usize,
                     Value::I64(val) => val as usize,
                     _ => 0,
                 };
                 let end = match extract_value(end_expr, params)? {
                     Value::I32(val) => Some(val as usize),
                     Value::I64(val) => Some(val as usize),
                     _ => None,
                 };
                 final_action = FinalAction::Collect { range: Some((start, end)) };
            }
            StepType::First => {
                final_action = FinalAction::Collect { range: Some((0, Some(1))) };
            }
            StepType::Object(obj) => {
                let filter = map_object_to_filter(obj, params)?;
                tools.push(ToolArgs::FilterItems { filter });
            }
            _ => return Err(format!("Unsupported step type at index {}: {:?}", i, step.step)),
        }
    }

    Ok((tools, final_action, id_filters_out))
}

fn map_expression_to_filter(expr: &Expression, params: &serde_json::Value) -> Result<FilterTraversal, String> {
    match &expr.expr {
        ExpressionType::And(exprs) => {
            let mut combined_dnf: Vec<Vec<FilterProperties>> = vec![vec![]]; 

            for e in exprs {
                let sub_filter = map_expression_to_filter(e, params)?;
                if let Some(sub_props) = sub_filter.properties {
                    let mut new_dnf = Vec::new();
                    for existing_and in &combined_dnf {
                        for sub_and in &sub_props {
                            let mut merged = existing_and.clone();
                            merged.extend(sub_and.clone());
                            new_dnf.push(merged);
                        }
                    }
                    combined_dnf = new_dnf;
                }
            }
            Ok(FilterTraversal {
                properties: Some(combined_dnf),
                filter_traversals: None, 
            })
        }
        ExpressionType::Or(exprs) => {
            let mut combined_dnf = Vec::new();
            for e in exprs {
                let sub_filter = map_expression_to_filter(e, params)?;
                if let Some(sub_props) = sub_filter.properties {
                    combined_dnf.extend(sub_props);
                }
            }
            Ok(FilterTraversal {
                properties: Some(combined_dnf),
                filter_traversals: None,
            })
        }
        ExpressionType::Traversal(boxed_traversal) => {
             let traversal = &**boxed_traversal;
             
             match traversal.start {
                 StartNode::Anonymous => {},
                 _ => return Err("WHERE clause traversal must start with anonymous node (_)".to_string()),
             }

             if traversal.steps.is_empty() {
                 return Err("WHERE clause traversal too short".to_string());
             }

             // Try to map as a property comparison first (the common case: _::Object({prop})::BooleanOp(val))
             if traversal.steps.len() >= 2 {
                 if let StepType::Object(obj) = &traversal.steps[0].step {
                     if obj.fields.len() == 1 {
                         if let StepType::BooleanOperation(op) = &traversal.steps[1].step {
                             let prop_key = obj.fields[0].key.clone();
                             let (operator, value) = match &op.op {
                                 BooleanOpType::Equal(e) => (Operator::Eq, extract_value(e, params)?),
                                 BooleanOpType::NotEqual(e) => (Operator::Neq, extract_value(e, params)?),
                                 BooleanOpType::GreaterThan(e) => (Operator::Gt, extract_value(e, params)?),
                                 BooleanOpType::GreaterThanOrEqual(e) => (Operator::Gte, extract_value(e, params)?),
                                 BooleanOpType::LessThan(e) => (Operator::Lt, extract_value(e, params)?),
                                 BooleanOpType::LessThanOrEqual(e) => (Operator::Lte, extract_value(e, params)?),
                                 _ => return Err("Unsupported boolean operator in dynamic HQL".to_string()),
                             };

                             return Ok(FilterTraversal {
                                 properties: Some(vec![vec![FilterProperties {
                                     key: prop_key,
                                     value,
                                     operator: Some(operator),
                                 }]]),
                                 filter_traversals: None,
                             });
                         }
                     }
                 }
             }

             // Otherwise, treat as a recursive sub-traversal filter (e.g. _::Out("follow"))
             fn map_steps_to_recursive_filter(steps: &[helix_db::helixc::parser::types::Step], params: &serde_json::Value) -> Result<Option<FilterTraversal>, String> {
                 if steps.is_empty() { return Ok(None); }
                 
                 let step = &steps[0];
                 let tool = match &step.step {
                     StepType::Node(gs) | StepType::Edge(gs) => {
                         let next_filter = map_steps_to_recursive_filter(&steps[1..], params)?;
                         match &gs.step {
                             GraphStepType::Out(edge_label) => ToolArgs::OutStep { 
                                 edge_label: edge_label.clone(), 
                                 edge_type: EdgeType::Node, 
                                 filter: next_filter 
                             },
                             GraphStepType::In(edge_label) => ToolArgs::InStep { 
                                 edge_label: edge_label.clone(), 
                                 edge_type: EdgeType::Node, 
                                 filter: next_filter 
                             },
                             GraphStepType::OutE(edge_label) => ToolArgs::OutEStep { 
                                 edge_label: edge_label.clone(), 
                                 filter: next_filter 
                             },
                             GraphStepType::InE(edge_label) => ToolArgs::InEStep { 
                                 edge_label: edge_label.clone(), 
                                 filter: next_filter 
                             },
                             _ => return Err(format!("Unsupported graph step in filter: {:?}", gs.step)),
                         }
                     },
                     _ => return Err(format!("Unsupported step type in filter chain: {:?}", step.step)),
                 };

                 Ok(Some(FilterTraversal {
                     properties: None,
                     filter_traversals: Some(vec![tool]),
                 }))
             }

             let filter_traversal = map_steps_to_recursive_filter(&traversal.steps, params)?;
             Ok(filter_traversal.unwrap_or_default())
        }
        _ => Err(format!("Unsupported expression type in WHERE: {:?}", expr.expr)),
    }
}

fn extract_value(expr: &Expression, params: &serde_json::Value) -> Result<Value, String> {
    match &expr.expr {
        ExpressionType::StringLiteral(s) => Ok(Value::String(s.clone())),
        ExpressionType::IntegerLiteral(i) => Ok(Value::I32(*i)),
        ExpressionType::FloatLiteral(f) => Ok(Value::F64(*f)),
        ExpressionType::BooleanLiteral(b) => Ok(Value::Boolean(*b)),
        ExpressionType::Identifier(s) => {
            if let Some(val) = params.get(s) {
                match val {
                    serde_json::Value::String(vs) => Ok(Value::String(vs.clone())),
                    serde_json::Value::Number(vn) => {
                        if let Some(i) = vn.as_i64() {
                            Ok(Value::I32(i as i32))
                        } else if let Some(f) = vn.as_f64() {
                            Ok(Value::F64(f))
                        } else {
                            Ok(Value::String(vn.to_string()))
                        }
                    }
                    serde_json::Value::Bool(vb) => Ok(Value::Boolean(*vb)),
                    _ => Ok(Value::String(val.to_string())),
                }
            } else {
                Ok(Value::String(s.clone()))
            }
        },
        _ => Err(format!("Unsupported value type in WHERE comparison: {:?}", expr.expr)),
    }
}

fn map_object_to_filter(obj: &Object, params: &serde_json::Value) -> Result<FilterTraversal, String> {
    let mut props = Vec::new();
    for field in &obj.fields {
        let key = field.key.clone();
        let value = extract_field_value(&field.value, params)?;
        props.push(FilterProperties {
            key,
            value,
            operator: Some(Operator::Eq),
        });
    }
    let filter = FilterTraversal {
        properties: Some(vec![props]),
        filter_traversals: None,
    };
    Ok(filter)
}

fn extract_field_value(fv: &FieldValue, params: &serde_json::Value) -> Result<Value, String> {
    match &fv.value {
        FieldValueType::Literal(v) => Ok(v.clone()),
        FieldValueType::Expression(expr) => extract_value(expr, params),
        FieldValueType::Identifier(s) => {
            if let Some(val) = params.get(s) {
                match val {
                    serde_json::Value::String(vs) => Ok(Value::String(vs.clone())),
                    serde_json::Value::Number(vn) => {
                        if let Some(i) = vn.as_i64() {
                            Ok(Value::I32(i as i32))
                        } else if let Some(f) = vn.as_f64() {
                            Ok(Value::F64(f))
                        } else {
                            Ok(Value::String(vn.to_string()))
                        }
                    }
                    serde_json::Value::Bool(vb) => Ok(Value::Boolean(*vb)),
                    _ => Ok(Value::String(val.to_string())),
                }
            } else {
                Ok(Value::String(s.clone()))
            }
        },
        _ => Err(format!("Unsupported field value type: {:?}", fv.value)),
    }
}

fn extract_ids_and_props(ids: &[IdType], params: &serde_json::Value) -> Result<(Vec<String>, Vec<FilterProperties>), String> {
    let mut id_strings = Vec::new();
    let mut props = Vec::new();
    for id in ids {
        match id {
            IdType::Literal { value, .. } => {
                id_strings.push(value.trim_matches('"').to_string());
            }
            IdType::ByIndex { index, value, .. } => {
                let key = match &**index {
                    IdType::Identifier { value, .. } => value.clone(),
                    IdType::Literal { value, .. } => value.trim_matches('"').to_string(),
                    _ => continue,
                };
                let val = match &**value {
                    ValueType::Literal { value, .. } => value.clone(),
                    ValueType::Identifier { value, .. } => Value::String(value.clone()),
                    ValueType::Object { fields: _, .. } => {
                        // TODO: Handle nested object if needed
                        continue;
                    }
                };
                props.push(FilterProperties {
                    key,
                    value: val,
                    operator: Some(Operator::Eq),
                });
            }
            IdType::Identifier { value, .. } => {
                if let Some(val) = params.get(value) {
                    id_strings.push(val.as_str().unwrap_or(&val.to_string()).to_string());
                } else {
                    return Err(format!("Parameter '{}' is required but missing from arguments.", value));
                }
            }
        }
    }
    Ok((id_strings, props))
}

fn map_search_vector_to_tool(sv: &helix_db::helixc::parser::types::SearchVector, params: &serde_json::Value) -> Result<ToolArgs, String> {
    use helix_db::helixc::parser::types::{VectorData, EvaluatesToString, EvaluatesToNumberType};
    
    let label = sv.vector_type.clone().unwrap_or_default();
    let k = match &sv.k {
        Some(ev) => match ev.value {
            EvaluatesToNumberType::I32(i) => i as usize,
            EvaluatesToNumberType::I64(i) => i as usize,
            _ => 10,
        },
        None => 10,
    };

    match &sv.data {
        Some(VectorData::Vector(v)) => Ok(ToolArgs::SearchVec {
            vector: v.clone(),
            k,
            min_score: None,
            cutoff: None,
        }),
        Some(VectorData::Embed(embed)) => {
            let query = match &embed.value {
                EvaluatesToString::StringLiteral(s) => s.clone(),
                EvaluatesToString::Identifier(s) => {
                    if let Some(val) = params.get(s) {
                        val.as_str().unwrap_or(&val.to_string()).to_string()
                    } else {
                        s.clone()
                    }
                }
            };
            Ok(ToolArgs::SearchVecText {
                query,
                label,
                k,
            })
        }
        _ => Err("Unsupported vector search data".to_string()),
    }
}

fn extract_property_from_traversal(traversal: &Traversal) -> Result<String, String> {
    if traversal.steps.len() == 1 {
        if let StepType::Object(obj) = &traversal.steps[0].step {
            if obj.fields.len() == 1 {
                return Ok(obj.fields[0].key.clone());
            }
        }
    }
    Err("Only simple property access like _::{prop} is supported here".to_string())
}

pub fn resolve_traversal<'a>(
    name: &str, 
    assignments: &std::collections::HashMap<String, &'a Traversal>
) -> Result<Option<Traversal>, String> {
    resolve_traversal_recursive(name, assignments, 0)
}

fn resolve_traversal_recursive<'a>(
    name: &str, 
    assignments: &std::collections::HashMap<String, &'a Traversal>,
    depth: usize
) -> Result<Option<Traversal>, String> {
    if depth > 20 {
        return Err(format!("Circular dependency or too deep recursion detected at '{}'", name));
    }

    let t = match assignments.get(name) {
        Some(t) => *t,
        None => return Ok(None),
    };

    let mut resolved = t.clone();

    if let StartNode::Identifier(id) = &resolved.start {
        let parent_t = resolve_traversal_recursive(id, assignments, depth + 1)?
            .ok_or_else(|| format!("Variable '{}' not found", id))?;
        
        let mut all_steps = parent_t.steps.clone();
        all_steps.extend(resolved.steps);
        resolved.start = parent_t.start;
        resolved.steps = all_steps;
    }

    Ok(Some(resolved))
}

pub fn normalize_value(v: serde_json::Value) -> serde_json::Value {
    match v {
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.into_iter().map(normalize_value).collect())
        }
        serde_json::Value::Object(mut map) => {
            if let Some(serde_json::Value::Object(props)) = map.remove("properties") {                
                for (k, v) in props {
                    map.insert(k, v);
                }
            }
            map.remove("out_edges");
            map.remove("in_edges");
            map.remove("vectors");
            map.remove("version");
            
            for (_, v) in map.iter_mut() {
                *v = normalize_value(v.clone());
            }
            
            serde_json::Value::Object(map)
        }
        _ => v,
    }
}
