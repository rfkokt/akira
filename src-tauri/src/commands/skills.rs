use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::State;

#[allow(unused_imports)]
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub description: Option<String>,
    pub owner: String,
    pub repo: String,
    pub version: Option<String>,
    pub skill_path: String,
    pub installed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceSkill {
    pub name: String,
    pub owner: String,
    pub repo: String,
    pub description: Option<String>,
    pub installs: i64,
    pub skill_path: String,
}

fn get_skills_dir(workspace_path: &str) -> PathBuf {
    PathBuf::from(workspace_path).join(".akira").join("skills")
}

#[tauri::command]
pub fn get_installed_skills(state: State<AppState>, workspace_id: String) -> Result<Vec<Skill>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, description, owner, repo, version, skill_path, installed_at FROM skills WHERE workspace_id = ?1 ORDER BY installed_at DESC"
    ).map_err(|e| e.to_string())?;

    let skills = stmt
        .query_map([&workspace_id], |row| {
            Ok(Skill {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                owner: row.get(4)?,
                repo: row.get(5)?,
                version: row.get(6)?,
                skill_path: row.get(7)?,
                installed_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(skills)
}

#[tauri::command]
pub async fn install_skill(
    state: State<'_, AppState>,
    workspace_id: String,
    workspace_path: String,
    owner: String,
    repo: String,
    skill_path: Option<String>,
) -> Result<Skill, String> {
    let skills_dir = get_skills_dir(&workspace_path);
    fs::create_dir_all(&skills_dir).map_err(|e| format!("Failed to create skills directory: {}", e))?;
    
    let temp_dir = std::env::temp_dir().join(format!("skill-download-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    
    let repo_url = format!("https://github.com/{}/{}.git", owner, repo);
    
    println!("[Skills] Cloning {}...", repo_url);
    println!("[Skills] Owner: {}, Repo: {}, SkillPath: {:?}", owner, repo, skill_path);
    
    let clone_result = std::process::Command::new("git")
        .args(["clone", "--depth", "1", &repo_url])
        .current_dir(&temp_dir)
        .output()
        .map_err(|e| format!("Failed to run git clone: {}", e))?;
    
    if !clone_result.status.success() {
        let stderr = String::from_utf8_lossy(&clone_result.stderr);
        let _ = fs::remove_dir_all(&temp_dir);
        return Err(format!("Git clone failed: {}", stderr));
    }
    
    // The cloned repo is in temp_dir/repo_name
    let cloned_repo_dir = temp_dir.join(&repo);
    
    println!("[Skills] Cloned to: {:?}", cloned_repo_dir);
    
    // If skill_path is provided, look for SKILL.md there; otherwise search recursively
    let source_skill_dir = if let Some(ref path) = skill_path {
        println!("[Skills] Looking for SKILL.md at path: {:?}", path);
        
        // Try the provided path
        let skill_dir = if path == "." {
            cloned_repo_dir.clone()
        } else {
            cloned_repo_dir.join(path)
        };
        
        println!("[Skills] Checking: {:?}", skill_dir);
        
        if skill_dir.join("SKILL.md").exists() {
            skill_dir
        } else {
            // Try with "skills/" prefix (common pattern in skills repos)
            let with_skills_prefix = cloned_repo_dir.join("skills").join(path);
            println!("[Skills] Also trying: {:?}", with_skills_prefix);
            
            if with_skills_prefix.join("SKILL.md").exists() {
                with_skills_prefix
            } else {
                // List what's in the repo for debugging
                if let Ok(entries) = fs::read_dir(&cloned_repo_dir) {
                    println!("[Skills] Repo root contents:");
                    for entry in entries.flatten() {
                        println!("[Skills]   {:?}", entry.file_name());
                    }
                }
                
                // Check if there's a "skills" subdirectory
                let skills_dir = cloned_repo_dir.join("skills");
                if skills_dir.exists() && skills_dir.is_dir() {
                    if let Ok(entries) = fs::read_dir(&skills_dir) {
                        println!("[Skills] 'skills/' subdirectory contents:");
                        for entry in entries.flatten() {
                            println!("[Skills]   {:?}", entry.file_name());
                        }
                    }
                }
                
                let _ = fs::remove_dir_all(&temp_dir);
                return Err(format!(
                    "SKILL.md not found at '{}' in repository. Try 'skills/{}' or check the repo structure.",
                    path, path
                ));
            }
        }
    } else {
        // Search for SKILL.md recursively
        fn find_skill_md(dir: &std::path::Path, depth: usize) -> Option<std::path::PathBuf> {
            if dir.join("SKILL.md").exists() {
                return Some(dir.to_path_buf());
            }
            
            if depth > 3 { return None; } // Limit search depth
            
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        if !name.starts_with('.') && name != "node_modules" && name != ".git" {
                            if let Some(found) = find_skill_md(&path, depth + 1) {
                                return Some(found);
                            }
                        }
                    }
                }
            }
            None
        }
        
        match find_skill_md(&cloned_repo_dir, 0) {
            Some(dir) => {
                println!("[Skills] Found SKILL.md at: {:?}", dir);
                dir
            }
            None => {
                // List repo contents for debugging
                if let Ok(entries) = fs::read_dir(&cloned_repo_dir) {
                    println!("[Skills] Repo contents:");
                    for entry in entries.flatten() {
                        println!("[Skills]   - {:?}", entry.file_name());
                    }
                }
                let _ = fs::remove_dir_all(&temp_dir);
                return Err(format!(
                    "SKILL.md not found in {}/{}. Try specifying the skill path.",
                    owner, repo
                ));
            }
        }
    };
    
    // Derive skill name from the source directory name
    let final_skill_name = source_skill_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&repo)
        .to_string();
    
    println!("[Skills] Final skill name: {}", final_skill_name);
    
    let skill_id = format!("{}-{}", owner, final_skill_name);
    let skill_folder = skills_dir.join(&final_skill_name);
    
    // Remove existing skill folder if it exists
    if skill_folder.exists() {
        let _ = fs::remove_dir_all(&skill_folder);
    }
    
    // Copy the skill directory contents directly into skill_folder
    fn copy_dir_contents(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
        fs::create_dir_all(dst)?;
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            let dest_path = dst.join(entry.file_name());
            if ty.is_dir() {
                copy_dir_contents(&entry.path(), &dest_path)?;
            } else {
                fs::copy(entry.path(), &dest_path)?;
            }
        }
        Ok(())
    }
    
    copy_dir_contents(&source_skill_dir, &skill_folder)
        .map_err(|e| format!("Failed to copy skill files: {}", e))?;
    
    // Cleanup temp
    let _ = fs::remove_dir_all(&temp_dir);
    
    // Read description from SKILL.md
    let skill_md_path = skill_folder.join("SKILL.md");
    let description = fs::read_to_string(&skill_md_path)
        .ok()
        .and_then(|content| {
            content.lines()
                .find(|line| line.starts_with("# "))
                .map(|line| line[2..].trim().to_string())
                .or_else(|| {
                    content.lines()
                        .find(|line| !line.is_empty() && !line.starts_with('#'))
                        .map(|line| line.chars().take(100).collect::<String>())
                })
        });
    
    let skill_path_str = skill_folder.to_string_lossy().to_string();
    
    println!("[Skills] Installed to: {:?}", skill_folder);
    
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let installed_at = chrono::Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT OR REPLACE INTO skills (id, workspace_id, name, description, owner, repo, skill_path, installed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![&skill_id, &workspace_id, &final_skill_name, &description.clone().unwrap_or_default(), &owner, &repo, &skill_path_str, &installed_at],
    ).map_err(|e| e.to_string())?;

    Ok(Skill {
        id: skill_id,
        workspace_id,
        name: final_skill_name,
        description,
        owner,
        repo,
        version: None,
        skill_path: skill_path_str,
        installed_at,
    })
}

