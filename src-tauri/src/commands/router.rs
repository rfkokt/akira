use crate::cli_router::queries;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterProviderInfo {
    pub alias: String,
    pub model: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterConfig {
    pub auto_switch_enabled: bool,
    pub confirm_before_switch: bool,
    pub token_limit_threshold: i64,
    pub fallback_order: String,
    pub budget_limit: f64,
    pub budget_alert_threshold: f64,
}

#[tauri::command]
pub fn get_router_providers(state: State<AppState>) -> Result<Vec<RouterProviderInfo>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let engines = queries::get_enabled_engines(&conn).map_err(|e| e.to_string())?;

    Ok(engines
        .into_iter()
        .map(|e| RouterProviderInfo {
            alias: e.alias,
            model: e.model,
            enabled: e.enabled,
        })
        .collect())
}

#[tauri::command]
pub fn sync_engines_to_router(_state: State<AppState>) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn get_router_config(state: State<AppState>) -> Result<Option<RouterConfig>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::get_router_config(&conn)
        .map(|opt| {
            opt.map(|c| RouterConfig {
                auto_switch_enabled: c.auto_switch_enabled,
                confirm_before_switch: c.confirm_before_switch,
                token_limit_threshold: c.token_limit_threshold,
                fallback_order: c.fallback_order.clone(),
                budget_limit: c.budget_limit,
                budget_alert_threshold: c.budget_alert_threshold,
            })
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_router_config(state: State<AppState>, config: RouterConfig) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::save_router_config(
        &conn,
        config.auto_switch_enabled,
        config.confirm_before_switch,
        config.token_limit_threshold,
        &config.fallback_order,
        config.budget_limit,
        config.budget_alert_threshold,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn record_cli_cost(
    state: State<AppState>,
    provider_alias: String,
    input_tokens: i64,
    output_tokens: i64,
    cost: f64,
) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    queries::record_cost(
        &conn,
        &provider_alias,
        input_tokens,
        output_tokens,
        cost,
        None, // session_id
        None, // task_id
        None, // model
    )
    .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderCostData {
    pub provider_alias: String,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost: f64,
}

#[tauri::command]
pub fn get_provider_costs(state: State<AppState>) -> Result<Vec<ProviderCostData>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Get all cost records and aggregate by provider
    let mut stmt = conn
        .prepare(
            "SELECT provider_alias, COUNT(*) as total_requests, 
                SUM(input_tokens) as total_input, 
                SUM(output_tokens) as total_output,
                SUM(cost) as total_cost
         FROM router_cost_tracking 
         GROUP BY provider_alias",
        )
        .map_err(|e| e.to_string())?;

    let costs: Vec<ProviderCostData> = stmt
        .query_map([], |row| {
            Ok(ProviderCostData {
                provider_alias: row.get(0)?,
                total_requests: row.get(1)?,
                total_input_tokens: row.get(2)?,
                total_output_tokens: row.get(3)?,
                total_cost: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(costs)
}
