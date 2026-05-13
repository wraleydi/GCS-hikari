// Native mDNS browser for the `_ados._tcp.local.` service type
// broadcast by every ADOS agent (drone, ground station, future
// compute). Browsers can't do this in the sandbox; the Tauri Rust
// backend can. The frontend calls `discover_ados_agents()` on a
// poll and populates the existing pairing-store discoveredAgents
// surface in the AddNodeCard.
//
// The TXT-record contract is defined by
// ADOSDroneAgent/src/ados/services/discovery/__init__.py — keep
// the field map in sync if that file evolves.

use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;

const SERVICE_TYPE: &str = "_ados._tcp.local.";
const COLLECT_FOR: Duration = Duration::from_millis(1800);

/// Wire shape returned to the JS bridge. snake_case fields mirror
/// the agent's TXT-record keys so the JS adapter doesn't have to
/// guess. The frontend remaps to camelCase + the DiscoveredAgent
/// shape in pairing-store.
#[derive(Serialize, Clone, Debug)]
pub struct DiscoveredAgent {
    pub device_id: String,
    pub name: String,
    pub board: String,
    pub version: String,
    /// Pairing code while unpaired; empty when the agent is already
    /// paired to another owner.
    pub pairing_code: String,
    pub mdns_host: String,
    pub local_ip: Option<String>,
    /// "drone" | "ground-station" | "compute" | "lite" when emitted.
    pub profile: Option<String>,
    /// "direct" | "relay" | "receiver" on ground stations.
    pub role: Option<String>,
    /// True when the agent advertises paired=true. The UI filters
    /// these out by default since they're already owned.
    pub paired: bool,
}

#[tauri::command]
pub async fn discover_ados_agents() -> Result<Vec<DiscoveredAgent>, String> {
    let daemon = ServiceDaemon::new().map_err(|e| format!("mdns init: {e}"))?;
    let receiver = daemon
        .browse(SERVICE_TYPE)
        .map_err(|e| format!("mdns browse: {e}"))?;

    // Dedup by device_id; the daemon emits Resolved events for each
    // interface a service is reachable on, and we'd otherwise show
    // the same agent multiple times.
    let mut by_id: HashMap<String, DiscoveredAgent> = HashMap::new();

    let deadline = tokio::time::Instant::now() + COLLECT_FOR;
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        // Use try_recv inside a small sleep loop so we don't block
        // the tokio runtime on the sync mdns-sd Receiver.
        match receiver.try_recv() {
            Ok(event) => {
                if let ServiceEvent::ServiceResolved(info) = event {
                    let props = info.get_properties();
                    let txt: HashMap<String, String> = props
                        .iter()
                        .map(|p| (p.key().to_string(), p.val_str().to_string()))
                        .collect();
                    let device_id = txt.get("device_id").cloned().unwrap_or_default();
                    if device_id.is_empty() {
                        continue;
                    }
                    let mdns_host = info.get_hostname().to_string();
                    let local_ip = info
                        .get_addresses()
                        .iter()
                        .next()
                        .map(|a| a.to_string());
                    let agent = DiscoveredAgent {
                        device_id: device_id.clone(),
                        name: txt.get("name").cloned().unwrap_or_default(),
                        board: txt.get("board").cloned().unwrap_or_default(),
                        version: txt.get("version").cloned().unwrap_or_default(),
                        pairing_code: txt.get("code").cloned().unwrap_or_default(),
                        mdns_host,
                        local_ip,
                        profile: txt.get("profile").cloned(),
                        role: txt.get("role").cloned(),
                        paired: txt
                            .get("paired")
                            .map(|s| s.eq_ignore_ascii_case("true"))
                            .unwrap_or(false),
                    };
                    by_id.insert(device_id, agent);
                }
            }
            Err(_) => {
                // No event yet; yield to the runtime briefly.
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }

    // Best-effort shutdown; if it fails we just leak the daemon
    // until the next call. The Receiver dropping above already
    // stops new browse results.
    let _ = daemon.shutdown();

    let mut out: Vec<DiscoveredAgent> = by_id.into_values().collect();
    // Stable ordering by device_id so the frontend's render order
    // doesn't flicker between polls.
    out.sort_by(|a, b| a.device_id.cmp(&b.device_id));
    Ok(out)
}
