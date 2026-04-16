use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize)]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub relative_path: String,
    pub line_number: Option<usize>,
    pub line_content: Option<String>,
    pub match_start: Option<usize>,
    pub match_end: Option<usize>,
}

const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "target",
    "vendor",
    ".next",
    ".nuxt",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    ".idea",
    ".vscode",
    ".vs",
    "coverage",
    ".cache",
    "tmp",
    "temp",
];

const IGNORED_EXTENSIONS: &[&str] = &[
    ".min.js", ".min.css", ".map", ".lock", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".ico", ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z",
    ".dmg", ".app", ".exe", ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mpg", ".mpeg",
];

#[tauri::command]
pub fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let mut entries = Vec::new();

    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let dir_entries =
        std::fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in dir_entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            let is_dir = path.is_dir();
            let size = if !is_dir {
                entry.metadata().ok().map(|m| m.len())
            } else {
                None
            };

            entries.push(FileEntry {
                path: path.to_string_lossy().to_string(),
                name,
                is_dir,
                size,
            });
        }
    }

    // Sort: directories first, then files
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.cmp(&b.name),
    });

    Ok(entries)
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    let result = app.dialog().file().blocking_pick_folder();

    match result {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
}

#[tauri::command]
pub fn delete_directory(path: String) -> Result<(), String> {
    std::fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory: {}", e))
}

fn should_skip_entry(entry: &fs::DirEntry) -> bool {
    let name = entry.file_name().to_string_lossy().to_string();

    if name.starts_with('.') {
        return true;
    }

    if IGNORED_DIRS.contains(&name.as_str()) {
        return true;
    }

    if let Ok(metadata) = entry.metadata() {
        if metadata.is_file() {
            let name_lower = name.to_lowercase();
            for ext in IGNORED_EXTENSIONS {
                if name_lower.ends_with(ext) {
                    return true;
                }
            }
            if metadata.len() > 5_000_000 {
                return true;
            }
        }
    }

    false
}

#[tauri::command]
pub fn search_files(root_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Invalid root path: {}", root_path));
    }

    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResult> = Vec::new();

    fn search_recursive(
        dir: &Path,
        root: &Path,
        query_lower: &str,
        results: &mut Vec<SearchResult>,
    ) -> Result<(), String> {
        let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            if let Ok(entry) = entry {
                if should_skip_entry(&entry) {
                    continue;
                }

                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                let name_lower = name.to_lowercase();

                if name_lower.contains(query_lower) {
                    let relative_path = path
                        .strip_prefix(root)
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_else(|_| name.clone());

                    results.push(SearchResult {
                        path: path.to_string_lossy().to_string(),
                        name,
                        relative_path,
                        line_number: None,
                        line_content: None,
                        match_start: None,
                        match_end: None,
                    });
                }

                if path.is_dir() {
                    search_recursive(&path, root, query_lower, results)?;
                }
            }
        }

        Ok(())
    }

    search_recursive(root, root, &query_lower, &mut results)?;

    results.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    results.truncate(100);

    Ok(results)
}

#[tauri::command]
pub fn search_in_files(root_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    let root = Path::new(&root_path);
    if !root.exists() || !root.is_dir() {
        return Err(format!("Invalid root path: {}", root_path));
    }

    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResult> = Vec::new();

    fn search_file_content(
        file_path: &Path,
        query_lower: &str,
    ) -> Result<Vec<(usize, String, usize, usize)>, String> {
        let content =
            fs::read_to_string(file_path).map_err(|e| format!("Failed to read file: {}", e))?;

        let mut matches = Vec::new();

        for (line_idx, line) in content.lines().enumerate() {
            let line_lower = line.to_lowercase();
            if let Some(pos) = line_lower.find(query_lower) {
                let match_start = pos;
                let match_end = pos + query_lower.len();
                matches.push((line_idx + 1, line.to_string(), match_start, match_end));

                if matches.len() >= 5 {
                    break;
                }
            }
        }

        Ok(matches)
    }

    fn search_recursive(
        dir: &Path,
        root: &Path,
        query_lower: &str,
        results: &mut Vec<SearchResult>,
    ) -> Result<(), String> {
        let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            if let Ok(entry) = entry {
                if should_skip_entry(&entry) {
                    continue;
                }

                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();

                if path.is_file() {
                    if let Ok(content_matches) = search_file_content(&path, query_lower) {
                        for (line_num, line_content, match_start, match_end) in content_matches {
                            let relative_path = path
                                .strip_prefix(root)
                                .map(|p| p.to_string_lossy().to_string())
                                .unwrap_or_else(|_| name.clone());

                            results.push(SearchResult {
                                path: path.to_string_lossy().to_string(),
                                name: name.clone(),
                                relative_path: relative_path.clone(),
                                line_number: Some(line_num),
                                line_content: Some(line_content),
                                match_start: Some(match_start),
                                match_end: Some(match_end),
                            });
                        }
                    }
                } else if path.is_dir() {
                    search_recursive(&path, root, query_lower, results)?;
                }
            }

            if results.len() >= 200 {
                break;
            }
        }

        Ok(())
    }

    search_recursive(root, root, &query_lower, &mut results)?;

    results.sort_by(|a, b| match (&a.relative_path, &b.relative_path) {
        (path_a, path_b) => match (&a.line_number, &b.line_number) {
            (Some(line_a), Some(line_b)) if path_a == path_b => line_a.cmp(line_b),
            _ => path_a.cmp(path_b),
        },
    });
    results.truncate(200);

    Ok(results)
}
