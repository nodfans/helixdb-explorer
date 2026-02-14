
use std::collections::HashSet;
use helix_db::helixc::parser::types::{
    Statement, StatementType, Expression, ExpressionType, Query, Traversal, StartNode, StepType, ReturnType,
    ValueType, IdType, FieldValue, FieldValueType
};
use helix_db::protocol::value::Value;

#[derive(Debug, Clone, Copy)]
pub enum LitType {
    String,
    Number,
    Boolean,
}

pub fn collect_dwim_info(query: &Query) -> (HashSet<String>, Vec<(std::ops::Range<usize>, LitType)>) {
    let mut used_ids = HashSet::new();
    let mut literals = Vec::new();

    for stmt in &query.statements {
        walk_statement(stmt, &mut used_ids, &mut literals);
    }
    for ret in &query.return_values {
        walk_return_type(ret, &mut used_ids, &mut literals);
    }

    (used_ids, literals)
}

pub fn walk_statement(stmt: &Statement, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &stmt.statement {
        StatementType::Assignment(a) => {
            walk_expression(&a.value, used, literals);
        }
        StatementType::Expression(e) => {
            walk_expression(e, used, literals);
        }
        StatementType::ForLoop(f) => {
            used.insert(f.in_variable.1.clone());
            for s in &f.statements {
                walk_statement(s, used, literals);
            }
        }
        _ => {}
    }
}

pub fn walk_expression(expr: &Expression, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &expr.expr {
        ExpressionType::Identifier(id) => {
            used.insert(id.clone());
        }
        ExpressionType::StringLiteral(_) => {
            literals.push((expr.loc.byte_range(), LitType::String));
        }
        ExpressionType::IntegerLiteral(_) | ExpressionType::FloatLiteral(_) => {
            literals.push((expr.loc.byte_range(), LitType::Number));
        }
        ExpressionType::BooleanLiteral(_) => {
            literals.push((expr.loc.byte_range(), LitType::Boolean));
        }
        ExpressionType::Traversal(t) => {
            walk_traversal(t, used, literals);
        }
        ExpressionType::ArrayLiteral(exprs) | ExpressionType::And(exprs) | ExpressionType::Or(exprs) => {
            for e in exprs {
                walk_expression(e, used, literals);
            }
        }
        ExpressionType::Not(e) => {
            walk_expression(e, used, literals);
        }
        ExpressionType::MathFunctionCall(m) => {
            for e in &m.args {
                walk_expression(e, used, literals);
            }
        }
        _ => {}
    }
}

pub fn walk_traversal(t: &Traversal, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &t.start {
        StartNode::Identifier(id) => {
            used.insert(id.clone());
        }
        StartNode::Node { ids, .. } | StartNode::Edge { ids, .. } | StartNode::Vector { ids, .. } => {
            if let Some(ids) = ids {
                for id in ids {
                    walk_id_type(id, used, literals);
                }
            }
        }
        _ => {}
    }
    for step in &t.steps {
        match &step.step {
            StepType::Where(e) => walk_expression(e, used, literals),
            StepType::OrderBy(o) => walk_expression(&o.expression, used, literals),
            StepType::Update(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            StepType::Upsert(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            StepType::UpsertN(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            StepType::UpsertE(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
                if let Some(fid) = &u.connection.from_id {
                    walk_id_type(fid, used, literals);
                }
                if let Some(tid) = &u.connection.to_id {
                    walk_id_type(tid, used, literals);
                }
            }
            StepType::UpsertV(u) => {
                for f in &u.fields {
                    walk_field_value(&f.value, used, literals);
                }
            }
            _ => {}
        }
    }
}

pub fn walk_field_value(fv: &FieldValue, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match &fv.value {
        FieldValueType::Traversal(t) => walk_traversal(t, used, literals),
        FieldValueType::Expression(e) => walk_expression(e, used, literals),
        FieldValueType::Fields(fields) => {
            for f in fields {
                walk_field_value(&f.value, used, literals);
            }
        }
        FieldValueType::Literal(v) => {
            match v {
                Value::String(_) => literals.push((fv.loc.byte_range(), LitType::String)),
                Value::Boolean(_) => literals.push((fv.loc.byte_range(), LitType::Boolean)),
                Value::I8(_) | Value::I16(_) | Value::I32(_) | Value::I64(_) |
                Value::U8(_) | Value::U16(_) | Value::U32(_) | Value::U64(_) | Value::U128(_) |
                Value::F32(_) | Value::F64(_) => literals.push((fv.loc.byte_range(), LitType::Number)),
                _ => {}
            }
        }
        FieldValueType::Identifier(id) => {
            used.insert(id.clone());
        }
        _ => {}
    }
}

fn walk_value_type(vt: &ValueType, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match vt {
        ValueType::Literal { value, loc } => {
            match value {
                Value::String(_) => literals.push((loc.byte_range(), LitType::String)),
                Value::Boolean(_) => literals.push((loc.byte_range(), LitType::Boolean)),
                Value::I8(_) | Value::I16(_) | Value::I32(_) | Value::I64(_) |
                Value::U8(_) | Value::U16(_) | Value::U32(_) | Value::U64(_) | Value::U128(_) |
                Value::F32(_) | Value::F64(_) => literals.push((loc.byte_range(), LitType::Number)),
                _ => {}
            }
        }
        ValueType::Identifier { value, .. } => {
            used.insert(value.clone());
        }
        ValueType::Object { fields, .. } => {
            for v in fields.values() {
                walk_value_type(v, used, literals);
            }
        }
    }
}

pub fn walk_id_type(it: &IdType, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match it {
        IdType::Literal { loc, .. } => {
            literals.push((loc.byte_range(), LitType::String));
        }
        IdType::Identifier { value, .. } => {
            used.insert(value.clone());
        }
        IdType::ByIndex { index, value, .. } => {
            walk_id_type(index, used, literals);
            walk_value_type(value, used, literals);
        }
    }
}

pub fn walk_return_type(ret: &ReturnType, used: &mut HashSet<String>, literals: &mut Vec<(std::ops::Range<usize>, LitType)>) {
    match ret {
        ReturnType::Expression(e) => walk_expression(e, used, literals),
        ReturnType::Array(rets) => {
            for r in rets {
                walk_return_type(r, used, literals);
            }
        }
        ReturnType::Object(map) => {
            for r in map.values() {
                walk_return_type(r, used, literals);
            }
        }
        _ => {}
    }
}
