use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, process::Command, sync::Mutex, time::Duration};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

fn quiet(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn show_main_window(app: AppHandle) { show_main(&app); }

#[derive(Serialize, Deserialize, Clone)]
struct OrbitPayload { paths: Vec<String>, x: f64, y: f64, hint: Option<String> }

#[derive(Default)]
struct PendingOrbit(Mutex<Option<OrbitPayload>>);

#[derive(Default)]
struct HotkeyState { current: Mutex<Option<String>>, paused: Mutex<bool> }

#[tauri::command]
fn set_global_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    let state = app.state::<HotkeyState>();
    let mut current = state.current.lock().map_err(|e| e.to_string())?;
    if let Some(old) = current.take() { let _ = gs.unregister(old.as_str()); }
    gs.on_shortcut(shortcut.as_str(), |app, _shortcut, event| {
        if event.state() != ShortcutState::Pressed { return; }
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let paused = app.state::<HotkeyState>().paused.lock().map(|p| *p).unwrap_or(false);
            if paused { return; }
            if !matches!(quick_orbit(app.clone()).await, Ok(true)) {
                let _ = app.emit_to("main", "flicky-native-shortcut", ());
            }
        });
    })
    .map_err(|e| format!("{shortcut} could not be registered (another app may already use it): {e}"))?;
    *current = Some(shortcut);
    Ok(())
}

#[tauri::command]
fn set_hotkey_paused(app: AppHandle, paused: bool) {
    if let Ok(mut p) = app.state::<HotkeyState>().paused.lock() { *p = paused; }
}

#[derive(Default)]
struct OrbitQueue(Mutex<Vec<String>>);

fn orbit_paths_from_args(args: &[String]) -> Vec<String> {
    match args.iter().position(|a| a == "--orbit") {
        Some(i) => args[i + 1..].iter().filter(|a| !a.starts_with("--")).cloned().collect(),
        None => Vec::new(),
    }
}

fn queue_orbit(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() { return; }
    let first = {
        let state = app.state::<OrbitQueue>();
        let mut q = state.0.lock().unwrap();
        let first = q.is_empty();
        for p in paths { if !q.contains(&p) { q.push(p); } }
        first
    };
    if first {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(450));
            let collected: Vec<String> = {
                let state = app.state::<OrbitQueue>();
                let mut q = state.0.lock().unwrap();
                std::mem::take(&mut *q)
            };
            let files: Vec<String> = collected.into_iter().filter(|p| Path::new(p).is_file()).collect();
            if !files.is_empty() { let _ = present_overlay(&app, files, None, None); }
        });
    }
}

#[cfg(windows)]
mod native {
    #[link(name = "user32")]
    extern "system" {
        pub fn GetForegroundWindow() -> isize;
        pub fn GetClassNameW(hwnd: isize, buf: *mut u16, max: i32) -> i32;
    }
}

#[cfg(windows)]
fn foreground_window() -> (i64, String) {
    unsafe {
        let hwnd = native::GetForegroundWindow();
        let mut buf = [0u16; 128];
        let n = native::GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        let class = if n > 0 { String::from_utf16_lossy(&buf[..n as usize]) } else { String::new() };
        (hwnd as i64, class)
    }
}

