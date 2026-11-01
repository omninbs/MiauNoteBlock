// MiauNoteBlock 桌面 / 移动端共用入口。

// 在系统默认浏览器中打开外部链接。
// WebView（含 MSIX 安装版）默认不会跳转外部 http/https，需由此命令交给系统处理。
// 安全：仅允许 http/https，避免被用来执行任意协议。
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let u = url.trim().to_string();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err("仅允许打开 http/https 链接".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // 隐藏控制台窗口
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // explorer.exe 直接调用 ShellExecute，不经过 cmd，URL 中的 & 等字符不会被解析
        std::process::Command::new("explorer.exe")
            .arg(&u)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&u)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&u)
            .spawn()
            .map_err(|e| format!("打开链接失败: {e}"))?;
    }

    Ok(())
}

// ---------------- 桌面端文件对话框 / 读写 ----------------
// 全部为自定义命令，不引入 tauri-plugin-dialog / tauri-plugin-fs，
// 因此无需新增 capabilities ACL 配置（避免插件版本与 Tauri 不匹配）。

#[tauri::command]
async fn pick_file(extensions: Vec<String>) -> Option<String> {
    let filters: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let mut dialog = rfd::AsyncFileDialog::new();
    if !filters.is_empty() {
        dialog = dialog.add_filter("支持的文件", filters.as_slice());
    }
    dialog
        .pick_file()
        .await
        .map(|f| f.path().to_string_lossy().to_string())
}

#[tauri::command]
async fn pick_save_path(default_name: String, extensions: Vec<String>) -> Option<String> {
    let filters: Vec<&str> = extensions.iter().map(|s| s.as_str()).collect();
    let mut dialog = rfd::AsyncFileDialog::new().set_file_name(&default_name);
    if !filters.is_empty() {
        dialog = dialog.add_filter("支持的文件", filters.as_slice());
    }
    dialog
        .save_file()
        .await
        .map(|f| f.path().to_string_lossy().to_string())
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("读取失败: {e}"))
}

// 大文件（音频导出可达数十 MB）若整块走 JSON IPC 会长时间阻塞，
// 因此前端按块传 base64，这里逐块解码追加写入。
#[tauri::command]
fn write_file_begin(path: String) -> Result<(), String> {
    std::fs::write(&path, b"").map_err(|e| format!("创建文件失败: {e}"))
}

#[tauri::command]
fn write_file_chunk(path: String, base64: String) -> Result<(), String> {
    use base64::Engine;
    use std::io::Write;
    let data = base64::engine::general_purpose::STANDARD
        .decode(base64.as_bytes())
        .map_err(|e| format!("数据解码失败: {e}"))?;
    let mut f = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| format!("打开文件失败: {e}"))?;
    f.write_all(&data).map_err(|e| format!("写入失败: {e}"))
}

#[tauri::command]
fn set_app_title(window: tauri::WebviewWindow, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_external,
            pick_file,
            pick_save_path,
            read_file_bytes,
            write_file_begin,
            write_file_chunk,
            set_app_title
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}