// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::Manager;

mod cli_router;
mod cli_router_core;
mod db;
mod pty_manager;

// New modules
mod commands;
mod models;
mod state;

use cli_router_core::CliRouter;
use pty_manager::PtyManager;
use state::AppState;

// Re-export models for convenience
pub use models::*;

// ============== Application Setup ==============

fn main() {
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

            let cli_router = Arc::new(CliRouter::new());
            let mut pty_manager = PtyManager::new();
            pty_manager.set_app_handle(app.handle().clone());

            app.manage(AppState::new(conn, cli_router, pty_manager));

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
            // Engines
            commands::engines::create_engine,
            commands::engines::get_all_engines,
            commands::engines::update_engine_enabled,
            commands::engines::delete_engine,
            commands::engines::seed_default_engines,
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
            commands::git::git_discard_changes,
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
            // CLI
            commands::cli::run_cli,
            commands::cli::stop_cli,
            // CLI Router
            commands::router::get_router_providers,
            commands::router::sync_engines_to_router,
            commands::router::get_router_config,
            commands::router::save_router_config,
            commands::router::record_cli_cost,
            commands::router::get_provider_costs,
            // Agents
            commands::agents::run_agent,
            commands::agents::stop_agent,
            commands::agents::get_agent_status,
            // PTY
            commands::pty::spawn_pty_session,
            commands::pty::pty_write,
            commands::pty::pty_resize,
            commands::pty::pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