#[cfg_attr(not(windows), allow(dead_code))]
fn base64(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = ((chunk[0] as u32) << 16) | (b1 << 8) | b2;
        out.push(T[((n >> 18) & 63) as usize] as char);
        out.push(T[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { T[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[(n & 63) as usize] as char } else { '=' });
    }
    out
}

#[cfg(windows)]
fn explorer_selection() -> Vec<String> {
    use std::{io::Read, process::Stdio, time::{Duration, Instant}};

    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$fg = [int64]__HWND__
$desktop = __DESKTOP__
$sh = New-Object -ComObject Shell.Application
$paths = New-Object System.Collections.ArrayList
function Add-Selection($view) {
  try {
    foreach ($i in $view.Document.SelectedItems()) {
      $p = [string]$i.Path
      if ($p -and [System.IO.File]::Exists($p)) { [void]$paths.Add($p) }
    }
  } catch {}
}
if ($desktop) {
  try {
    $a = [ref]0; $b = [ref]0; $c = [ref]0
    Add-Selection ($sh.Windows().FindWindowSW($a, $b, 8, $c, 1))
  } catch {}
} else {
  foreach ($w in $sh.Windows()) {
    try {
      if ([int64]$w.HWND -eq $fg) { Add-Selection $w; if ($paths.Count -gt 0) { break } }
    } catch {}
  }
}
$paths | Select-Object -First 200 | ForEach-Object { [Console]::Out.WriteLine($_) }
"#;

    let (hwnd, class) = foreground_window();
    if hwnd == 0 { return Vec::new(); }
    let desktop = class == "Progman" || class == "WorkerW";
    let explorer = class == "CabinetWClass" || class == "ExploreWClass";
    if !desktop && !explorer { return Vec::new(); }

    let script = SCRIPT.replace("__HWND__", &hwnd.to_string()).replace("__DESKTOP__", if desktop { "$true" } else { "$false" });
    let utf16: Vec<u8> = script.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    let mut cmd = Command::new("powershell.exe");
    quiet(&mut cmd);
    let encoded = base64(&utf16);
    cmd.args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded.as_str()])
        .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
    let Ok(mut child) = cmd.spawn() else { return Vec::new(); };
    let Some(mut stdout) = child.stdout.take() else { return Vec::new(); };
    let reader = std::thread::spawn(move || { let mut buf = Vec::new(); let _ = stdout.read_to_end(&mut buf); buf });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) | Err(_) => break,
            Ok(None) => {
                if started.elapsed() > Duration::from_secs(5) { let _ = child.kill(); let _ = child.wait(); break; }
                std::thread::sleep(Duration::from_millis(4));
            }
        }
    }
    let raw = reader.join().unwrap_or_default();
    String::from_utf8_lossy(&raw)
        .lines()
        .map(|l| l.trim().trim_start_matches('\u{feff}').to_string())
        .filter(|p| !p.is_empty() && Path::new(p).is_file())
        .collect()
}

#[cfg(not(windows))]
fn explorer_selection() -> Vec<String> { Vec::new() }

fn hide_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("orbit") { let _ = w.hide(); }
    if let Ok(mut p) = app.state::<PendingOrbit>().0.lock() { *p = None; }
}

fn prepare_overlay(app: &AppHandle) -> Result<(f64, f64), String> {
    let w = app.get_webview_window("orbit").ok_or("The Orbit window is missing")?;
    let cursor = w.cursor_position().map_err(|e| e.to_string())?;
    let monitors = w.available_monitors().map_err(|e| e.to_string())?;
    let mon = monitors
        .iter()
        .find(|m| {
            let (p, s) = (m.position(), m.size());
            cursor.x >= p.x as f64 && cursor.x < p.x as f64 + s.width as f64
                && cursor.y >= p.y as f64 && cursor.y < p.y as f64 + s.height as f64
        })
        .cloned()
        .or_else(|| w.primary_monitor().ok().flatten())
        .ok_or("No monitor found")?;
    let scale = mon.scale_factor();
    let (mp, ms) = (*mon.position(), *mon.size());

    let _ = w.set_position(tauri::PhysicalPosition::new(mp.x, mp.y));
    let _ = w.set_size(tauri::PhysicalSize::new(ms.width, ms.height));
    Ok(((cursor.x - mp.x as f64) / scale, (cursor.y - mp.y as f64) / scale))
}

fn present_overlay(app: &AppHandle, paths: Vec<String>, hint: Option<String>, pos: Option<(f64, f64)>) -> Result<(), String> {
    let w = app.get_webview_window("orbit").ok_or("The Orbit window is missing")?;
    let (x, y) = match pos { Some(p) => p, None => prepare_overlay(app)? };
    let payload = OrbitPayload { paths, hint, x, y };
    if let Ok(mut p) = app.state::<PendingOrbit>().0.lock() { *p = Some(payload.clone()); }
    let _ = app.emit_to("orbit", "flicky-overlay-open", payload);
    let _ = w.show();
    let _ = w.set_always_on_top(true);
    let _ = w.set_focus();
    Ok(())
}

#[tauri::command]
async fn quick_orbit(app: AppHandle) -> Result<bool, String> {

    if let Some(main) = app.get_webview_window("main") {
        if main.is_focused().unwrap_or(false) { return Ok(false); }
    }
    let Some(overlay) = app.get_webview_window("orbit") else { return Ok(false); };

    if overlay.is_visible().unwrap_or(false) { hide_overlay(&app); return Ok(true); }
    let pos = prepare_overlay(&app).ok();
    let paths = tauri::async_runtime::spawn_blocking(explorer_selection).await.map_err(|e| e.to_string())?;
    let hint = if paths.is_empty() { Some("Select a file in Explorer first, then press the shortcut".to_string()) } else { None };
    present_overlay(&app, paths, hint, pos)?;
    Ok(true)
}

