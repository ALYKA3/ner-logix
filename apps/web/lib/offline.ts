import { API_URL, token } from "./api";

type QueuedRequest = { id?: number; path: string; method: string; body: unknown; createdAt: string };
const DB_NAME = "ner-logix-offline";
const STORE = "requests";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueRequest(path: string, method: string, body: unknown) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ path, method, body, createdAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pendingCount(): Promise<number> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function flushQueue() {
  const db = await database();
  const items = await new Promise<QueuedRequest[]>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let sent = 0;
  for (const item of items) {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${item.path}`, {
        method: item.method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify(item.body),
      });
    } catch {
      continue;
    }
    if (response.ok && item.id) {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(item.id!);
        tx.oncomplete = () => resolve();
      });
      sent += 1;
    }
  }
  return sent;
}

export async function postOrQueue(path: string, body: unknown) {
  if (!navigator.onLine) {
    await queueRequest(path, "POST", body);
    return { queued: true };
  }
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ detail: `Request failed (${response.status})` }));
      const detail = Array.isArray(errorBody.detail) ? errorBody.detail.map((item:any)=>item.msg).join(", ") : errorBody.detail;
      throw new Error(detail || `Request failed (${response.status})`);
    }
    return response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      await queueRequest(path, "POST", body);
      return { queued: true };
    }
    throw error;
  }
}
