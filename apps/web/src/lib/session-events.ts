export function notifySessionChanged() {
  // A deliberate login/logout invalidates the cached offline identity, never
  // the durable scan queue. The scanner obtains a fresh identity from the API.
  try {
    localStorage.removeItem("scanner.staff-identity");
  } catch {
    /* Storage-disabled devices cannot use offline scanning. */
  }
  window.dispatchEvent(new Event("account-session-changed"));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("account-session");
    channel.postMessage("changed");
    channel.close();
  }
}