#[tauri::command]
fn overlay_hide(app: AppHandle) { hide_overlay(&app); }

#[tauri::command]
fn overlay_take_pending(app: AppHandle) -> Option<OrbitPayload> {
    app.state::<PendingOrbit>().0.lock().ok().and_then(|mut p| p.take())
}

#[tauri::command]
fn overlay_dispatch(app: AppHandle, request: serde_json::Value) {
    let _ = app.emit_to("main", "flicky-run", request);
}

#[tauri::command]
fn overlay_status(app: AppHandle, status: serde_json::Value) -> bool {
    let visible = app.get_webview_window("orbit").and_then(|w| w.is_visible().ok()).unwrap_or(false);
    if visible { let _ = app.emit_to("orbit", "flicky-status", status); }
    visible
}

#[tauri::command]
fn startup_set(enabled: bool, minimized: bool) -> Result<(), String> {
    #[cfg(windows)]
    {

        if cfg!(debug_assertions) { return Ok(()); }
        const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
        let mut cmd = Command::new("reg");
        quiet(&mut cmd);
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let mut value = format!("\"{}\"", exe.to_string_lossy());
            if minimized { value.push_str(" --autostart"); }
            cmd.args(["add", RUN_KEY, "/v", "Flicky", "/t", "REG_SZ", "/d", value.as_str(), "/f"]);
            let out = cmd.output().map_err(|e| format!("Could not update Windows startup: {e}"))?;
            if !out.status.success() { return Err("Windows refused to register Flicky for startup".into()); }
        } else {

            let _ = cmd.args(["delete", RUN_KEY, "/v", "Flicky", "/f"]).output();
        }
    }
    #[cfg(not(windows))]
    { let _ = (enabled, minimized); }
    Ok(())
}

#[cfg(windows)]
fn reg_run(args: &[&str]) -> Result<bool, String> {
    let mut cmd = Command::new("reg");
    quiet(&mut cmd);
    cmd.args(args).output().map(|o| o.status.success()).map_err(|e| format!("Could not update the Windows registry: {e}"))
}

#[tauri::command]
fn explorer_menu_set(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        if cfg!(debug_assertions) { return Ok(()); }
        const VERB: &str = r"HKCU\Software\Classes\*\shell\FlickyOrbit";
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe = exe_path.to_string_lossy().to_string();
        let exe_name = exe_path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "flicky.exe".into());
        let app_key = format!(r"HKCU\Software\Classes\Applications\{exe_name}");
        let app_cmd_key = format!(r"{app_key}\shell\open\command");
        let open_with_key = format!(r"HKCU\Software\Classes\*\OpenWithList\{exe_name}");
        if enabled {
            let command = format!("\"{exe}\" --orbit \"%1\"");
            let icon = format!("\"{exe}\",0");
            let command_key = format!("{VERB}\\command");
            let ok = reg_run(&["add", VERB, "/ve", "/d", "Open with Flicky Orbit", "/f"])?
                && reg_run(&["add", VERB, "/v", "Icon", "/t", "REG_SZ", "/d", icon.as_str(), "/f"])?
                && reg_run(&["add", command_key.as_str(), "/ve", "/d", command.as_str(), "/f"])?
                && reg_run(&["add", app_key.as_str(), "/v", "FriendlyAppName", "/t", "REG_SZ", "/d", "Flicky Orbit", "/f"])?
                && reg_run(&["add", app_cmd_key.as_str(), "/ve", "/d", command.as_str(), "/f"])?
                && reg_run(&["add", open_with_key.as_str(), "/f"])?;
            if !ok { return Err("Windows refused to add the right-click menu entry".into()); }
        } else {
            let _ = reg_run(&["delete", VERB, "/f"]);
            let _ = reg_run(&["delete", app_key.as_str(), "/f"]);
            let _ = reg_run(&["delete", open_with_key.as_str(), "/f"]);
        }
    }
    #[cfg(not(windows))]
    { let _ = enabled; }
    Ok(())
}

