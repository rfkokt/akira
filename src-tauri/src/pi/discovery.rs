use std::env;
use std::fmt;
use std::path::{Path, PathBuf};

/// Errors that can occur during Pi binary discovery.
#[derive(Debug)]
pub enum PiDiscoveryError {
    /// Pi binary was not found in any searched location.
    NotFound { searched_locations: Vec<String> },
    /// Pi binary was found but is not executable.
    NotExecutable { path: PathBuf },
}

/// Trait for abstracting filesystem operations during binary discovery.
/// This enables property-based testing with mock filesystems.
pub trait FileSystemCheck {
    /// Check if a file exists at the given path.
    fn exists(&self, path: &Path) -> bool;
    /// Check if a file at the given path is executable.
    fn is_executable(&self, path: &Path) -> bool;
}

impl fmt::Display for PiDiscoveryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PiDiscoveryError::NotFound { searched_locations } => {
                write!(
                    f,
                    "Pi binary not found. Searched: {:?}",
                    searched_locations
                )
            }
            PiDiscoveryError::NotExecutable { path } => {
                write!(
                    f,
                    "Pi binary at {} is not executable",
                    path.display()
                )
            }
        }
    }
}

impl std::error::Error for PiDiscoveryError {}

/// Responsible for locating and validating the Pi binary on the system.
pub struct PiBinaryDiscovery;

impl PiBinaryDiscovery {
    /// Search for the `pi` binary in priority order:
    /// 1. System PATH
    /// 2. ~/.pi/bin
    /// 3. /usr/local/bin
    /// 4. ~/.local/bin
    ///
    /// Returns the first valid (exists + executable) path found.
    pub fn discover() -> Result<PathBuf, PiDiscoveryError> {
        let mut searched_locations: Vec<String> = Vec::new();

        // 1. Search system PATH
        if let Some(path_var) = env::var_os("PATH") {
            for dir in env::split_paths(&path_var) {
                let candidate = dir.join("pi");
                searched_locations.push(dir.to_string_lossy().to_string());
                if candidate.exists() {
                    Self::verify_executable(&candidate)?;
                    return Ok(candidate);
                }
            }
        }

        // 2. Search ~/.pi/bin
        if let Some(home) = dirs::home_dir() {
            let pi_bin_dir = home.join(".pi").join("bin");
            let candidate = pi_bin_dir.join("pi");
            searched_locations.push(pi_bin_dir.to_string_lossy().to_string());
            if candidate.exists() {
                Self::verify_executable(&candidate)?;
                return Ok(candidate);
            }
        }

        // 3. Search /usr/local/bin
        {
            let dir = PathBuf::from("/usr/local/bin");
            let candidate = dir.join("pi");
            searched_locations.push(dir.to_string_lossy().to_string());
            if candidate.exists() {
                Self::verify_executable(&candidate)?;
                return Ok(candidate);
            }
        }

        // 4. Search ~/.local/bin
        if let Some(home) = dirs::home_dir() {
            let local_bin_dir = home.join(".local").join("bin");
            let candidate = local_bin_dir.join("pi");
            searched_locations.push(local_bin_dir.to_string_lossy().to_string());
            if candidate.exists() {
                Self::verify_executable(&candidate)?;
                return Ok(candidate);
            }
        }

        Err(PiDiscoveryError::NotFound { searched_locations })
    }

    /// Verify the binary at the given path is executable.
    /// On Unix, checks that at least one execute bit (owner, group, or other) is set.
    #[cfg(unix)]
    fn verify_executable(path: &Path) -> Result<(), PiDiscoveryError> {
        use std::os::unix::fs::PermissionsExt;

        let metadata = std::fs::metadata(path).map_err(|_| PiDiscoveryError::NotExecutable {
            path: path.to_path_buf(),
        })?;

        let mode = metadata.permissions().mode();
        if mode & 0o111 == 0 {
            return Err(PiDiscoveryError::NotExecutable {
                path: path.to_path_buf(),
            });
        }

        Ok(())
    }

    /// On non-Unix platforms, assume the binary is executable if it exists.
    #[cfg(not(unix))]
    fn verify_executable(_path: &Path) -> Result<(), PiDiscoveryError> {
        Ok(())
    }

    /// Search for the `pi` binary using a provided list of search paths and a
    /// filesystem abstraction. This enables property-based testing of the
    /// priority-order discovery logic without touching the real filesystem.
    ///
    /// The `search_paths` are checked in order; the first path where the binary
    /// exists AND is executable is returned.
    pub fn discover_with_fs(
        search_paths: &[PathBuf],
        fs: &dyn FileSystemCheck,
    ) -> Result<PathBuf, PiDiscoveryError> {
        let mut searched_locations: Vec<String> = Vec::new();

        for dir in search_paths {
            let candidate = dir.join("pi");
            searched_locations.push(dir.to_string_lossy().to_string());

            if fs.exists(&candidate) {
                if fs.is_executable(&candidate) {
                    return Ok(candidate);
                } else {
                    return Err(PiDiscoveryError::NotExecutable {
                        path: candidate,
                    });
                }
            }
        }

        Err(PiDiscoveryError::NotFound { searched_locations })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discovery_error_display_not_found() {
        let err = PiDiscoveryError::NotFound {
            searched_locations: vec!["/usr/bin".to_string(), "/usr/local/bin".to_string()],
        };
        let msg = format!("{}", err);
        assert!(msg.contains("Pi binary not found"));
        assert!(msg.contains("/usr/bin"));
        assert!(msg.contains("/usr/local/bin"));
    }

    #[test]
    fn test_discovery_error_display_not_executable() {
        let err = PiDiscoveryError::NotExecutable {
            path: PathBuf::from("/usr/local/bin/pi"),
        };
        let msg = format!("{}", err);
        assert!(msg.contains("not executable"));
        assert!(msg.contains("/usr/local/bin/pi"));
    }

    #[cfg(unix)]
    #[test]
    fn test_verify_executable_nonexistent_path() {
        let result = PiBinaryDiscovery::verify_executable(Path::new("/nonexistent/path/pi"));
        assert!(result.is_err());
        if let Err(PiDiscoveryError::NotExecutable { path }) = result {
            assert_eq!(path, PathBuf::from("/nonexistent/path/pi"));
        } else {
            panic!("Expected NotExecutable error");
        }
    }
}
