// MiauNoteBlock 桌面 / 移动端共用入口。
// 桌面端由 main.rs 调用；移动端 (Android) 由 tauri::mobile_entry_point 导出。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}