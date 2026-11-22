fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "open_project", "close_project", "set_theme_mode", "save_project_backup", "open_walk_score",
        ]),
    )).expect("Não foi possível gerar as permissões do Morada");
}
