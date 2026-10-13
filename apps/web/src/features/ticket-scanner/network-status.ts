export interface NetworkStatusState {
  isOnline: boolean; // True ONLY when server is reachable
  isServerReachable: boolean;
  browserOnline: boolean;
  lastCheckedAt: string | null;
  serverError: string | null;
}

type StatusListener = (state: NetworkStatusState) => void;
const listeners = new Set<StatusListener>();

let currentState: NetworkStatusState = {
  isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  isServerReachable: typeof navigator !== "undefined" ? navigator.onLine : true,
  browserOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
  lastCheckedAt: null,
  serverError: null,
};

// Test override mechanism
let mockServerReachable: boolean | null = null;

export function _setMockServerReachableForTesting(reachable: boolean | null): void {
  mockServerReachable = reachable;
  if (reachable !== null) {
    currentState = {
      isOnline: reachable,
      isServerReachable: reachable,
      browserOnline: reachable,
      lastCheckedAt: new Date().toISOString(),
      serverError: reachable ? null : "Mất kết nối máy chủ",
    };
    notifyListeners();
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener({ ...currentState });
    } catch (err) {
      console.error("Lỗi listener trạng thái mạng:", err);
    }
  }
}

export function getCurrentNetworkStatus(): NetworkStatusState {
  return { ...currentState };
}

export async function checkServerHealth(timeoutMs = 3000): Promise<boolean> {
  if (mockServerReachable !== null) {
    return mockServerReachable;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  if (typeof window === "undefined") {
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("/api/health", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function markServerOnline(): void {
  const changed = !currentState.isOnline || !currentState.isServerReachable;
  currentState = {
    isOnline: true,
    isServerReachable: true,
    browserOnline: true,
    lastCheckedAt: new Date().toISOString(),
    serverError: null,
  };
  if (changed) {
    notifyListeners();
  }
}

export function markServerOffline(reason = "Mất kết nối với máy chủ"): void {
  const changed = currentState.isOnline;
  currentState = {
    ...currentState,
    isOnline: false,
    isServerReachable: false,
    lastCheckedAt: new Date().toISOString(),
    serverError: reason,
  };
  if (changed) {
    notifyListeners();
  }
}

let globalListenerRegistered = false;
let heartbeatIntervalId: number | null = null;

function setupGlobalListeners(): void {
  if (typeof window === "undefined" || globalListenerRegistered) return;
  globalListenerRegistered = true;

  const handleOnline = () => {
    currentState.browserOnline = true;
    void verifyAndBroadcast();
  };

  const handleOffline = () => {
    currentState = {
      isOnline: false,
      isServerReachable: false,
      browserOnline: false,
      lastCheckedAt: new Date().toISOString(),
      serverError: "Không có kết nối mạng",
    };
    notifyListeners();
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Periodic heartbeat every 30s
  heartbeatIntervalId = window.setInterval(() => {
    if (listeners.size > 0 && (typeof navigator === "undefined" || navigator.onLine)) {
      void verifyAndBroadcast();
    }
  }, 30000);
}

async function verifyAndBroadcast(): Promise<boolean> {
  const reachable = await checkServerHealth();
  currentState = {
    isOnline: reachable,
    isServerReachable: reachable,
    browserOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    lastCheckedAt: new Date().toISOString(),
    serverError: reachable ? null : "Không thể kết nối máy chủ",
  };
  notifyListeners();
  return reachable;
}

export function subscribeNetworkStatus(
  listener: StatusListener,
  options: { checkImmediately?: boolean } = {},
): () => void {
  listeners.add(listener);
  setupGlobalListeners();

  // Initial notification with current state
  listener({ ...currentState });

  if (options.checkImmediately !== false && typeof window !== "undefined") {
    void verifyAndBroadcast();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      // If no listeners left, clean up interval
      if (heartbeatIntervalId !== null) {
        window.clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
      }
      globalListenerRegistered = false;
    }
  };
}
