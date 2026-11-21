#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::menu::{Menu, MenuItem, Submenu};

fn launcher_window(app: &tauri::AppHandle, new_project: bool) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window("main") {
        return Ok(window);
    }
    let mut builder = WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])
        .map_err(|e| e.to_string())?;
    if new_project {
        builder = builder.initialization_script("window.__moradaNewProjectRequested = true;");
    }
    builder
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_project(app: tauri::AppHandle, window: tauri::WebviewWindow, id: String, name: String) -> Result<(), String> {
    if window.label() != "main" || id.is_empty() || id.len() > 80 || !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') || name.len() > 480 {
        return Err("Projeto inválido".into());
    }
    let label = format!("project-{}", id);
    if let Some(existing) = app.get_webview_window(&label) {
        existing.show().map_err(|e| e.to_string())?;
        return existing.set_focus().map_err(|e| e.to_string());
    }
    let mut url = window.url().map_err(|e| e.to_string())?;
    url.set_path(&format!("/projetos/{}/", id));
    url.set_query(None);
    url.set_fragment(None);
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(url))
        .title(format!("{} · Morada", name))
        .inner_size(1440.0, 960.0)
        .min_inner_size(900.0, 600.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn show_launcher(app: tauri::AppHandle) -> Result<(), String> {
    let launcher = launcher_window(&app, false)?;
    launcher.show().map_err(|e| e.to_string())?;
    launcher.set_focus().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_project, show_launcher])
        .setup(|app| {
            // Mantém os menus nativos de edição e gerenciamento das janelas.
            let menu = Menu::default(app.handle())?;
            let new_project = MenuItem::with_id(app, "new-project", "Novo projeto…", true, Some("CmdOrCtrl+N"))?;
            let project_menu = Submenu::with_items(app, "Projeto", true, &[&new_project])?;
            #[cfg(target_os = "macos")]
            menu.insert(&project_menu, 1)?;
            #[cfg(not(target_os = "macos"))]
            menu.insert(&project_menu, 0)?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "new-project" {
                if let Ok(launcher) = launcher_window(app, true) {
                    let _ = launcher.show();
                    let _ = launcher.set_focus();
                    let _ = launcher.eval("window.__moradaNewProjectRequested = true; window.dispatchEvent(new Event('morada:new-project'));");
                }
            }
        })
        .on_page_load(|_window, payload| {
            if cfg!(debug_assertions) {
                println!("Morada desktop: {:?} {}", payload.event(), payload.url());
            }
        })
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Morada desktop");
}
