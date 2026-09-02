import type { Bootstrap, Role } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const CONFIGURED_WS_URL = process.env.NEXT_PUBLIC_WS_URL || "";

function fleetSocketUrl() {
  if (CONFIGURED_WS_URL) return CONFIGURED_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/fleet`;
}

const DEMO_CREDENTIALS: Record<Role, { username: string; password: string }> = {
  ADMIN: { username: "admin", password: "admin123" },
  DRIVER: { username: "driver", password: "driver123" },
  FIELD_OFFICER: { username: "field", password: "field123" },
};

export async function signIn(role: Role) {
  const response = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEMO_CREDENTIALS[role]),
  });
  if (!response.ok) throw new Error("Unable to sign in. Is the API running?");
  const data = await response.json();
  // Each workspace tab needs an independent role. localStorage is shared by all
  // tabs and caused Driver authentication to overwrite the Control Room token.
  sessionStorage.setItem("ner_token", data.access_token);
  sessionStorage.setItem("ner_user", JSON.stringify(data.user));
  localStorage.removeItem("ner_token");
  localStorage.removeItem("ner_user");
  return data;
}

export function token() {
  return typeof window === "undefined" ? "" : sessionStorage.getItem("ner_token") || "";
}

function roleForCurrentWorkspace(): Role | null {
  if (typeof window === "undefined") return null;
  if (window.location.pathname.startsWith("/admin")) return "ADMIN";
  if (window.location.pathname.startsWith("/driver")) return "DRIVER";
  if (window.location.pathname.startsWith("/field-officer")) return "FIELD_OFFICER";
  return null;
}

async function ensureWorkspaceToken() {
  if (token()) return token();
  const role = roleForCurrentWorkspace();
  if (!role) return "";
  await signIn(role);
  return token();
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const accessToken = await ensureWorkspaceToken();
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
  } catch {
    throw new Error(`NER-LOGIX API is temporarily unavailable at ${API_URL}. The action was not applied; retry when System Live returns.`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail || "Request failed");
  }
  return response.json();
}

export const getBootstrap = () => api<Bootstrap>("/api/v1/bootstrap");

export function connectFleetSocket(onMessage: (event: { type: string; data: any }) => void) {
  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let heartbeat = 0;
  let stopped = false;
  let attempt = 0;

  const connect = async () => {
    if (stopped) return;
    let accessToken = token();
    if (!accessToken) {
      try { accessToken = await ensureWorkspaceToken(); }
      catch {
        reconnectTimer = window.setTimeout(connect, 1000);
        return;
      }
    }
    if (stopped || !accessToken) return;
    socket = new WebSocket(fleetSocketUrl(), ["ner-logix", accessToken]);
    socket.onopen = () => { attempt = 0; onMessage({ type: "socket.online", data: true }); };
    socket.onmessage = (message) => {
      try { onMessage(JSON.parse(message.data)); }
      catch { onMessage({ type: "socket.error", data: "Invalid realtime event" }); }
    };
    heartbeat = window.setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send("ping"), 15000);
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      window.clearInterval(heartbeat);
      if (stopped) return;
      onMessage({ type: "socket.offline", data: false });
      reconnectTimer = window.setTimeout(connect, Math.min(10000, 1000 * 2 ** Math.min(attempt++, 3)));
    };
  };
  connect();
  return {
    close() {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeat);
      socket?.close();
    },
  };
}
