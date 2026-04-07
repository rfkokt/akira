use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::{atomic::AtomicBool, Arc, Mutex};

use crate::cli_router_core::CliRouter;
use crate::pty_manager::PtyManager;

// Global state with database and running process
#[allow(dead_code)]
pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub running_process: Mutex<Option<Arc<Mutex<Child>>>>,
    pub should_stop: Mutex<HashMap<String, Arc<AtomicBool>>>,
    pub rtk_path: Mutex<Option<PathBuf>>,
    pub cli_router: Arc<CliRouter>,
    pub pty_manager: Arc<std::sync::RwLock<PtyManager>>,
}

impl AppState {
    pub fn new(
        db: rusqlite::Connection,
        cli_router: Arc<CliRouter>,
        pty_manager: PtyManager,
    ) -> Self {
        Self {
            db: Mutex::new(db),
            running_process: Mutex::new(None),
            should_stop: Mutex::new(HashMap::new()),
            rtk_path: Mutex::new(None),
            cli_router,
            pty_manager: Arc::new(std::sync::RwLock::new(pty_manager)),
        }
    }
}