#[tauri::command]
pub fn uninstall_skill(state: State<AppState>, skill_id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    
    let skill_path: String = conn
        .query_row("SELECT skill_path FROM skills WHERE id = ?1", [&skill_id], |row| row.get(0))
        .map_err(|_| "Skill not found".to_string())?;
    
    if let Err(e) = fs::remove_dir_all(&skill_path) {
        eprintln!("Warning: Failed to remove skill directory: {}", e);
    }
    
    conn.execute("DELETE FROM skills WHERE id = ?1", [&skill_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn fetch_marketplace_skills(query: Option<String>, limit: Option<i32>) -> Result<Vec<MarketplaceSkill>, String> {
    let popular_skills = vec![
        // Skills from anthropics/skills repo
        ("frontend-design", "anthropics", "skills", "frontend-design", "Create distinctive, production-grade frontend interfaces"),
        ("mcp-builder", "anthropics", "skills", "mcp-builder", "Build MCP servers for Claude"),
        ("skill-creator", "anthropics", "skills", "skill-creator", "Create new skills from existing code"),
        ("pdf", "anthropics", "skills", "pdf", "Work with PDF files"),
        ("pptx", "anthropics", "skills", "pptx", "Create and manipulate PowerPoint presentations"),
        ("docx", "anthropics", "skills", "docx", "Work with Word documents"),
        ("xlsx", "anthropics", "skills", "xlsx", "Work with Excel spreadsheets"),
        
        // Skills from vercel-labs/skills repo
        ("find-skills", "vercel-labs", "skills", "find-skills", "Discover and install agent skills from the skills.sh marketplace"),
        
        // Skills from vercel-labs/agent-skills repo
        ("vercel-react-best-practices", "vercel-labs", "agent-skills", "vercel-react-best-practices", "React and Next.js performance optimization"),
        ("web-design-guidelines", "vercel-labs", "agent-skills", "web-design-guidelines", "Web design guidelines and best practices"),
        ("deploy-to-vercel", "vercel-labs", "agent-skills", "deploy-to-vercel", "Deploy applications to Vercel"),
        
        // Skills from vercel-labs/next-skills repo  
        ("next-best-practices", "vercel-labs", "next-skills", "next-best-practices", "Next.js best practices for performance"),
        ("next-cache-components", "vercel-labs", "next-skills", "next-cache-components", "Next.js caching strategies"),
        
        // Skills from supabase/agent-skills
        ("supabase-postgres-best-practices", "supabase", "agent-skills", "supabase-postgres-best-practices", "Postgres performance optimization from Supabase"),
        
        // Skills from shadcn-ui/ui repo (skill at root)
        ("shadcn", "shadcn-ui", "ui", ".", "Beautifully designed components built with Radix UI and Tailwind CSS"),
        
        // Skills from obra/superpowers repo
        ("systematic-debugging", "obra", "superpowers", "systematic-debugging", "Systematic debugging approaches"),
        ("test-driven-development", "obra", "superpowers", "test-driven-development", "Test-driven development practices"),
        ("writing-plans", "obra", "superpowers", "writing-plans", "Write comprehensive development plans"),
        ("executing-plans", "obra", "superpowers", "executing-plans", "Execute development plans effectively"),
        ("requesting-code-review", "obra", "superpowers", "requesting-code-review", "Request and handle code reviews"),
        ("receiving-code-review", "obra", "superpowers", "receiving-code-review", "Receive and act on code review feedback"),
        
        // Skills from better-auth/skills
        ("better-auth-best-practices", "better-auth", "skills", "better-auth-best-practices", "Better Auth best practices"),
        
        // Skills from expo/skills
        ("building-native-ui", "expo", "skills", "building-native-ui", "Build native UI components with Expo"),
        ("native-data-fetching", "expo", "skills", "native-data-fetching", "Data fetching patterns for Expo"),
        
        // Skills from remotion-dev/skills
        ("remotion-best-practices", "remotion-dev", "skills", "remotion-best-practices", "Remotion video creation best practices"),
        
        // Skills from neondatabase/agent-skills
        ("neon-postgres", "neondatabase", "agent-skills", "neon-postgres", "Neon Postgres integration"),
        
        // Skills from vercel/ai repo
        ("ai-sdk", "vercel", "ai", "ai-sdk", "Vercel AI SDK integration"),
        
        // Skills from vercel/turborepo
        ("turborepo", "vercel", "turborepo", "turborepo", "Turborepo monorepo management"),
        
        // Skills from antfu/skills
        ("vue", "antfu", "skills", "vue", "Vue.js best practices from Anthony Fu"),
    ];
    
    let limit = limit.unwrap_or(50) as usize;
    
    let filtered: Vec<MarketplaceSkill> = if let Some(ref q) = query {
        let q_lower = q.to_lowercase();
        popular_skills
            .into_iter()
            .filter(|(name, _, _, _, desc)| {
                name.to_lowercase().contains(&q_lower) || 
                desc.to_lowercase().contains(&q_lower)
            })
            .take(limit)
            .map(|(name, owner, repo, skill_path, description)| MarketplaceSkill {
                name: name.to_string(),
                owner: owner.to_string(),
                repo: repo.to_string(),
                description: Some(description.to_string()),
                installs: 0,
                skill_path: skill_path.to_string(),
            })
            .collect()
    } else {
        popular_skills
            .into_iter()
            .take(limit)
            .map(|(name, owner, repo, skill_path, description)| MarketplaceSkill {
                name: name.to_string(),
                owner: owner.to_string(),
                repo: repo.to_string(),
                description: Some(description.to_string()),
                installs: 0,
                skill_path: skill_path.to_string(),
            })
            .collect()
    };
    
    Ok(filtered)
}

#[tauri::command]
pub fn read_skill_content(skill_path: String) -> Result<String, String> {
    let skill_md = PathBuf::from(&skill_path).join("SKILL.md");
    
    if !skill_md.exists() {
        return Err("SKILL.md not found".to_string());
    }
    
    fs::read_to_string(&skill_md)
        .map_err(|e| format!("Failed to read SKILL.md: {}", e))
}