#[tauri::command]
fn classic_menu_set(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        if cfg!(debug_assertions) { return Ok(()); }
        const CLSID: &str = r"HKCU\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}";
        if enabled {
            let key = format!(r"{CLSID}\InprocServer32");
            if !reg_run(&["add", key.as_str(), "/ve", "/d", "", "/f"])? { return Err("Windows refused the change".into()); }
        } else {
            let _ = reg_run(&["delete", CLSID, "/f"]);
        }
    }
    #[cfg(not(windows))]
    { let _ = enabled; }
    Ok(())
}

#[derive(Serialize)]
struct WinRarInfo { found: bool, path: Option<String>, version: Option<String> }

fn winrar_exe() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("ProgramFiles") {
        candidates.push(PathBuf::from(&p).join("WinRAR").join("WinRAR.exe"));
        candidates.push(PathBuf::from(&p).join("WinRAR").join("Rar.exe"));
    }
    if let Ok(p) = std::env::var("ProgramFiles(x86)") {
        candidates.push(PathBuf::from(&p).join("WinRAR").join("WinRAR.exe"));
        candidates.push(PathBuf::from(&p).join("WinRAR").join("Rar.exe"));
    }
    if let Ok(p) = std::env::var("PATH") {
        for folder in std::env::split_paths(&p) {
            candidates.push(folder.join("WinRAR.exe"));
            candidates.push(folder.join("Rar.exe"));
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

fn output_dir() -> Result<PathBuf, String> {
    let base = dirs_downloads().ok_or("Could not locate your Downloads folder")?;
    let folder = base.join("Flicky");
    fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    Ok(folder)
}
fn dirs_downloads() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE").map(PathBuf::from).map(|p| p.join("Downloads"))
}
fn safe_name(name: &str) -> Result<&str, String> {
    let n = Path::new(name).file_name().and_then(|x| x.to_str()).ok_or("Invalid output filename")?;
    if n != name || name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Invalid output filename".into());
    }
    Ok(n)
}

#[tauri::command]
fn winrar_detect() -> WinRarInfo {
    match winrar_exe() {
        Some(path) => WinRarInfo { found: true, path: Some(path.to_string_lossy().to_string()), version: None },
        None => WinRarInfo { found: false, path: None, version: None },
    }
}

