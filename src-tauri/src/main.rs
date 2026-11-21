#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

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
    let launcher = app.get_webview_window("main").ok_or("Launcher indisponível")?;
    launcher.show().map_err(|e| e.to_string())?;
    launcher.set_focus().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_project, show_launcher])
        .on_page_load(|_window, payload| {
            if cfg!(debug_assertions) {
                println!("Morada desktop: {:?} {}", payload.event(), payload.url());
            }
        })
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Morada desktop");
}
