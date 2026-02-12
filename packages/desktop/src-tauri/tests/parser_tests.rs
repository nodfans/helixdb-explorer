use helixdb_explorer_lib::hql_translator::{ClientSideFilter, FinalAction, map_traversal_to_tools, map_bm25_to_tool};
use helixdb_explorer_lib::mcp_protocol::{ToolArgs, EdgeType, Order, Operator};
use helix_db::helixc::parser::HelixParser;
use helix_db::helixc::parser::types::{ExpressionType, StatementType, Traversal};
use helix_db::protocol::value::Value;
use std::io::Write;

pub fn write_to_temp_file(content: Vec<&str>) -> helix_db::helixc::parser::types::Content {
    let mut files = Vec::new();
    for c in content {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        file.write_all(c.as_bytes()).unwrap();
        let path = file.path().to_string_lossy().into_owned();
        files.push(helix_db::helixc::parser::types::HxFile {
            name: path,
            content: c.to_string(),
        });
    }
    helix_db::helixc::parser::types::Content {
        content: String::new(),
        files,
        source: Default::default(),
    }
}

fn translate(hql: &str) -> (Vec<ToolArgs>, ClientSideFilter, FinalAction) {
    let content = write_to_temp_file(vec![hql]);
    let source = HelixParser::parse_source(&content).expect(&format!("Parse failed for:\n{}", hql));
    let query = source.queries.first().expect("No query");
    
    let mut last_stmt_tools = None;
    for stmt in &query.statements {
        match &stmt.statement {
            StatementType::Assignment(a) => {
                match &a.value.expr {
                    ExpressionType::Traversal(t) => {
                        last_stmt_tools = Some(map_traversal_to_tools(t).expect("Mapping failed"));
                    }
                    ExpressionType::BM25Search(b) => {
                        let tool = map_bm25_to_tool(b).expect("Mapping failed");
                        last_stmt_tools = Some((vec![tool], ClientSideFilter::default(), FinalAction::Collect { range: None }));
                    }
                    ExpressionType::SearchVector(_) => {
                        let inner_sv = match &a.value.expr {
                            ExpressionType::SearchVector(sv) => sv.clone(),
                            _ => unreachable!(),
                        };
                        let (tools, filter, action) = map_traversal_to_tools(&Traversal {
                            start: helix_db::helixc::parser::types::StartNode::SearchVector(inner_sv),
                            steps: vec![],
                            loc: a.value.loc.clone(),
                        }).expect("Mapping failed");
                        last_stmt_tools = Some((tools, filter, action));
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    last_stmt_tools.expect("No mappable assignment found in test query")
}

#[test]
fn test_query_get_all_users() {
    let (tools, _, _) = translate("QUERY GetAllUsers () => user <- N<User> RETURN user");
    assert_eq!(tools.len(), 1);
    match &tools[0] {
        ToolArgs::NFromType { node_type } => assert_eq!(node_type, "User"),
        _ => panic!("Expected NFromType"),
    }
}

#[test]
fn test_query_get_all_posts() {
    let (tools, _, _) = translate("QUERY GetAllPosts () => post <- N<Post> RETURN post");
    assert_eq!(tools.len(), 1);
    match &tools[0] {
        ToolArgs::NFromType { node_type } => assert_eq!(node_type, "Post"),
        _ => panic!("Expected NFromType"),
    }
}

#[test]
fn test_query_get_all_comments() {
    let (tools, _, _) = translate("QUERY GetAllComments () => comment <- N<Comment> RETURN comment");
    assert_eq!(tools.len(), 1);
    match &tools[0] {
        ToolArgs::NFromType { node_type } => assert_eq!(node_type, "Comment"),
        _ => panic!("Expected NFromType"),
    }
}

#[test]
fn test_query_get_user_by_id() {
    let (tools, filter, _) = translate("QUERY GetUserById(user_id: ID) => user <- N<User>(\"xxxx\") RETURN user");
    assert_eq!(tools.len(), 1);
    match &tools[0] {
        ToolArgs::NFromType { node_type } => assert_eq!(node_type, "User"),
        _ => panic!("Expected NFromType"),
    }
    // Verify ID filter
    assert_eq!(filter.id_filter, Some(vec!["xxxx".to_string()]));
}

#[test]
fn test_query_filter_age_gt_50() {
    let (tools, _, _) = translate("QUERY filter_age_gt_50() => users <- N<User>::WHERE(_::{age}::GT(50)) RETURN users");
    assert_eq!(tools.len(), 2);
    match &tools[1] {
        ToolArgs::FilterItems { filter } => {
            let props = &filter.properties.as_ref().unwrap()[0][0];
            assert_eq!(props.key, "age");
            assert_eq!(props.operator, Some(Operator::Gt));
        }
        _ => panic!("Expected FilterItems"),
    }
}

#[test]
fn test_query_filter_high_score() {
    let (tools, _, _) = translate("QUERY filter_high_score() => users <- N<User>::WHERE(_::{score}::GT(90.0)) RETURN users");
    assert_eq!(tools.len(), 2);
    // score > 90.0
}

#[test]
fn test_query_filter_young_users() {
     let (tools, _, _) = translate("QUERY filter_young_users() => users <- N<User>::WHERE(_::{age}::LT(25)) RETURN users");
     // age < 25
     assert_eq!(tools.len(), 2);
}

#[test]
fn test_query_filter_score_range_70_80() {
    let (tools, _, _) = translate("QUERY filter_score_range_70_80() => users <- N<User>::WHERE(AND(_::{score}::GTE(70.0), _::{score}::LT(80.0))) RETURN users");
    assert_eq!(tools.len(), 2);
    match &tools[1] {
        ToolArgs::FilterItems { filter } => {
            let dnf = filter.properties.as_ref().expect("Missing properties");
            assert_eq!(dnf.len(), 1); // AND group
            assert_eq!(dnf[0].len(), 2); // 2 conditions
        }
        _ => panic!("Expected FilterItems"),
    }
}

#[test]
fn test_query_filter_active_high_performers() {
    let (tools, _, _) = translate("QUERY filter_active_high_performers() => users <- N<User>::WHERE(AND(_::{active}::EQ(true), _::{score}::GT(85.0))) RETURN users");
    assert_eq!(tools.len(), 2);
    // active=true AND score>85.0
}

#[test]
fn test_query_filter_inactive_or_senior() {
    let (tools, _, _) = translate("QUERY filter_inactive_or_senior() => users <- N<User>::WHERE(OR(_::{active}::EQ(false), _::{age}::GT(55))) RETURN users");
    match &tools[1] {
        ToolArgs::FilterItems { filter } => {
            let dnf = filter.properties.as_ref().expect("Missing properties");
            assert_eq!(dnf.len(), 2); // OR group (2 separate entries in DNF)
        }
        _ => panic!("Expected FilterItems"),
    }
}

#[test]
fn test_query_filter_age_20_or_21() {
    let (tools, _, _) = translate("QUERY filter_age_20_or_21() => users <- N<User>::WHERE(OR(_::{age}::EQ(20), _::{age}::EQ(21))) RETURN users");
    match &tools[1] {
        ToolArgs::FilterItems { filter } => {
            let dnf = filter.properties.as_ref().expect("Missing properties");
            assert_eq!(dnf.len(), 2); 
        }
        _ => panic!("Expected FilterItems"),
    }
}

#[test]
fn test_query_filter_age_30_to_40() {
    let (tools, _, _) = translate("QUERY filter_age_30_to_40() => users <- N<User>::WHERE(AND(_::{age}::GTE(30), _::{age}::LTE(40))) RETURN users");
    match &tools[1] {
        ToolArgs::FilterItems { filter } => {
            let dnf = filter.properties.as_ref().expect("Missing properties");
            assert_eq!(dnf.len(), 1); 
            assert_eq!(dnf[0].len(), 2);
        }
        _ => panic!("Expected FilterItems"),
    }
}

#[test]
fn test_query_get_users_by_age_asc() {
    let (tools, _, _) = translate("QUERY get_users_by_age_asc() => users <- N<User>::ORDER<Asc>(_::{age}) RETURN users");
    match &tools[1] {
        ToolArgs::OrderBy { properties, order } => {
            assert_eq!(properties, "age");
            assert_eq!(order, &Order::Asc);
        }
        _ => panic!("Expected OrderBy"),
    }
}

#[test]
fn test_query_get_users_by_score_desc() {
     let (tools, _, _) = translate("QUERY get_users_by_score_desc() => users <- N<User>::ORDER<Desc>(_::{score}) RETURN users");
     match &tools[1] {
        ToolArgs::OrderBy { properties, order } => {
            assert_eq!(properties, "score");
            assert_eq!(order, &Order::Desc);
        }
        _ => panic!("Expected OrderBy"),
    }
}

#[test]
fn test_query_get_users_by_name_asc() {
    let (tools, _, _) = translate("QUERY get_users_by_name_asc() => users <- N<User>::ORDER<Asc>(_::{name}) RETURN users");
    match &tools[1] {
        ToolArgs::OrderBy { properties, order } => {
            assert_eq!(properties, "name");
            assert_eq!(order, &Order::Asc);
        }
        _ => panic!("Expected OrderBy"),
    }
}

#[test]
fn test_query_get_first_5_users() {
     let (_, _, action) = translate("QUERY get_first_5_users() => users <- N<User>::RANGE(0, 5) RETURN users");
     assert_eq!(action, FinalAction::Collect { range: Some((0, Some(5))) });
}

#[test]
fn test_query_get_users_page_2() {
     let (tools, _, action) = translate("QUERY get_users_page_2() => users <- N<User>::RANGE(5, 10) RETURN users");
     assert_eq!(action, FinalAction::Collect { range: Some((5, Some(10))) });
}

#[test]
fn test_query_get_first_user() {
     let (_, _, action) = translate("QUERY get_first_user() => user <- N<User>::FIRST RETURN user");
     assert_eq!(action, FinalAction::Collect { range: Some((0, Some(1))) });
}

#[test]
fn test_query_count_all_users() {
    let (_, _, action) = translate("QUERY count_all_users() => count <- N<User>::COUNT RETURN count");
    assert_eq!(action, FinalAction::Count);
}

#[test]
fn test_query_aggregate_user_stats() {
    let (_, _, action) = translate("QUERY aggregate_user_stats() => stats <- N<User>::AGGREGATE_BY(age, score) RETURN stats");
    match action {
        FinalAction::Aggregate { properties } => {
            assert_eq!(properties, vec!["age", "score"]);
        }
        _ => panic!("Expected Aggregate"),
    }
}

#[test]
fn test_query_aggregate_by_score() {
    let (_, _, action) = translate("QUERY aggregate_by_score() => stats <- N<User>::AGGREGATE_BY(score) RETURN stats");
    match action {
        FinalAction::Aggregate { properties } => {
             assert_eq!(properties, vec!["score"]);
        }
        _ => panic!("Expected Aggregate"),
    }
}

#[test]
fn test_query_group_by_active() {
    let (_, _, action) = translate("QUERY group_by_active() => result <- N<User>::GROUP_BY(active) RETURN result");
    match action {
        FinalAction::GroupBy { properties } => {
            assert_eq!(properties, vec!["active"]);
        }
        _ => panic!("Expected GroupBy"),
    }
}

#[test]
fn test_query_group_by_age() {
    let (_, _, action) = translate("QUERY group_by_age() => result <- N<User>::GROUP_BY(age) RETURN result");
    match action {
        FinalAction::GroupBy { properties } => {
            assert_eq!(properties, vec!["age"]);
        }
        _ => panic!("Expected GroupBy"),
    }
}

#[test]
fn test_query_group_by_active_and_age() {
    let (_, _, action) = translate("QUERY group_by_active_and_age() => result <- N<User>::GROUP_BY(active, age) RETURN result");
    match action {
        FinalAction::GroupBy { properties } => {
            assert_eq!(properties, vec!["active", "age"]);
        }
        _ => panic!("Expected GroupBy"),
    }
}

#[test]
fn test_query_get_top_5_active_users() {
     let (tools, _, _) = translate("
        QUERY get_top_5_active_users() => 
            users <- N<User>
                ::WHERE(AND(_::{active}::EQ(true), _::{score}::GT(70.0)))
                ::ORDER<Desc>(_::{score})
                ::RANGE(0, 5)
            RETURN users
     ");
     assert!(tools.len() >= 3); // Where, Order, limit implied
}

#[test]
fn test_query_get_middle_aged_active_users() {
    let (tools, _, _) = translate("
        QUERY get_middle_aged_active_users() => 
            users <- N<User>
                ::WHERE(AND(_::{age}::GTE(25), AND(_::{age}::LTE(45), _::{active}::EQ(true))))
                ::ORDER<Asc>(_::{age})
            RETURN users
    ");
    assert!(tools.len() >= 2);
}

#[test]
fn test_query_get_low_score_or_senior() {
    let (tools, _, _) = translate("
        QUERY get_low_score_or_senior() => 
            users <- N<User>
                ::WHERE(OR(_::{score}::LT(60.0), _::{age}::GT(55)))
                ::ORDER<Desc>(_::{score})
            RETURN users
    ");
    assert!(tools.len() >= 2);
}

#[test]
fn test_query_get_top_2_inactive_users() {
    let (tools, _, _) = translate("
        QUERY get_top_2_inactive_users() => 
            users <- N<User>
                ::WHERE(_::{active}::EQ(false))
                ::ORDER<Desc>(_::{score})
                ::RANGE(0, 2)
            RETURN users
    ");
    assert!(tools.len() >= 2);
}

#[test]
fn test_query_get_age_21_by_score() {
    let (tools, _, _) = translate("
        QUERY get_age_21_by_score() => 
            users <- N<User>
                ::WHERE(_::{age}::EQ(21))
                ::ORDER<Desc>(_::{score})
            RETURN users
    ");
    assert!(tools.len() >= 2);
}

#[test]
fn test_query_get_middle_users_by_score() {
     let (tools, _, action) = translate("
        QUERY get_middle_users_by_score() => 
            users <- N<User>
                ::ORDER<Asc>(_::{score})
                ::RANGE(10, 15)
            RETURN users
     ");
     assert_eq!(action, FinalAction::Collect { range: Some((10, Some(15))) });
}

#[test]
fn test_query_count_active_users() {
    let (_, _, action) = translate("QUERY count_active_users() => count <- N<User>::WHERE(_::{active}::EQ(true))::COUNT RETURN count");
    assert_eq!(action, FinalAction::Count);
}

#[test]
fn test_query_count_high_scorers() {
     let (_, _, action) = translate("QUERY count_high_scorers() => count <- N<User>::WHERE(_::{score}::GT(80.0))::COUNT RETURN count");
     assert_eq!(action, FinalAction::Count);
}

#[test]
fn test_query_get_thirties_active_desc() {
     let (tools, _, _) = translate("
        QUERY get_thirties_active_desc() => 
            users <- N<User>
                ::WHERE(AND(_::{age}::GTE(30), AND(_::{age}::LTE(40), _::{active}::EQ(true))))
                ::ORDER<Desc>(_::{age})
            RETURN users
     ");
      match &tools[2] {
        ToolArgs::OrderBy { properties, order } => {
            assert_eq!(properties, "age");
            assert_eq!(order, &Order::Desc);
        }
        _ => panic!("Expected OrderBy"),
    }
}

#[test]
fn test_query_get_mid_range_scores() {
     let (_, _, action) = translate("
        QUERY get_mid_range_scores() => 
            users <- N<User>
                ::WHERE(AND(_::{score}::GTE(60.0), _::{score}::LT(80.0)))
                ::ORDER<Asc>(_::{score})
                ::RANGE(0, 3)
            RETURN users
     ");
     assert_eq!(action, FinalAction::Collect { range: Some((0, Some(3))) });
}

#[test]
fn test_query_get_active_mature_high_performers() {
     let (tools, _, _) = translate("
        QUERY get_active_mature_high_performers() => 
            users <- N<User>
                ::WHERE(AND(_::{active}::EQ(true), AND(_::{age}::GT(30), _::{score}::GT(75.0))))
                ::ORDER<Desc>(_::{score})
            RETURN users
     ");
     assert!(tools.len() >= 2);
}

#[test]
fn test_query_get_user_liked_posts() {
    let (tools, _, _) = translate("QUERY get_user_liked_posts(user_id: ID) => posts <- N<User>(\"xxxx\")::Out<LIKED> RETURN posts");
    assert_eq!(tools.len(), 2);
    match &tools[1] {
        ToolArgs::OutStep { edge_label, .. } => assert_eq!(edge_label, "LIKED"),
        _ => panic!("Expected OutStep"),
    }
}

#[test]
fn test_query_get_post_comments() {
    let (tools, _, _) = translate("QUERY get_post_comments(post_id: ID) => comments <- N<Post>(\"xxxx\")::In<ON> RETURN comments");
    assert_eq!(tools.len(), 2);
    match &tools[1] {
        ToolArgs::InStep { edge_label, .. } => assert_eq!(edge_label, "ON"),
        _ => panic!("Expected InStep"),
    }
}

#[test]
fn test_query_get_first_post_author() {
    let (tools, _, _) = translate("QUERY get_first_post_author(post_id: ID) => author <- N<Post>(\"xxxx\")::In<POSTED> RETURN author");
     match &tools[1] {
        ToolArgs::InStep { edge_label, .. } => assert_eq!(edge_label, "POSTED"),
        _ => panic!("Expected InStep"),
    }
}

#[test]
fn test_query_get_user_friends() {
    let (tools, _, _) = translate("QUERY get_user_friends(user_id: ID) => friends <- N<User>(\"xxxx\")::Out<FRIEND> RETURN friends");
     match &tools[1] {
        ToolArgs::OutStep { edge_label, .. } => assert_eq!(edge_label, "FRIEND"),
        _ => panic!("Expected OutStep"),
    }
}

#[test]
fn test_query_get_comment_author() {
    let (tools, _, _) = translate("QUERY get_comment_author(comment_id: ID) => author <- N<Comment>(\"xxxx\")::In<COMMENTED> RETURN author");
     match &tools[1] {
        ToolArgs::InStep { edge_label, .. } => assert_eq!(edge_label, "COMMENTED"),
        _ => panic!("Expected InStep"),
    }
}

#[test]
fn test_query_search_graph_posts() {
    let (tools, client_side_filter, _) = translate("QUERY search_graph_posts(limit: I64) => results <- SearchBM25<Post>(\"Graph\", 10) RETURN results");
    match &tools[0] {
        ToolArgs::SearchKeyword { query, label, limit } => {
            assert_eq!(query, "\"Graph\"");
            assert_eq!(label, "Post");
            assert_eq!(*limit, 10);
        }
        _ => panic!("Expected SearchKeyword"),
    }
}

#[test]
fn test_query_search_hql_posts() {
     let (tools, client_side_filter, _) = translate("QUERY search_hql_posts(limit: I64) => results <- SearchBM25<Post>(\"HQL\", 10) RETURN results");
      match &tools[0] {
        ToolArgs::SearchKeyword { query, label, limit } => {
            assert_eq!(query, "\"HQL\"");
            assert_eq!(label, "Post");
            assert_eq!(*limit, 10);
        }
        _ => panic!("Expected SearchKeyword"),
    }
}
