// Tauri 2 desktop wrapper for Altnautica Command. Entry point hands
// off to the library's `run` function so the Rust binary stays small
// and unit tests can call into the same setup.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    altnautica_command_tauri_lib::run();
}
