use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

#[cfg(unix)]
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::{AppHandle, Emitter, Manager};

pub struct PtyManager {
    #[cfg(unix)]
    sessions: std::sync::Mutex<HashMap<String, PtySession>>,
    app_handle: Option<AppHandle>,
}

#[cfg(unix)]
pub struct PtySession {
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub child: Box<dyn portable_pty::Child + Send>,
    pub writer: Box<dyn std::io::Write + Send>,
    pub read_thread: Option<JoinHandle<()>>,
    pub stop_tx: Sender<()>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            #[cfg(unix)]
            sessions: std::sync::Mutex::new(HashMap::new()),
            app_handle: None,
        }
    }

    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    #[cfg(unix)]
    pub fn spawn(
        &self,
        session_id: String,
        binary: String,
        args: Vec<String>,
        cwd: String,
    ) -> Result<(), String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new(&binary);
        for arg in &args {
            cmd.arg(arg);
        }
        cmd.cwd(&cwd);

        // -- Sanitize Environment Variables --
        // To prevent VSCode/Fig shell integrations from bleeding into our PTY:
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "Akira");
        cmd.env_remove("VSCODE_INJECTION");
        cmd.env_remove("VSCODE_IPC_HOOK_CLI");
        cmd.env_remove("VSCODE_RESOLVING_ENVIRONMENT");
        cmd.env_remove("FIG_TERM");
        
        // Restore original ZDOTDIR if VSCode hijacked it for shell integration, otherwise remove it
        if std::env::var("VSCODE_INJECTION").is_ok() {
            if let Ok(user_zdotdir) = std::env::var("USER_ZDOTDIR") {
                cmd.env("ZDOTDIR", user_zdotdir);
            } else {
                cmd.env_remove("ZDOTDIR");
            }
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        // Set master PTY to non-blocking mode
        if let Some(fd) = pair.master.as_raw_fd() {
            let flags = unsafe { libc::fcntl(fd, libc::F_GETFL, 0) };
            if flags >= 0 {
                unsafe {
                    libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
                }
            }
        }

        let (stop_tx, stop_rx): (Sender<()>, Receiver<()>) = mpsc::channel();
        let session_id_clone = session_id.clone();
        let app_handle = self.app_handle.clone();

        // Spawn a thread to continuously read output and emit events
        let read_thread = thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                // Check if we should stop
                if stop_rx.try_recv().is_ok() {
                    break;
                }

                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - process exited
                        if let Some(ref handle) = app_handle {
                            let _ = handle.emit(&format!("pty-exit-{}", session_id_clone), ());
                        }
                        break;
                    }
                    Ok(n) => {
                        let output = String::from_utf8_lossy(&buf[..n]).to_string();
                        if let Some(ref handle) = app_handle {
                            let _ =
                                handle.emit(&format!("pty-output-{}", session_id_clone), output);
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        // No data available, sleep briefly
                        thread::sleep(std::time::Duration::from_millis(5));
                    }
                    Err(e) => {
                        eprintln!("[PTY] Read error: {}", e);
                        break;
                    }
                }
            }
        });

        let session = PtySession {
            master: pair.master,
            child,
            writer,
            read_thread: Some(read_thread),
            stop_tx,
        };

        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        
        // Prevent zombie processes and duplicate output loops by killing any existing session with this ID before overwrite
        if let Some(mut existing) = sessions.remove(&session_id) {
            let _ = existing.stop_tx.send(());
            let _ = existing.child.kill();
        }

        sessions.insert(session_id, session);

        Ok(())
    }

    #[cfg(not(unix))]
    pub fn spawn(
        &self,
        _session_id: String,
        _binary: String,
        _args: Vec<String>,
        _cwd: String,
    ) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }

    #[cfg(unix)]
    pub fn write(&self, session_id: &str, data: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get_mut(session_id) {
            session
                .writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("Write error: {}", e))?;
            session
                .writer
                .flush()
                .map_err(|e| format!("Flush error: {}", e))?;
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    }

    #[cfg(not(unix))]
    pub fn write(&self, _session_id: &str, _data: &str) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }

    #[cfg(unix)]
    pub fn resize(&self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get(session_id) {
            session
                .master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|e| format!("Resize error: {}", e))?;
            Ok(())
        } else {
            Err("Session not found".to_string())
        }
    }

    #[cfg(not(unix))]
    pub fn resize(&self, _session_id: &str, _rows: u16, _cols: u16) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }

    #[cfg(unix)]
    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut session) = sessions.remove(session_id) {
            // Signal the read thread to stop
            let _ = session.stop_tx.send(());
            let _ = session.child.kill();
            // Wait for read thread to finish
            if let Some(handle) = session.read_thread {
                let _ = handle.join();
            }
        }
        Ok(())
    }

    #[cfg(not(unix))]
    pub fn kill(&self, _session_id: &str) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}
