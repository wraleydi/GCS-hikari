// Altnautica Command Tauri 2 library entrypoint.
//
// Registers the `discover_ados_agents` command which lets the
// frontend ask the OS-native mDNS resolver for any agent
// broadcasting `_ados._tcp.local.` on the current LAN.

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::mdns::discover_ados_agents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
