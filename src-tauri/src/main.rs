#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use std::sync::Mutex;

fn update_active_window(app: &tauri::AppHandle, label: &str) {
    if let Ok(mut active) = app.state::<Mutex<String>>().lock() {
        *active = label.to_string();
    }
    // Mantém o próprio item: Menu::get não procura dentro de submenus.
    if let Some(item) = app.try_state::<MenuItem<tauri::Wry>>() {
        let _ = item.set_enabled(label.starts_with("project-"));
    }
}

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
        update_active_window(&app, &label);
        existing.show().map_err(|e| e.to_string())?;
        return existing.set_focus().map_err(|e| e.to_string());
    }
    let mut url = window.url().map_err(|e| e.to_string())?;
    url.set_path(&format!("/projetos/{}/", id));
    url.set_query(None);
    url.set_fragment(None);
    WebviewWindowBuilder::new(&app, label.clone(), WebviewUrl::External(url))
        .title(format!("{} · Morada", name))
        .inner_size(1440.0, 960.0)
        .min_inner_size(900.0, 600.0)
        .build()
        .map_err(|e| e.to_string())?;
    update_active_window(&app, &label);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(String::from("main")))
        .invoke_handler(tauri::generate_handler![open_project])
        .setup(|app| {
            // Mantém os menus nativos de edição e gerenciamento das janelas.
            let menu = Menu::default(app.handle())?;
            let about = PredefinedMenuItem::about(app, Some("About Morada"), Some(AboutMetadata {
                name: Some("Morada".into()),
                version: Some(app.package_info().version.to_string()),
                icon: app.default_window_icon().cloned(),
                ..Default::default()
            }))?;
            // O menu padrão não inclui o ícone nos metadados da janela About.
            for (index, item) in menu.items()?.iter().enumerate() {
                if let Some(submenu) = item.as_submenu() {
                    if (cfg!(target_os = "macos") && index == 0)
                        || (!cfg!(target_os = "macos") && submenu.text()? == "Help")
                    {
                        submenu.remove_at(0)?;
                        submenu.insert(&about, 0)?;
                        break;
                    }
                }
            }
            let new_project = MenuItem::with_id(app, "new-project", "Novo projeto…", true, Some("CmdOrCtrl+N"))?;
            let add_property = MenuItem::with_id(app, "add-property", "Adicionar imóvel…", false, Some("CmdOrCtrl+I"))?;
            let project_menu = Submenu::with_items(app, "Projeto", true, &[&new_project, &add_property])?;
            #[cfg(target_os = "macos")]
            menu.insert(&project_menu, 1)?;
            #[cfg(not(target_os = "macos"))]
            menu.insert(&project_menu, 0)?;
            app.set_menu(menu)?;
            app.manage(add_property);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                update_active_window(window.app_handle(), window.label());
            }
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "add-property" {
                let label = app.state::<Mutex<String>>().lock().ok().map(|label| label.clone());
                if let Some(label) = label.filter(|label| label.starts_with("project-")) {
                    if let Some(window) = app.get_webview_window(&label) {
                        let _ = window.eval("window.dispatchEvent(new Event('morada:add-property'));");
                    }
                }
            }
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
