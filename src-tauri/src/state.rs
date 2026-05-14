use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::pi::PiProcessManager;
use crate::pty_manager::PtyManager;

// Global state with database and running process
#[allow(dead_code)]
pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
    pub rtk_path: Mutex<Option<PathBuf>>,
    pub pty_manager: Arc<std::sync::RwLock<PtyManager>>,
    pub pi_manager: Arc<PiProcessManager>,
    pub pi_binary_path: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new(
        db: Arc<Mutex<rusqlite::Connection>>,
        pty_manager: PtyManager,
        pi_manager: Arc<PiProcessManager>,
    ) -> Self {
        Self {
            db,
            rtk_path: Mutex::new(None),
            pty_manager: Arc::new(std::sync::RwLock::new(pty_manager)),
            pi_manager,
            pi_binary_path: Mutex::new(None),
        }
    }
}
