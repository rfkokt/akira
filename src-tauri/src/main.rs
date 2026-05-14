// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, RunEvent};

mod db;
mod pty_manager;

// New modules
mod commands;
mod models;
mod pi;
mod state;

use pty_manager::PtyManager;
use state::AppState;

// Re-export models for convenience
pub use models::*;

#[cfg(target_os = "macos")]
fn fix_macos_path() {
    // When running inside a macOS .app bundle, the PATH is often restricted.
    // We run a login shell to extract the user's full PATH and apply it to this process.
    if let Ok(output) = std::process::Command::new("/bin/zsh")
        .arg("-lc")
        .arg("/usr/bin/env")
        .output()
    {
        if output.status.success() {
            if let Ok(env_str) = String::from_utf8(output.stdout) {
                for line in env_str.lines() {
                    if let Some(path) = line.strip_prefix("PATH=") {
                        std::env::set_var("PATH", path.trim());
                        break;
                    }
                }
            }
        }
    }
}

// ============== Application Setup ==============

fn main() {
    #[cfg(target_os = "macos")]
    fix_macos_path();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_local_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");

            let conn = db::init_db(&app_dir).expect("Failed to initialize database");

            let mut pty_manager = PtyManager::new();
            pty_manager.set_app_handle(app.handle().clone());

            let db_conn = Arc::new(std::sync::Mutex::new(conn));

            // Initialize PiProcessManager with a placeholder path (will be set after discovery)
            let pi_manager = Arc::new(pi::PiProcessManager::new(
                PathBuf::from("pi"), // placeholder; real path set by pi_discover_binary command
                app.handle().clone(),
            ));
            
            app.manage(AppState::new(db_conn, pty_manager, pi_manager));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Tasks
            commands::tasks::create_task,
            commands::tasks::get_all_tasks,
            commands::tasks::get_tasks_by_status,
            commands::tasks::get_tasks_by_workspace,
            commands::tasks::update_task_status,
            commands::tasks::update_task,
            commands::tasks::fix_backlog_tasks,
            commands::tasks::delete_task,
            commands::tasks::update_task_pr_info,
            commands::tasks::update_task_merge_info,
            commands::tasks::update_task_diff_info,

            // Workspaces
            commands::workspaces::create_workspace,
            commands::workspaces::get_all_workspaces,
            commands::workspaces::get_active_workspace,
            commands::workspaces::set_active_workspace,
            commands::workspaces::delete_workspace,
            // Import
            commands::import::import_tasks_json,
            commands::import::import_tasks_markdown,
            commands::import::import_tasks_excel,
            // Git
            commands::git::git_get_branches,
            commands::git::git_checkout_branch,
            commands::git::git_create_branch,
            commands::git::git_get_diff,
            commands::git::git_get_staged_diff,
            commands::git::git_get_pr_diff,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_status,
            commands::git::git_stage,
            commands::git::git_unstage,
            commands::git::git_show_head,
            commands::git::git_get_file_diff,
            commands::git::git_show_at_ref,
            commands::git::git_discard_changes,
            commands::git::git_log,
            commands::git::git_commit_amend,
            commands::git::git_show_files,
            commands::git::git_show_file,
            commands::git::git_show_file_diff,
            commands::git::git_show_file_diff_patch,
            // Chat
            commands::chat::create_chat_message,
            commands::chat::get_chat_history,
            commands::chat::clear_chat_history,
            // File System
            commands::fs::read_directory,
            commands::fs::pick_folder,
            commands::fs::read_file,
            commands::fs::write_file,
            commands::fs::create_directory,
            commands::fs::delete_file,
            commands::fs::delete_directory,
            commands::fs::search_files,
            commands::fs::search_in_files,
            // Project Config
            commands::project::get_project_config,
            commands::project::save_project_config,
            // .akira/ config sync
            commands::akira_config::export_akira_config,
            commands::akira_config::import_akira_config,
            // PR automation & branch diff
            commands::pr::create_pull_request,
            commands::pr::git_get_branch_diff,
            // RTK
            commands::rtk::check_rtk_status,
            commands::rtk::install_rtk,
            commands::rtk::init_rtk,
            commands::rtk::run_rtk_command,
            commands::rtk::get_rtk_gain_stats,

            // Shell
            commands::shell::run_shell_command,
            // PTY
            commands::pty::spawn_pty_session,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,

            // Pi (pi.dev integration)
            commands::pi::pi_discover_binary,
            commands::pi::pi_check_auth,
            commands::pi::pi_spawn,
            commands::pi::pi_terminate,
            commands::pi::pi_send_prompt,
            commands::pi::pi_send_steer,
            commands::pi::pi_abort,
            commands::pi::pi_get_models,
            commands::pi::pi_set_model,
            commands::pi::pi_get_session_stats,
            commands::pi::pi_new_session,
            commands::pi::pi_compact,
            commands::pi::pi_get_task_session,
            commands::pi::pi_create_task_session,
            commands::pi::pi_create_task_branch,
            commands::pi::pi_checkout_task_branch,
            commands::pi::pi_get_task_branches,
            commands::pi::pi_get_rules,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                // Terminate all active Pi subprocesses on app shutdown
                let state = app_handle.state::<AppState>();
                let pi_manager = state.pi_manager.clone();
                tauri::async_runtime::block_on(async {
                    pi_manager.terminate_all().await;
                });
            }
        });
}
