use std::{fs, io::{self, BufRead, BufReader}, process::{Child, Command, Stdio}, sync::{mpsc, Mutex}, time::Duration};
use tauri::Manager;

pub struct LocalRuntime {
    child: Mutex<Option<Child>>,
    pub origin: tauri::Url,
    pub session: String,
}

impl Drop for LocalRuntime {
    fn drop(&mut self) {
        if let Ok(child) = self.child.get_mut() {
            if let Some(mut process) = child.take() { let _ = process.kill(); let _ = process.wait(); }
        }
    }
}

pub fn start(app: &tauri::AppHandle) -> io::Result<LocalRuntime> {
    let resources = app.path().resource_dir().map_err(io::Error::other)?.join("runtime");
    let data = app.path().app_data_dir().map_err(io::Error::other)?;
    fs::create_dir_all(&data)?;
    let binary = std::env::current_exe()?.with_file_name(if cfg!(windows) { "morada-runtime.exe" } else { "morada-runtime" });
    let log_path = data.join("servidor.log");
    let log = fs::OpenOptions::new().create(true).append(true).open(&log_path)?;
    let session = uuid::Uuid::new_v4().simple().to_string();
    let mut command = Command::new(binary);
    command.arg("--no-install").arg(resources.join("server.ts"))
        .current_dir(&data)
        .env("PORT", "0")
        .env("MORADA_ASSET_DIR", &resources)
        .env("MORADA_DATA_DIR", &data)
        .env("MORADA_DESKTOP_RUNTIME", "1")
        .env("MORADA_PARENT_PID", std::process::id().to_string())
        .env("MORADA_SESSION_TOKEN", &session)
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(log);
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn()?;
    let stdout = child.stdout.take().ok_or_else(|| io::Error::other("Saída do servidor indisponível"))?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(url) = line.strip_prefix("MORADA_READY ") { let _ = sender.send(url.to_owned()); }
        }
    });
    let ready = receiver.recv_timeout(Duration::from_secs(25))
        .map_err(|_| io::Error::other(format!("Não foi possível iniciar o servidor HTTP local. O Morada precisa desse serviço para funcionar. Consulte {}", log_path.display())))
        .and_then(|value| {
            let url = tauri::Url::parse(&value).map_err(io::Error::other)?;
            if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") || url.port().is_none() {
                return Err(io::Error::other("Endereço do serviço local inválido"));
            }
            Ok(url)
        });
    match ready {
        Ok(origin) => Ok(LocalRuntime { child: Mutex::new(Some(child)), origin, session }),
        Err(error) => { let _ = child.kill(); let _ = child.wait(); Err(error) }
    }
}
