use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Engine {
    pub id: i64,
    pub alias: String,
    pub binary_path: String,
    pub model: String,
    pub args: String,
    pub enabled: bool,
    pub created_at: String,
}

#[allow(dead_code)]
pub fn get_all_engines(conn: &Connection) -> Result<Vec<Engine>> {
    let mut stmt = conn.prepare(
        "SELECT id, alias, binary_path, model, args, enabled, created_at FROM engines ORDER BY alias"
    )?;

    let engines = stmt.query_map([], |row| {
        Ok(Engine {
            id: row.get(0)?,
            alias: row.get(1)?,
            binary_path: row.get(2)?,
            model: row.get(3)?,
            args: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
        })
    })?;

    engines.collect()
}

pub fn get_enabled_engines(conn: &Connection) -> Result<Vec<Engine>> {
    let mut stmt = conn.prepare(
        "SELECT id, alias, binary_path, model, args, enabled, created_at 
         FROM engines WHERE enabled = 1 ORDER BY alias",
    )?;

    let engines = stmt.query_map([], |row| {
        Ok(Engine {
            id: row.get(0)?,
            alias: row.get(1)?,
            binary_path: row.get(2)?,
            model: row.get(3)?,
            args: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            created_at: row.get(6)?,
        })
    })?;

    engines.collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterSession {
    pub id: String,
    pub task_id: String,
    pub provider_alias: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn create_session(conn: &Connection, task_id: &str, provider_alias: &str) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();

    conn.execute(
        "INSERT INTO router_sessions (id, task_id, provider_alias, updated_at)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)",
        params![id, task_id, provider_alias],
    )?;

    Ok(id)
}

pub fn get_session(conn: &Connection, session_id: &str) -> Result<Option<RouterSession>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, provider_alias, created_at, updated_at 
         FROM router_sessions WHERE id = ?1",
    )?;

    let session = stmt.query_row([session_id], |row| {
        Ok(RouterSession {
            id: row.get(0)?,
            task_id: row.get(1)?,
            provider_alias: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    });

    match session {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn get_task_sessions(conn: &Connection, task_id: &str) -> Result<Vec<RouterSession>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, provider_alias, created_at, updated_at 
         FROM router_sessions WHERE task_id = ?1 ORDER BY created_at DESC",
    )?;

    let sessions = stmt.query_map([task_id], |row| {
        Ok(RouterSession {
            id: row.get(0)?,
            task_id: row.get(1)?,
            provider_alias: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;

    sessions.collect()
}

pub fn update_session_provider(
    conn: &Connection,
    session_id: &str,
    provider_alias: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE router_sessions SET provider_alias = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![provider_alias, session_id],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn delete_session(conn: &Connection, session_id: &str) -> Result<()> {
    conn.execute("DELETE FROM router_sessions WHERE id = ?1", [session_id])?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMessage {
    pub id: i64,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub token_count: Option<i64>,
    pub created_at: String,
}

pub fn add_context_message(
    conn: &Connection,
    session_id: &str,
    role: &str,
    content: &str,
    token_count: Option<i64>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO router_context (session_id, role, content, token_count)
         VALUES (?1, ?2, ?3, ?4)",
        params![session_id, role, content, token_count],
    )?;

    conn.execute(
        "UPDATE router_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        [session_id],
    )?;

    Ok(conn.last_insert_rowid())
}

pub fn get_session_messages(conn: &Connection, session_id: &str) -> Result<Vec<ContextMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, token_count, created_at 
         FROM router_context 
         WHERE session_id = ?1 
         ORDER BY created_at ASC",
    )?;

    let messages = stmt.query_map([session_id], |row| {
        Ok(ContextMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            token_count: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;

    messages.collect()
}

#[allow(dead_code)]
pub fn get_session_message_count(conn: &Connection, session_id: &str) -> Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM router_context WHERE session_id = ?1",
        [session_id],
        |row| row.get(0),
    )
}

#[allow(dead_code)]
pub fn clear_session_messages(conn: &Connection, session_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM router_context WHERE session_id = ?1",
        [session_id],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct CostRecord {
    pub id: i64,
    pub provider_alias: String,
    pub session_id: Option<String>,
    pub task_id: Option<String>,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost: f64,
    pub model: Option<String>,
    pub created_at: String,
}

pub fn record_cost(
    conn: &Connection,
    provider_alias: &str,
    input_tokens: i64,
    output_tokens: i64,
    cost: f64,
    session_id: Option<&str>,
    task_id: Option<&str>,
    model: Option<&str>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO router_cost_tracking (provider_alias, session_id, task_id, input_tokens, output_tokens, cost, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![provider_alias, session_id, task_id, input_tokens, output_tokens, cost, model],
    )?;

    Ok(conn.last_insert_rowid())
}

#[allow(dead_code)]
pub fn get_provider_cost_stats(conn: &Connection, provider_alias: &str) -> Result<CostRecord> {
    conn.query_row(
        "SELECT id, provider_alias, session_id, task_id, input_tokens, output_tokens, cost, model, created_at
         FROM router_cost_tracking 
         WHERE provider_alias = ?1 
         ORDER BY created_at DESC 
         LIMIT 1",
        [provider_alias],
        |row| {
            Ok(CostRecord {
                id: row.get(0)?,
                provider_alias: row.get(1)?,
                session_id: row.get(2)?,
                task_id: row.get(3)?,
                input_tokens: row.get(4)?,
                output_tokens: row.get(5)?,
                cost: row.get(6)?,
                model: row.get(7)?,
                created_at: row.get(8)?,
            })
        },
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCostSummary {
    pub provider_alias: String,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost: f64,
    pub last_used: Option<String>,
}

pub fn get_all_provider_costs(conn: &Connection) -> Result<Vec<ProviderCostSummary>> {
    let mut stmt = conn.prepare(
        "SELECT 
            provider_alias,
            COUNT(*) as total_requests,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(cost), 0.0) as total_cost,
            MAX(created_at) as last_used
         FROM router_cost_tracking
         GROUP BY provider_alias
         ORDER BY total_cost DESC",
    )?;

    let summaries = stmt.query_map([], |row| {
        Ok(ProviderCostSummary {
            provider_alias: row.get(0)?,
            total_requests: row.get(1)?,
            total_input_tokens: row.get(2)?,
            total_output_tokens: row.get(3)?,
            total_cost: row.get(4)?,
            last_used: row.get(5)?,
        })
    })?;

    summaries.collect()
}

#[allow(dead_code)]
pub fn get_task_cost_summary(conn: &Connection, task_id: &str) -> Result<ProviderCostSummary> {
    conn.query_row(
        "SELECT 
            provider_alias,
            COUNT(*) as total_requests,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(cost), 0.0) as total_cost,
            MAX(created_at) as last_used
         FROM router_cost_tracking
         WHERE task_id = ?1
         GROUP BY provider_alias
         ORDER BY total_cost DESC
         LIMIT 1",
        [task_id],
        |row| {
            Ok(ProviderCostSummary {
                provider_alias: row.get(0)?,
                total_requests: row.get(1)?,
                total_input_tokens: row.get(2)?,
                total_output_tokens: row.get(3)?,
                total_cost: row.get(4)?,
                last_used: row.get(5)?,
            })
        },
    )
}

#[allow(dead_code)]
pub fn get_cost_by_date_range(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<ProviderCostSummary>> {
    let mut stmt = conn.prepare(
        "SELECT 
            provider_alias,
            COUNT(*) as total_requests,
            COALESCE(SUM(input_tokens), 0) as total_input_tokens,
            COALESCE(SUM(output_tokens), 0) as total_output_tokens,
            COALESCE(SUM(cost), 0.0) as total_cost,
            MAX(created_at) as last_used
         FROM router_cost_tracking
         WHERE created_at BETWEEN ?1 AND ?2
         GROUP BY provider_alias
         ORDER BY total_cost DESC",
    )?;

    let summaries = stmt.query_map([start_date, end_date], |row| {
        Ok(ProviderCostSummary {
            provider_alias: row.get(0)?,
            total_requests: row.get(1)?,
            total_input_tokens: row.get(2)?,
            total_output_tokens: row.get(3)?,
            total_cost: row.get(4)?,
            last_used: row.get(5)?,
        })
    })?;

    summaries.collect()
}

pub fn get_total_cost(conn: &Connection) -> Result<f64> {
    conn.query_row(
        "SELECT COALESCE(SUM(cost), 0.0) as total FROM router_cost_tracking",
        [],
        |row| row.get(0),
    )
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterConfig {
    pub id: i64,
    pub auto_switch_enabled: bool,
    pub confirm_before_switch: bool,
    pub token_limit_threshold: i64,
    pub fallback_order: String,
    pub budget_limit: f64,
    pub budget_alert_threshold: f64,
    pub updated_at: String,
}

pub fn get_router_config(conn: &Connection) -> Result<Option<RouterConfig>> {
    let mut stmt = conn.prepare(
        "SELECT id, auto_switch_enabled, confirm_before_switch, token_limit_threshold, fallback_order, 
                COALESCE(budget_limit, 0) as budget_limit, COALESCE(budget_alert_threshold, 0.8) as budget_alert_threshold, updated_at 
         FROM router_config LIMIT 1",
    )?;

    let config = stmt.query_row([], |row| {
        Ok(RouterConfig {
            id: row.get(0)?,
            auto_switch_enabled: row.get::<_, i64>(1)? != 0,
            confirm_before_switch: row.get::<_, i64>(2)? != 0,
            token_limit_threshold: row.get(3)?,
            fallback_order: row.get(4)?,
            budget_limit: row.get(5)?,
            budget_alert_threshold: row.get(6)?,
            updated_at: row.get(7)?,
        })
    });

    match config {
        Ok(c) => Ok(Some(c)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn save_router_config(
    conn: &Connection,
    auto_switch_enabled: bool,
    confirm_before_switch: bool,
    token_limit_threshold: i64,
    fallback_order: &str,
    budget_limit: f64,
    budget_alert_threshold: f64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO router_config (auto_switch_enabled, confirm_before_switch, token_limit_threshold, fallback_order, budget_limit, budget_alert_threshold, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
             auto_switch_enabled = excluded.auto_switch_enabled,
             confirm_before_switch = excluded.confirm_before_switch,
             token_limit_threshold = excluded.token_limit_threshold,
             fallback_order = excluded.fallback_order,
             budget_limit = excluded.budget_limit,
             budget_alert_threshold = excluded.budget_alert_threshold,
             updated_at = CURRENT_TIMESTAMP",
        params![auto_switch_enabled as i64, confirm_before_switch as i64, token_limit_threshold, fallback_order, budget_limit, budget_alert_threshold],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SwitchHistory {
    pub id: i64,
    pub task_id: String,
    pub from_provider: String,
    pub to_provider: String,
    pub reason: String,
    pub created_at: String,
}

pub fn record_provider_switch(
    conn: &Connection,
    task_id: &str,
    from_provider: &str,
    to_provider: &str,
    reason: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO router_switch_history (task_id, from_provider, to_provider, reason)
         VALUES (?1, ?2, ?3, ?4)",
        params![task_id, from_provider, to_provider, reason],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_task_switch_history(conn: &Connection, task_id: &str) -> Result<Vec<SwitchHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, task_id, from_provider, to_provider, reason, created_at
         FROM router_switch_history
         WHERE task_id = ?1
         ORDER BY created_at DESC",
    )?;

    let history = stmt.query_map([task_id], |row| {
        Ok(SwitchHistory {
            id: row.get(0)?,
            task_id: row.get(1)?,
            from_provider: row.get(2)?,
            to_provider: row.get(3)?,
            reason: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;

    history.collect()
}
