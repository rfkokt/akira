use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProviderStatus {
    Idle,
    Running,
    Error,
    TokenLimitReached,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderInfo {
    pub alias: String,
    pub binary_path: String,
    pub model: String,
    pub args: Vec<String>,
    pub enabled: bool,
    pub status: ProviderStatus,
    pub current_task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub total_tokens: usize,
    pub estimated_cost: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostStats {
    pub provider_alias: String,
    pub total_requests: i64,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost: f64,
    pub last_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionContext {
    pub session_id: String,
    pub task_id: String,
    pub provider_alias: String,
    pub messages: Vec<ContextMessage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouterConfig {
    pub auto_switch_enabled: bool,
    pub token_limit_threshold: usize,
    pub fallback_order: Vec<String>,
}

impl Default for RouterConfig {
    fn default() -> Self {
        Self {
            auto_switch_enabled: true,
            token_limit_threshold: 150_000,
            fallback_order: vec![
                "claude".to_string(),
                "opencode".to_string(),
                "zai".to_string(),
                "gemini".to_string(),
            ],
        }
    }
}

pub trait AgentBackend: Send + Sync {
    fn get_alias(&self) -> &str;
    fn get_binary_path(&self) -> &str;
    fn get_model(&self) -> &str;
    fn get_args(&self) -> &[String];
    fn is_enabled(&self) -> bool;

    fn build_command(&self, prompt: &str, cwd: &str) -> Command;

    fn parse_stream_output(&self, line: &str) -> Option<ParsedOutput>;

    fn estimate_cost(&self, input_tokens: usize, output_tokens: usize) -> f64;

    fn detect_token_limit(&self, output: &str) -> bool;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedOutput {
    pub content: String,
    pub is_complete: bool,
    pub is_error: bool,
    pub token_count: Option<usize>,
}

pub struct CliProcessManager {
    running_processes: Mutex<HashMap<String, Arc<Mutex<Child>>>>,
    should_stop_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl CliProcessManager {
    pub fn new() -> Self {
        Self {
            running_processes: Mutex::new(HashMap::new()),
            should_stop_flags: Mutex::new(HashMap::new()),
        }
    }

    pub fn spawn(
        &self,
        task_id: &str,
        mut cmd: Command,
        on_output: impl Fn(String, bool) + Clone + Send + 'static,
        on_complete: impl Fn(bool, Option<i32>, Option<String>) + Send + 'static,
    ) -> Result<(), String> {
        let task_id = task_id.to_string();

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let stop_flag = Arc::new(AtomicBool::new(false));

        let child_arc = Arc::new(Mutex::new(child));

        {
            let mut processes = self.running_processes.lock().map_err(|e| e.to_string())?;
            processes.insert(task_id.clone(), Arc::clone(&child_arc));
        }

        {
            let mut flags = self.should_stop_flags.lock().map_err(|e| e.to_string())?;
            flags.insert(task_id.clone(), Arc::clone(&stop_flag));
        }

        let stdout = {
            let mut lock = child_arc.lock().map_err(|e| e.to_string())?;
            lock.stdout.take()
        };

        let stderr = {
            let mut lock = child_arc.lock().map_err(|e| e.to_string())?;
            lock.stderr.take()
        };

        let flag_clone = Arc::clone(&stop_flag);
        let on_output_clone = on_output.clone();

        std::thread::spawn(move || {
            if let Some(stdout) = stdout {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if flag_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    match line {
                        Ok(line) => on_output_clone(line, false),
                        Err(_) => break,
                    }
                }
            }
        });

        let flag_clone = Arc::clone(&stop_flag);
        let on_output_clone2 = on_output.clone();

        std::thread::spawn(move || {
            if let Some(stderr) = stderr {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if flag_clone.load(Ordering::Relaxed) {
                        break;
                    }
                    match line {
                        Ok(line) => on_output_clone2(line, true),
                        Err(_) => break,
                    }
                }
            }
        });

        let flag_clone = Arc::clone(&stop_flag);

        std::thread::spawn(move || {
            let status = child_arc.lock().unwrap().wait();

            flag_clone.store(true, Ordering::Relaxed);

            match status {
                Ok(exit_status) => {
                    on_complete(
                        exit_status.success(),
                        exit_status.code(),
                        if exit_status.success() {
                            None
                        } else {
                            Some(format!(
                                "Process exited with code: {:?}",
                                exit_status.code()
                            ))
                        },
                    );
                }
                Err(e) => {
                    on_complete(false, None, Some(e.to_string()));
                }
            }
        });

        Ok(())
    }

    pub fn stop(&self, task_id: &str) -> Result<(), String> {
        let flag = {
            let mut flags = self.should_stop_flags.lock().map_err(|e| e.to_string())?;
            if let Some(flag) = flags.remove(task_id) {
                flag.store(true, Ordering::Relaxed);
                Some(flag)
            } else {
                None
            }
        };

        if let Some(process_arc) = {
            let mut processes = self.running_processes.lock().map_err(|e| e.to_string())?;
            processes.remove(task_id)
        } {
            let mut process = process_arc.lock().map_err(|e| e.to_string())?;
            let _ = process.kill();
        }

        Ok(())
    }

    pub fn is_running(&self, task_id: &str) -> bool {
        if let Ok(processes) = self.running_processes.lock() {
            if let Some(process_arc) = processes.get(task_id) {
                if let Ok(mut process) = process_arc.lock() {
                    return process.try_wait().ok().flatten().is_none();
                }
            }
        }
        false
    }
}

impl Default for CliProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

pub struct CliRouter {
    providers: Mutex<Vec<ProviderInfo>>,
    process_manager: Arc<CliProcessManager>,
    config: Mutex<RouterConfig>,
    context_store: Arc<Mutex<HashMap<String, SessionContext>>>,
}

impl CliRouter {
    pub fn new() -> Self {
        Self {
            providers: Mutex::new(Vec::new()),
            process_manager: Arc::new(CliProcessManager::new()),
            config: Mutex::new(RouterConfig::default()),
            context_store: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn add_provider(&self, provider: ProviderInfo) {
        if let Ok(mut providers) = self.providers.lock() {
            if !providers.iter().any(|p| p.alias == provider.alias) {
                providers.push(provider);
            }
        }
    }

    pub fn remove_provider(&self, alias: &str) {
        if let Ok(mut providers) = self.providers.lock() {
            providers.retain(|p| p.alias != alias);
        }
    }

    pub fn get_enabled_providers(&self) -> Vec<ProviderInfo> {
        self.providers
            .lock()
            .map(|p| p.iter().filter(|p| p.enabled).cloned().collect())
            .unwrap_or_default()
    }

    pub fn get_provider(&self, alias: &str) -> Option<ProviderInfo> {
        self.providers
            .lock()
            .ok()
            .and_then(|p| p.iter().find(|p| p.alias == alias).cloned())
    }

    pub fn update_provider_status(&self, alias: &str, status: ProviderStatus) {
        if let Ok(mut providers) = self.providers.lock() {
            if let Some(provider) = providers.iter_mut().find(|p| p.alias == alias) {
                provider.status = status;
            }
        }
    }

    pub fn update_provider_task(&self, alias: &str, task_id: Option<String>) {
        if let Ok(mut providers) = self.providers.lock() {
            if let Some(provider) = providers.iter_mut().find(|p| p.alias == alias) {
                provider.current_task_id = task_id;
            }
        }
    }

    pub fn get_config(&self) -> RouterConfig {
        self.config.lock().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn update_config(&self, config: RouterConfig) {
        if let Ok(mut cfg) = self.config.lock() {
            *cfg = config;
        }
    }

    pub fn create_session(&self, task_id: &str, provider_alias: &str) -> String {
        let session_id = Uuid::new_v4().to_string();
        let now = chrono_lite_now();

        let context = SessionContext {
            session_id: session_id.clone(),
            task_id: task_id.to_string(),
            provider_alias: provider_alias.to_string(),
            messages: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        };

        if let Ok(mut store) = self.context_store.lock() {
            store.insert(session_id.clone(), context);
        }

        session_id
    }

    pub fn get_session(&self, session_id: &str) -> Option<SessionContext> {
        self.context_store
            .lock()
            .ok()
            .and_then(|s| s.get(session_id).cloned())
    }

    pub fn add_message_to_session(&self, session_id: &str, role: &str, content: &str) {
        if let Ok(mut store) = self.context_store.lock() {
            if let Some(context) = store.get_mut(session_id) {
                let msg = ContextMessage {
                    id: context.messages.len() as i64 + 1,
                    role: role.to_string(),
                    content: content.to_string(),
                    timestamp: chrono_lite_now(),
                };
                context.messages.push(msg);
                context.updated_at = chrono_lite_now();
            }
        }
    }

    pub fn get_session_messages(&self, session_id: &str) -> Vec<ContextMessage> {
        self.get_session(session_id)
            .map(|s| s.messages)
            .unwrap_or_default()
    }

    pub fn transfer_context(
        &self,
        from_session: &str,
        to_provider: &str,
    ) -> Result<String, String> {
        let messages = self.get_session_messages(from_session);

        let from_context = self
            .get_session(from_session)
            .ok_or("Source session not found")?;

        let new_session_id = Uuid::new_v4().to_string();
        let now = chrono_lite_now();

        let mut context = SessionContext {
            session_id: new_session_id.clone(),
            task_id: from_context.task_id.clone(),
            provider_alias: to_provider.to_string(),
            messages: Vec::new(),
            created_at: now.clone(),
            updated_at: now,
        };

        let mut full_context = String::new();
        full_context.push_str("## Previous Conversation Context (from different provider)\n\n");
        for msg in &messages {
            full_context.push_str(&format!("**{}**:\n{}\n\n", msg.role, msg.content));
        }

        let transfer_msg = ContextMessage {
            id: 0,
            role: "system".to_string(),
            content: format!(
                "Context transferred from {}. Previous conversation history is provided below for continuity.",
                from_context.provider_alias
            ),
            timestamp: chrono_lite_now(),
        };
        context.messages.push(transfer_msg);
        context.updated_at = chrono_lite_now();

        if let Ok(mut store) = self.context_store.lock() {
            store.insert(new_session_id.clone(), context);
        }

        Ok(full_context)
    }

    pub fn find_next_provider(&self, current_alias: &str) -> Option<ProviderInfo> {
        let enabled = self.get_enabled_providers();

        if enabled.len() <= 1 {
            return None;
        }

        let current_idx = enabled.iter().position(|p| p.alias == current_alias)?;

        for i in 1..enabled.len() {
            let next_idx = (current_idx + i) % enabled.len();
            if enabled[next_idx].status != ProviderStatus::TokenLimitReached {
                return Some(enabled[next_idx].clone());
            }
        }

        for provider in enabled.iter().skip(current_idx + 1) {
            if provider.status != ProviderStatus::TokenLimitReached {
                return Some(provider.clone());
            }
        }

        enabled.get((current_idx + 1) % enabled.len()).cloned()
    }

    pub fn should_auto_switch(&self, provider_alias: &str, current_tokens: usize) -> bool {
        let config = self.get_config();

        if !config.auto_switch_enabled {
            return false;
        }

        if current_tokens >= config.token_limit_threshold {
            return true;
        }

        if let Some(provider) = self.get_provider(provider_alias) {
            if provider.status == ProviderStatus::TokenLimitReached {
                return true;
            }
        }

        false
    }

    pub fn process_manager(&self) -> &Arc<CliProcessManager> {
        &self.process_manager
    }
}

impl Default for CliRouter {
    fn default() -> Self {
        Self::new()
    }
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    let days = secs / 86400;
    let years = days / 365 + 1970;
    let remaining_days = days % 365;
    let months = remaining_days / 30;
    let day = remaining_days % 30;
    let hours = (secs % 86400) / 3600;
    let minutes = (secs % 3600) / 60;
    let seconds = secs % 60;

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
        years,
        months + 1,
        day + 1,
        hours,
        minutes,
        seconds
    )
}

pub struct ClaudeCodeBackend {
    pub alias: String,
    pub binary_path: String,
    pub model: String,
    pub args: Vec<String>,
}

impl ClaudeCodeBackend {
    pub fn new(alias: String, binary_path: String, model: String, args: Vec<String>) -> Self {
        Self {
            alias,
            binary_path,
            model,
            args,
        }
    }
}

impl AgentBackend for ClaudeCodeBackend {
    fn get_alias(&self) -> &str {
        &self.alias
    }

    fn get_binary_path(&self) -> &str {
        &self.binary_path
    }

    fn get_model(&self) -> &str {
        &self.model
    }

    fn get_args(&self) -> &[String] {
        &self.args
    }

    fn is_enabled(&self) -> bool {
        true
    }

    fn build_command(&self, prompt: &str, cwd: &str) -> Command {
        let mut cmd = Command::new(&self.binary_path);
        for arg in &self.args {
            cmd.arg(arg);
        }
        cmd.arg(prompt);
        cmd.current_dir(cwd);
        cmd
    }

    fn parse_stream_output(&self, line: &str) -> Option<ParsedOutput> {
        if line.starts_with("```json") || line.starts_with('{') {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(text) = json
                    .get("text")
                    .or(json.get("content"))
                    .or(json.get("message"))
                {
                    return Some(ParsedOutput {
                        content: text.to_string(),
                        is_complete: json.get("done").and_then(|v| v.as_bool()).unwrap_or(false),
                        is_error: false,
                        token_count: json
                            .get("tokens")
                            .or(json.get("token_count"))
                            .and_then(|v| v.as_u64())
                            .map(|v| v as usize),
                    });
                }
            }
        }

        Some(ParsedOutput {
            content: line.to_string(),
            is_complete: false,
            is_error: false,
            token_count: None,
        })
    }

    fn estimate_cost(&self, input_tokens: usize, output_tokens: usize) -> f64 {
        let input_cost = (input_tokens as f64 / 1_000_000.0) * 3.0;
        let output_cost = (output_tokens as f64 / 1_000_000.0) * 15.0;
        input_cost + output_cost
    }

    fn detect_token_limit(&self, output: &str) -> bool {
        let limit_indicators = [
            "token limit",
            "maximum tokens",
            "context window",
            "rate limit",
            "quota exceeded",
            "too many tokens",
            "exceeds the maximum",
        ];

        let lower = output.to_lowercase();
        limit_indicators.iter().any(|ind| lower.contains(ind))
    }
}

pub struct OpenCodeBackend {
    pub alias: String,
    pub binary_path: String,
    pub args: Vec<String>,
}

impl OpenCodeBackend {
    pub fn new(alias: String, binary_path: String, args: Vec<String>) -> Self {
        Self {
            alias,
            binary_path,
            args,
        }
    }
}

impl AgentBackend for OpenCodeBackend {
    fn get_alias(&self) -> &str {
        &self.alias
    }

    fn get_binary_path(&self) -> &str {
        &self.binary_path
    }

    fn get_model(&self) -> &str {
        ""
    }

    fn get_args(&self) -> &[String] {
        &self.args
    }

    fn is_enabled(&self) -> bool {
        true
    }

    fn build_command(&self, prompt: &str, cwd: &str) -> Command {
        let mut cmd = Command::new(&self.binary_path);
        for arg in &self.args {
            cmd.arg(arg);
        }
        cmd.arg(prompt);
        cmd.current_dir(cwd);
        cmd
    }

    fn parse_stream_output(&self, line: &str) -> Option<ParsedOutput> {
        Some(ParsedOutput {
            content: line.to_string(),
            is_complete: false,
            is_error: false,
            token_count: None,
        })
    }

    fn estimate_cost(&self, input_tokens: usize, output_tokens: usize) -> f64 {
        let total_tokens = input_tokens + output_tokens;
        (total_tokens as f64 / 1_000_000.0) * 0.5
    }

    fn detect_token_limit(&self, output: &str) -> bool {
        let limit_indicators = [
            "token limit",
            "context length",
            "maximum context",
            "exceeds limit",
        ];

        let lower = output.to_lowercase();
        limit_indicators.iter().any(|ind| lower.contains(ind))
    }
}

pub struct GenericBackend {
    pub alias: String,
    pub binary_path: String,
    pub args: Vec<String>,
}

impl GenericBackend {
    pub fn new(alias: String, binary_path: String, args: Vec<String>) -> Self {
        Self {
            alias,
            binary_path,
            args,
        }
    }
}

impl AgentBackend for GenericBackend {
    fn get_alias(&self) -> &str {
        &self.alias
    }

    fn get_binary_path(&self) -> &str {
        &self.binary_path
    }

    fn get_model(&self) -> &str {
        ""
    }

    fn get_args(&self) -> &[String] {
        &self.args
    }

    fn is_enabled(&self) -> bool {
        true
    }

    fn build_command(&self, prompt: &str, cwd: &str) -> Command {
        let mut cmd = Command::new(&self.binary_path);
        for arg in &self.args {
            cmd.arg(arg);
        }
        cmd.arg(prompt);
        cmd.current_dir(cwd);
        cmd
    }

    fn parse_stream_output(&self, line: &str) -> Option<ParsedOutput> {
        Some(ParsedOutput {
            content: line.to_string(),
            is_complete: false,
            is_error: false,
            token_count: None,
        })
    }

    fn estimate_cost(&self, _input_tokens: usize, _output_tokens: usize) -> f64 {
        0.0
    }

    fn detect_token_limit(&self, output: &str) -> bool {
        let lower = output.to_lowercase();
        lower.contains("token limit") || lower.contains("context window")
    }
}

pub fn create_backend_from_engine(
    engine: &crate::cli_router::queries::Engine,
) -> Box<dyn AgentBackend> {
    match engine.alias.as_str() {
        "claude" | "claude-code" => Box::new(ClaudeCodeBackend::new(
            engine.alias.clone(),
            engine.binary_path.clone(),
            engine.model.clone(),
            engine
                .args
                .split_whitespace()
                .map(|s| s.to_string())
                .collect(),
        )),
        "opencode" => Box::new(OpenCodeBackend::new(
            engine.alias.clone(),
            engine.binary_path.clone(),
            engine
                .args
                .split_whitespace()
                .map(|s| s.to_string())
                .collect(),
        )),
        _ => Box::new(GenericBackend::new(
            engine.alias.clone(),
            engine.binary_path.clone(),
            engine
                .args
                .split_whitespace()
                .map(|s| s.to_string())
                .collect(),
        )),
    }
}
