use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AkiraProjectConfig {
    pub md_rules: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AkiraConfigMeta {
    version: String,
    exported_at_unix: u64,
}

/// Export project config to .akira/ folder inside the workspace.
/// Creates:
///   {folder_path}/.akira/rules.md
///   {folder_path}/.akira/config.json
#[tauri::command]
pub fn export_akira_config(folder_path: String, config: AkiraProjectConfig) -> Result<(), String> {
    let akira_dir = Path::new(&folder_path).join(".akira");
    fs::create_dir_all(&akira_dir)
        .map_err(|e| format!("Failed to create .akira/ directory: {}", e))?;

    // Write rules.md
    let rules_path = akira_dir.join("rules.md");
    fs::write(&rules_path, &config.md_rules)
        .map_err(|e| format!("Failed to write rules.md: {}", e))?;

    // Write config.json with unix timestamp
    let now_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let meta = AkiraConfigMeta {
        version: "1.0".to_string(),
        exported_at_unix: now_unix,
    };
    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize config.json: {}", e))?;
    let config_path = akira_dir.join("config.json");
    fs::write(&config_path, meta_json)
        .map_err(|e| format!("Failed to write config.json: {}", e))?;

    Ok(())
}

/// Import project config from .akira/ folder inside the workspace.
/// Returns None if .akira/rules.md does not exist.
#[tauri::command]
pub fn import_akira_config(folder_path: String) -> Result<Option<AkiraProjectConfig>, String> {
    let rules_path = Path::new(&folder_path).join(".akira").join("rules.md");

    if !rules_path.exists() {
        return Ok(None);
    }

    let md_rules = fs::read_to_string(&rules_path)
        .map_err(|e| format!("Failed to read .akira/rules.md: {}", e))?;

    Ok(Some(AkiraProjectConfig { md_rules }))
}
