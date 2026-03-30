use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(unix)]
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

pub struct PtyManager {
    #[cfg(unix)]
    sessions: Mutex<HashMap<String, PtySession>>,
}

#[cfg(unix)]
pub struct PtySession {
    pub master: Box<dyn portable_pty::MasterPty + Send>,
    pub child: Box<dyn portable_pty::Child + Send>,
    pub writer: Box<dyn std::io::Write + Send>,
    pub reader: Box<dyn std::io::Read + Send>,
}

#[cfg(unix)]
impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn spawn(
        &self,
        session_id: &str,
        binary: &str,
        args: &[String],
        cwd: &str,
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

        let mut cmd = CommandBuilder::new(binary);
        for arg in args {
            cmd.arg(arg);
        }
        cmd.cwd(cwd);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

        let session = PtySession {
            master: pair.master,
            child,
            writer,
            reader,
        };

        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(session_id.to_string(), session);

        Ok(())
    }

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

    pub fn kill(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.remove(session_id);
        Ok(())
    }

    pub fn is_running(&self, session_id: &str) -> bool {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.get_mut(session_id) {
                return session
                    .child
                    .try_wait()
                    .map(|r| r.is_none())
                    .unwrap_or(false);
            }
        }
        false
    }

    pub fn read_output(&self, session_id: &str) -> Result<String, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get_mut(session_id) {
            let mut buf = vec![0u8; 4096];
            match session.reader.read(&mut buf) {
                Ok(0) => Ok(String::new()),
                Ok(n) => Ok(String::from_utf8_lossy(&buf[..n]).to_string()),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Ok(String::new()),
                Err(e) => Err(format!("Read error: {}", e)),
            }
        } else {
            Err("Session not found".to_string())
        }
    }
}

#[cfg(not(unix))]
impl PtyManager {
    pub fn new() -> Self {
        Self {}
    }

    pub fn spawn(
        &self,
        _session_id: &str,
        _binary: &str,
        _args: &[String],
        _cwd: &str,
    ) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }

    pub fn write(&self, _session_id: &str, _data: &str) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }

    pub fn resize(&self, _session_id: &str, _rows: u16, _cols: u16) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }

    pub fn kill(&self, _session_id: &str) -> Result<(), String> {
        Err("PTY is only supported on Unix systems".to_string())
    }

    pub fn is_running(&self, _session_id: &str) -> bool {
        false
    }

    pub fn read_output(&self, _session_id: &str) -> Result<String, String> {
        Err("PTY is only supported on Unix systems".to_string())
    }
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}
