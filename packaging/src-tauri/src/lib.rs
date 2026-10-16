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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_external])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}