use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::{atomic::AtomicBool, Arc, Mutex};

use crate::cli_router_core::CliRouter;
use crate::pty_manager::PtyManager;

// Global state with database and running process
#[allow(dead_code)]
pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub running_process: Mutex<Option<Arc<Mutex<Child>>>>,
    pub should_stop: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub rtk_path: Mutex<Option<PathBuf>>,
    pub cli_router: Arc<CliRouter>,
    pub pty_manager: Arc<std::sync::RwLock<PtyManager>>,
    pub mcp_manager: Arc<crate::mcp::McpConnectionManager>,
}

impl AppState {
    pub fn new(
        db: Arc<Mutex<rusqlite::Connection>>,
        cli_router: Arc<CliRouter>,
        pty_manager: PtyManager,
        mcp_manager: Arc<crate::mcp::McpConnectionManager>,
    ) -> Self {
        Self {
            db,
            running_process: Mutex::new(None),
            should_stop: Mutex::new(HashMap::new()),
            rtk_path: Mutex::new(None),
            cli_router,
            pty_manager: Arc::new(std::sync::RwLock::new(pty_manager)),
            mcp_manager,
        }
    }
}
