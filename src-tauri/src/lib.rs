use tauri::menu::{
    AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();

            // ── App menu (macOS only — the leftmost "DevBoard" menu) ──────────
            let about_metadata = AboutMetadataBuilder::new()
                .name(Some("DevBoard"))
                .version(Some(env!("CARGO_PKG_VERSION")))
                .authors(Some(vec!["MishoWave".to_string()]))
                .website(Some("https://mischa.itch.io/devboard"))
                .build();

            let app_menu = SubmenuBuilder::new(handle, "DevBoard")
                .item(&PredefinedMenuItem::about(handle, None, Some(about_metadata))?)
                .separator()
                .item(&PredefinedMenuItem::services(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(handle, None)?)
                .item(&PredefinedMenuItem::hide_others(handle, None)?)
                .item(&PredefinedMenuItem::show_all(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(handle, None)?)
                .build()?;

            // ── File ─────────────────────────────────────────────────────────
            let new_board = MenuItemBuilder::new("New Board")
                .id("new_board")
                .accelerator("CmdOrCtrl+Shift+N")
                .build(handle)?;
            let save = MenuItemBuilder::new("Save")
                .id("save")
                .accelerator("CmdOrCtrl+S")
                .build(handle)?;
            let save_as = MenuItemBuilder::new("Save As…")
                .id("save_as")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(handle)?;
            let export_png = MenuItemBuilder::new("Export PNG")
                .id("export_png")
                .build(handle)?;

            let file_menu = SubmenuBuilder::new(handle, "File")
                .item(&new_board)
                .separator()
                .item(&save)
                .item(&save_as)
                .separator()
                .item(&export_png)
                .separator()
                .item(&PredefinedMenuItem::close_window(handle, None)?)
                .build()?;

            // ── Edit ─────────────────────────────────────────────────────────
            let edit_menu = SubmenuBuilder::new(handle, "Edit")
                .item(&PredefinedMenuItem::undo(handle, None)?)
                .item(&PredefinedMenuItem::redo(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(handle, None)?)
                .item(&PredefinedMenuItem::copy(handle, None)?)
                .item(&PredefinedMenuItem::paste(handle, None)?)
                .item(&PredefinedMenuItem::select_all(handle, None)?)
                .build()?;

            // ── View ─────────────────────────────────────────────────────────
            let zoom_in = MenuItemBuilder::new("Zoom In")
                .id("zoom_in")
                .accelerator("CmdOrCtrl+Equal")
                .build(handle)?;
            let zoom_out = MenuItemBuilder::new("Zoom Out")
                .id("zoom_out")
                .accelerator("CmdOrCtrl+Minus")
                .build(handle)?;
            let zoom_reset = MenuItemBuilder::new("Reset Zoom")
                .id("zoom_reset")
                .accelerator("CmdOrCtrl+0")
                .build(handle)?;
            let toggle_theme = MenuItemBuilder::new("Toggle Light / Dark")
                .id("toggle_theme")
                .build(handle)?;

            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&zoom_in)
                .item(&zoom_out)
                .item(&zoom_reset)
                .separator()
                .item(&toggle_theme)
                .separator()
                .item(&PredefinedMenuItem::fullscreen(handle, None)?)
                .build()?;

            // ── Window ───────────────────────────────────────────────────────
            let window_menu = SubmenuBuilder::new(handle, "Window")
                .item(&PredefinedMenuItem::minimize(handle, None)?)
                .item(&PredefinedMenuItem::maximize(handle, None)?)
                .separator()
                .item(&PredefinedMenuItem::close_window(handle, None)?)
                .build()?;

            // ── Help ─────────────────────────────────────────────────────────
            let itch_page = MenuItemBuilder::new("DevBoard on itch.io")
                .id("help_itch")
                .build(handle)?;
            let feedback = MenuItemBuilder::new("Send Feedback (@MishoWave)")
                .id("help_feedback")
                .build(handle)?;

            let help_menu = SubmenuBuilder::new(handle, "Help")
                .item(&itch_page)
                .item(&feedback)
                .build()?;

            // ── Assemble & set ───────────────────────────────────────────────
            let menu = MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&file_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;

            // ── Menu event handler ────────────────────────────────────────────
            app.on_menu_event(|app, event| {
                let window = match app.get_webview_window("main") {
                    Some(w) => w,
                    None => return,
                };
                match event.id().as_ref() {
                    "new_board"     => { let _ = window.emit("menu:new_board", ()); }
                    "save"          => { let _ = window.emit("menu:save", ()); }
                    "save_as"       => { let _ = window.emit("menu:save_as", ()); }
                    "export_png"    => { let _ = window.emit("menu:export_png", ()); }
                    "zoom_in"       => { let _ = window.emit("menu:zoom_in", ()); }
                    "zoom_out"      => { let _ = window.emit("menu:zoom_out", ()); }
                    "zoom_reset"    => { let _ = window.emit("menu:zoom_reset", ()); }
                    "toggle_theme"  => { let _ = window.emit("menu:toggle_theme", ()); }
                    "help_itch"     => {
                        let _ = window.emit("menu:open_url", "https://mischa.itch.io/devboard");
                    }
                    "help_feedback" => {
                        let _ = window.emit("menu:open_url", "https://x.com/MishoWave");
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running devboard");
}