#[tauri::command]
async fn read_input(path: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = PathBuf::from(path);
        if !source.is_file() { return Err("Selected file no longer exists".to_string()); }
        fs::read(source).map_err(|e| format!("Could not read selected file: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
    .map(tauri::ipc::Response::new)
}

#[tauri::command]
fn input_size(path: String) -> Result<u64, String> {
    fs::metadata(&path).map(|m| m.len()).map_err(|e| format!("Could not read selected file: {e}"))
}

#[tauri::command]
fn output_exists(name: String) -> Result<bool, String> {
    let name = safe_name(&name)?;
    Ok(output_dir()?.join(name).exists())
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

#[tauri::command]
async fn output_write(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Invalid output data".into());
    };
    let bytes = bytes.clone();
    let name = request.headers().get("x-name").and_then(|v| v.to_str().ok()).map(percent_decode)
        .ok_or("Missing output filename")?;
    tauri::async_runtime::spawn_blocking(move || {
        let name = safe_name(&name)?;
        let path = output_dir()?.join(name);
        fs::write(&path, bytes).map_err(|e| format!("Could not save output: {e}"))?;
        Ok(path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn winrar_create_blocking(paths: Vec<String>, format: String, level: String, password: Option<String>) -> Result<String, String> {
    let exe = winrar_exe().ok_or("WinRAR is not installed")?;
    if paths.is_empty() { return Err("No files were selected".into()); }
    for p in &paths { if !Path::new(p).exists() { return Err(format!("Source file no longer exists: {p}")); } }
    let first = Path::new(&paths[0]).file_stem().and_then(|s| s.to_str()).unwrap_or("Archive");
    let ext = if format.eq_ignore_ascii_case("rar") { "rar" } else { "zip" };
    let name = format!("{first}_archive.{ext}");
    let folder = output_dir()?;
    let mut dest = folder.join(&name);
    if dest.exists() {
        let mut i = 1;
        loop {
            let candidate = folder.join(format!("{first}_archive ({i}).{ext}"));
            if !candidate.exists() { dest = candidate; break; }
            i += 1;
        }
    }
    let mut cmd = Command::new(exe);
    quiet(&mut cmd);
    cmd.arg("a").arg("-ep1").arg("-y");
    let method = match level.as_str() { "store" => "0", "fast" => "1", "good" => "7", "best" => "5", _ => "3" };
    cmd.arg(format!("-m{method}"));
    if let Some(pw) = password.filter(|p| !p.is_empty()) { cmd.arg(format!("-p{pw}")); }
    cmd.arg(&dest);
    for p in &paths { cmd.arg(p); }
    let result = cmd.output().map_err(|e| format!("Could not start WinRAR: {e}"))?;
    if !result.status.success() {
        let detail = String::from_utf8_lossy(&result.stderr);
        return Err(if detail.trim().is_empty() { "WinRAR could not create the archive".into() } else { detail.to_string() });
    }
    Ok(dest.to_string_lossy().to_string())
}

#[derive(Serialize)]
struct ExtractResult { ok: bool, error: Option<String>, message: Option<String> }

fn winrar_extract_blocking(path: String, existing: String, password: Option<String>, dest_base: Option<String>) -> ExtractResult {
    let Some(exe) = winrar_exe() else {
        return ExtractResult { ok: false, error: Some("failed".into()), message: Some("WinRAR is not installed".into()) };
    };
    let archive = PathBuf::from(&path);
    if !archive.is_file() {
        return ExtractResult { ok: false, error: Some("failed".into()), message: Some("Archive file no longer exists".into()) };
    }
    let stem = archive.file_stem().and_then(|s| s.to_str()).unwrap_or("Extracted");
    let base = match dest_base.filter(|d| !d.trim().is_empty()) {
        Some(d) => PathBuf::from(d),
        None => output_dir().unwrap_or_else(|_| archive.parent().unwrap_or(Path::new(".")).to_path_buf()),
    };
    let mut dest = base.join(stem);
    if dest.exists() && existing == "ask" {
        return ExtractResult { ok: false, error: Some("exists".into()), message: Some("Destination folder already exists".into()) };
    }
    if dest.exists() && existing == "new" {
        let mut i = 1;
        loop {
            let candidate = base.join(format!("{stem} ({i})"));
            if !candidate.exists() { dest = candidate; break; }
            i += 1;
        }
    }
    if let Err(e) = fs::create_dir_all(&dest) {
        return ExtractResult { ok: false, error: Some("failed".into()), message: Some(e.to_string()) };
    }
    let mut cmd = Command::new(exe);
    quiet(&mut cmd);
    cmd.arg("x").arg("-y").arg("-o+");
    if let Some(pw) = password.filter(|p| !p.is_empty()) { cmd.arg(format!("-p{pw}")); }
    else { cmd.arg("-p-"); }
    cmd.arg(&archive).arg(format!("{}\\", dest.to_string_lossy()));
    match cmd.output() {
        Ok(result) if result.status.success() => ExtractResult { ok: true, error: None, message: None },
        Ok(result) => {
            let msg = format!("{} {}", String::from_utf8_lossy(&result.stdout), String::from_utf8_lossy(&result.stderr));
            let lower = msg.to_lowercase();
            if lower.contains("password") || lower.contains("checksum") {
                ExtractResult { ok: false, error: Some("password".into()), message: Some("Incorrect or required password".into()) }
            } else {
                ExtractResult { ok: false, error: Some("failed".into()), message: Some("WinRAR could not extract this archive".into()) }
            }
        }
        Err(e) => ExtractResult { ok: false, error: Some("failed".into()), message: Some(e.to_string()) }
    }
}

#[tauri::command]
async fn winrar_create(paths: Vec<String>, format: String, level: String, password: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || winrar_create_blocking(paths, format, level, password))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn winrar_extract(path: String, existing: String, password: Option<String>, dest: Option<String>) -> ExtractResult {
    tauri::async_runtime::spawn_blocking(move || winrar_extract_blocking(path, existing, password, dest))
        .await
        .unwrap_or_else(|e| ExtractResult { ok: false, error: Some("failed".into()), message: Some(e.to_string()) })
}

fn rar_console_exe() -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(gui) = winrar_exe() { if let Some(d) = gui.parent() { dirs.push(d.to_path_buf()); } }
    if let Ok(p) = std::env::var("ProgramFiles") { dirs.push(PathBuf::from(p).join("WinRAR")); }
    if let Ok(p) = std::env::var("ProgramFiles(x86)") { dirs.push(PathBuf::from(p).join("WinRAR")); }
    for d in dirs {
        for n in ["Rar.exe", "UnRAR.exe"] {
            let c = d.join(n);
            if c.is_file() { return Some(c); }
        }
    }
    None
}

#[derive(Serialize)]
struct ArchiveListing { ok: bool, entries: Vec<String>, truncated: bool, error: Option<String>, message: Option<String> }

fn archive_fail(error: &str, message: &str) -> ArchiveListing {
    ArchiveListing { ok: false, entries: vec![], truncated: false, error: Some(error.into()), message: Some(message.into()) }
}

fn needs_password(text: &str) -> bool {
    let t = text.to_lowercase();
    t.contains("password") || t.contains("checksum error") || t.contains("encrypted")
}

fn archive_list_blocking(path: String, password: Option<String>) -> ArchiveListing {
    let Some(exe) = rar_console_exe() else { return archive_fail("failed", "WinRAR’s console tool (Rar.exe) was not found"); };
    if !Path::new(&path).is_file() { return archive_fail("failed", "Archive file no longer exists"); }
    let mut cmd = Command::new(exe);
    quiet(&mut cmd);

    cmd.arg("lb").arg("-y");
    match password.filter(|p| !p.is_empty()) { Some(pw) => { cmd.arg(format!("-p{pw}")); } None => { cmd.arg("-p-"); } }
    cmd.arg(&path);
    match cmd.output() {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            if !out.status.success() {
                if needs_password(&format!("{stdout} {stderr}")) { return archive_fail("password", "Incorrect or required password"); }
                return archive_fail("failed", "WinRAR could not read this archive");
            }
            const MAX: usize = 2000;
            let all: Vec<String> = stdout.lines().map(|s| s.trim_end().to_string()).filter(|s| !s.is_empty()).collect();

            if all.is_empty() && !stderr.trim().is_empty() {
                return archive_fail("failed", stderr.trim());
            }
            let truncated = all.len() > MAX;
            ArchiveListing { ok: true, entries: all.into_iter().take(MAX).collect(), truncated, error: None, message: None }
        }
        Err(e) => archive_fail("failed", &e.to_string()),
    }
}

#[tauri::command]
async fn archive_list(path: String, password: Option<String>) -> ArchiveListing {
    tauri::async_runtime::spawn_blocking(move || archive_list_blocking(path, password))
        .await
        .unwrap_or_else(|e| archive_fail("failed", &e.to_string()))
}

fn archive_test_blocking(path: String, password: Option<String>) -> ArchiveListing {
    let Some(exe) = rar_console_exe() else { return archive_fail("failed", "WinRAR’s console tool (Rar.exe) was not found"); };
    if !Path::new(&path).is_file() { return archive_fail("failed", "Archive file no longer exists"); }
    let mut cmd = Command::new(exe);
    quiet(&mut cmd);
    cmd.arg("t").arg("-idq").arg("-y");
    match password.filter(|p| !p.is_empty()) { Some(pw) => { cmd.arg(format!("-p{pw}")); } None => { cmd.arg("-p-"); } }
    cmd.arg(&path);
    match cmd.output() {
        Ok(out) if out.status.success() => ArchiveListing { ok: true, entries: vec![], truncated: false, error: None, message: None },
        Ok(out) => {
            let text = format!("{} {}", String::from_utf8_lossy(&out.stdout), String::from_utf8_lossy(&out.stderr));
            if needs_password(&text) { archive_fail("password", "Incorrect or required password") }
            else { archive_fail("failed", "The archive is damaged or incomplete") }
        }
        Err(e) => archive_fail("failed", &e.to_string()),
    }
}

#[tauri::command]
async fn archive_test(path: String, password: Option<String>) -> ArchiveListing {
    tauri::async_runtime::spawn_blocking(move || archive_test_blocking(path, password))
        .await
        .unwrap_or_else(|e| archive_fail("failed", &e.to_string()))
}

#[tauri::command]
fn archive_open(path: String) -> Result<(), String> {
    let exe = winrar_exe()
        .filter(|p| p.file_name().and_then(|n| n.to_str()).map(|n| n.eq_ignore_ascii_case("WinRAR.exe")).unwrap_or(false))
        .ok_or("WinRAR is not installed")?;
    Command::new(exe).arg(&path).spawn().map_err(|e| format!("Could not start WinRAR: {e}"))?;
    Ok(())
}

#[derive(Serialize)]
struct EngineStatus { ffmpeg: bool, documents: bool, winrar: bool, winget: bool }

fn winget_exe() -> Option<PathBuf> {
    let path = std::env::var("PATH").unwrap_or_default();
    for folder in std::env::split_paths(&path) {
        let p = folder.join("winget.exe");
        if p.is_file() { return Some(p); }
    }

    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
        .map(|p| p.join(r"Microsoft\WindowsApps\winget.exe"));
    local.filter(|p| p.is_file())
}

fn engine_install_blocking(id: String) -> Result<String, String> {

    let package = match id.as_str() {
        "ffmpeg" => "Gyan.FFmpeg",
        "documents" => "TheDocumentFoundation.LibreOffice",
        "winrar" => "RARLab.WinRAR",
        _ => return Err("Unknown engine. Installation was cancelled.".into()),
    };
    let winget = winget_exe().unwrap_or_else(|| PathBuf::from("winget"));
    let mut cmd = Command::new(winget);
    quiet(&mut cmd);
    let output = cmd
        .args(["install", "--id", package, "--exact", "--source", "winget", "--silent",
               "--disable-interactivity", "--accept-package-agreements", "--accept-source-agreements"])
        .output()
        .map_err(|e| format!("Could not start winget ({e}). Install or update 'App Installer' from the Microsoft Store, then retry."))?;

    let code = output.status.code().unwrap_or(0);
    let ok = output.status.success() || code == -1978335135 || code == -1978335189;
    if !ok {
        let detail = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let message = if !detail.trim().is_empty() { detail.trim().to_string() } else { stdout.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("winget installation failed").to_string() };
        return Err(format!("Could not install {package} (exit {code}): {message}"));
    }
    Ok(format!("{package} installation completed. Flicky will re-check the engine now."))
}

#[tauri::command]
async fn engine_install(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || engine_install_blocking(id))
        .await
        .map_err(|e| e.to_string())?
}

fn find_program(names: &[&str]) -> Option<PathBuf> {
    let path = std::env::var("PATH").unwrap_or_default();
    for folder in std::env::split_paths(&path) {
        for name in names {
            let p = folder.join(name);
            if p.is_file() { return Some(p); }
        }
    }

    if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        let winget_root = local.join("Microsoft").join("WinGet");
        for name in names {
            let link = winget_root.join("Links").join(name);
            if link.is_file() { return Some(link); }
        }
        if let Ok(entries) = fs::read_dir(winget_root.join("Packages")) {
            for entry in entries.flatten() {
                if !entry.file_name().to_string_lossy().starts_with("Gyan.FFmpeg") { continue; }
                if let Ok(subs) = fs::read_dir(entry.path()) {
                    for sub in subs.flatten() {
                        for name in names {
                            let candidate = sub.path().join("bin").join(name);
                            if candidate.is_file() { return Some(candidate); }
                        }
                    }
                }
            }
        }
    }
    if let Ok(p) = std::env::var("ProgramFiles") {
        for name in names {
            let candidate = PathBuf::from(&p).join("ffmpeg").join("bin").join(name);
            if candidate.is_file() { return Some(candidate); }
        }
    }
    None
}
fn ffmpeg_exe() -> Option<PathBuf> { find_program(&["ffmpeg.exe", "ffmpeg"]) }
fn soffice_exe() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(p) = std::env::var("ProgramFiles") { candidates.push(PathBuf::from(p).join("LibreOffice").join("program").join("soffice.exe")); }
    if let Ok(p) = std::env::var("ProgramFiles(x86)") { candidates.push(PathBuf::from(p).join("LibreOffice").join("program").join("soffice.exe")); }
    candidates.into_iter().find(|p| p.is_file()).or_else(|| find_program(&["soffice.exe", "soffice"]))
}
#[tauri::command]
fn engine_status() -> EngineStatus {
    EngineStatus { ffmpeg: ffmpeg_exe().is_some(), documents: soffice_exe().is_some(), winrar: winrar_exe().is_some(), winget: winget_exe().is_some() }
}

fn engine_convert_blocking(path: String, target: String, engine: String, output_name: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    if !source.is_file() { return Err("Source file no longer exists".into()); }
    let out_dir = output_dir()?;
    let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("Converted");
    let ext = target.trim_start_matches('.').to_lowercase();
    let output_name = safe_name(&output_name)?;
    let destination = out_dir.join(output_name);
    if engine == "ffmpeg" {
        let exe = ffmpeg_exe().ok_or("FFmpeg is not installed. Install FFmpeg and add it to PATH.")?;
        let mut cmd = Command::new(exe);
        quiet(&mut cmd);
        cmd.arg("-y").arg("-i").arg(&source);
        match ext.as_str() {
            "mp3" => { cmd.args(["-vn", "-codec:a", "libmp3lame", "-q:a", "2"]); }
            "aac" => { cmd.args(["-vn", "-c:a", "aac", "-b:a", "192k"]); }
            "flac" => { cmd.args(["-vn", "-c:a", "flac"]); }
            "ogg" => { cmd.args(["-vn", "-c:a", "libvorbis", "-q:a", "5"]); }
            "gif" => { cmd.args(["-vf", "fps=15,scale=960:-1:flags=lanczos"]); }
            "webm" => { cmd.args(["-c:v", "libvpx-vp9", "-c:a", "libopus"]); }
            "mp4" | "mov" => { cmd.args(["-c:v", "libx264", "-c:a", "aac", "-movflags", "+faststart"]); }
            "mkv" => { cmd.args(["-c:v", "libx264", "-c:a", "aac"]); }
            _ => {}
        }
        let result = cmd.arg(&destination).output().map_err(|e| format!("Could not start FFmpeg: {e}"))?;
        if !result.status.success() {
            let err = String::from_utf8_lossy(&result.stderr);
            return Err(err.lines().last().unwrap_or("FFmpeg conversion failed").to_string());
        }
    } else if engine == "documents" {
        let exe = soffice_exe().ok_or("LibreOffice is not installed")?;
        let temp_dir = std::env::temp_dir().join(format!("flicky-convert-{}", std::process::id()));
        fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
        let mut soffice = Command::new(exe);
        quiet(&mut soffice);
        let src_ext = source.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        soffice.arg("--headless");

        if src_ext == "pdf" {
            soffice.arg(if ext == "pptx" || ext == "odp" { "--infilter=impress_pdf_import" } else { "--infilter=writer_pdf_import" });
        }
        let convert_to = if ext == "txt" { "txt:Text (encoded):UTF8".to_string() } else { ext.clone() };
        let result = soffice.arg("--convert-to").arg(&convert_to).arg("--outdir").arg(&temp_dir).arg(&source)
            .output().map_err(|e| format!("Could not start LibreOffice: {e}"))?;
        if !result.status.success() { let _ = fs::remove_dir_all(&temp_dir); return Err("LibreOffice could not convert this document".into()); }
        let generated = temp_dir.join(format!("{stem}.{ext}"));
        if !generated.exists() { let _ = fs::remove_dir_all(&temp_dir); return Err("LibreOffice did not create the expected output file".into()); }
        fs::rename(&generated, &destination).map_err(|e| format!("Could not move converted document into Downloads\\Flicky: {e}"))?;
        let _ = fs::remove_dir_all(&temp_dir);
    } else { return Err("Unknown conversion engine".into()); }
    if !destination.exists() { return Err("The conversion engine did not create an output file".into()); }
    Ok(destination.to_string_lossy().to_string())
}

#[tauri::command]
async fn engine_convert(path: String, target: String, engine: String, output_name: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || engine_convert_blocking(path, target, engine, output_name))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()

        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let files = orbit_paths_from_args(&args);
            if !files.is_empty() { queue_orbit(app, files); }
            else if !args.iter().any(|a| a == "--autostart") { show_main(app); }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(PendingOrbit::default())
        .manage(OrbitQueue::default())
        .manage(HotkeyState::default())
        .setup(|app| {

            let args: Vec<String> = std::env::args().collect();
            let files = orbit_paths_from_args(&args);
            if !files.is_empty() { queue_orbit(app.handle(), files); }
            else if !args.iter().any(|a| a == "--autostart") { show_main(app.handle()); }
            let open = MenuItem::with_id(app, "open", "Open Flicky", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("flicky-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Flicky")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })

        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" || window.label() == "orbit" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            winrar_detect, winrar_create, winrar_extract, archive_list, archive_test, archive_open,
            output_exists, output_write, read_input, input_size, engine_status, engine_install, engine_convert,
            show_main_window, quick_orbit, overlay_hide, overlay_take_pending, overlay_dispatch, overlay_status, startup_set, explorer_menu_set, classic_menu_set, set_global_shortcut, set_hotkey_paused
        ])
        .run(tauri::generate_context!())
        .expect("error while running Flicky");
}
