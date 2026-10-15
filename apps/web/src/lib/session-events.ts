export function notifySessionChanged() {
  window.dispatchEvent(new Event("account-session-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("account-session");
    channel.postMessage("changed");
    channel.close();
  }
}
