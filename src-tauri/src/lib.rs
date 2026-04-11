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

            // ── Tools submenu (inside View) ───────────────────────────────────
            let tool_select  = MenuItemBuilder::new("Select\tV")  .id("tool_select") .build(handle)?;
            let tool_pan     = MenuItemBuilder::new("Pan\tH")      .id("tool_pan")    .build(handle)?;
            let tool_sticky  = MenuItemBuilder::new("Sticky\tS")   .id("tool_sticky") .build(handle)?;
            let tool_shape   = MenuItemBuilder::new("Shape\tR")    .id("tool_shape")  .build(handle)?;
            let tool_text    = MenuItemBuilder::new("Text\tT")     .id("tool_text")   .build(handle)?;
            let tool_line    = MenuItemBuilder::new("Line\tL")     .id("tool_line")   .build(handle)?;
            let tool_section = MenuItemBuilder::new("Section\tF")  .id("tool_section").build(handle)?;
            let tool_image   = MenuItemBuilder::new("Image\tI")    .id("tool_image")  .build(handle)?;
            let tool_table   = MenuItemBuilder::new("Table\tG")    .id("tool_table")  .build(handle)?;
            let tool_link    = MenuItemBuilder::new("Link\tU")     .id("tool_link")   .build(handle)?;
            let tool_code    = MenuItemBuilder::new("Code Block\tK").id("tool_code")  .build(handle)?;
            let tool_task    = MenuItemBuilder::new("Task Card")   .id("tool_task")   .build(handle)?;
            let tool_sticker = MenuItemBuilder::new("Sticker")     .id("tool_sticker").build(handle)?;

            let tools_submenu = SubmenuBuilder::new(handle, "Tools")
                .item(&tool_select)
                .item(&tool_pan)
                .separator()
                .item(&tool_sticky)
                .item(&tool_shape)
                .item(&tool_text)
                .item(&tool_line)
                .separator()
                .item(&tool_section)
                .item(&tool_image)
                .item(&tool_table)
                .item(&tool_link)
                .separator()
                .item(&tool_code)
                .item(&tool_task)
                .item(&tool_sticker)
                .build()?;

            let view_menu = SubmenuBuilder::new(handle, "View")
                .item(&tools_submenu)
                .separator()
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
                    "tool_select"   => { let _ = window.emit("menu:tool", "select"); }
                    "tool_pan"      => { let _ = window.emit("menu:tool", "pan"); }
                    "tool_sticky"   => { let _ = window.emit("menu:tool", "sticky"); }
                    "tool_shape"    => { let _ = window.emit("menu:tool", "shape"); }
                    "tool_text"     => { let _ = window.emit("menu:tool", "text"); }
                    "tool_line"     => { let _ = window.emit("menu:tool", "line"); }
                    "tool_section"  => { let _ = window.emit("menu:tool", "section"); }
                    "tool_image"    => { let _ = window.emit("menu:tool", "image"); }
                    "tool_table"    => { let _ = window.emit("menu:tool", "table"); }
                    "tool_link"     => { let _ = window.emit("menu:tool", "link"); }
                    "tool_code"     => { let _ = window.emit("menu:tool", "code"); }
                    "tool_task"     => { let _ = window.emit("menu:tool", "task"); }
                    "tool_sticker"  => { let _ = window.emit("menu:tool", "sticker"); }
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running devboard");
}
