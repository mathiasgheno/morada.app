#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .on_page_load(|_window, payload| {
            if cfg!(debug_assertions) {
                println!("Morada desktop: {:?} {}", payload.event(), payload.url());
            }
        })
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Morada desktop");
}
