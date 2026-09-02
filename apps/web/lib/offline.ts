import { API_URL, token } from "./api";

export type QueuedRequest = { id?: number; path: string; method: string; body: any; createdAt: string; workspace?: "field"|"driver" };
const DB_NAME = "ner-logix-offline";
const STORE = "requests";

function workspaceForPath(path:string):"field"|"driver"{return path.startsWith("/api/v1/field/")?"field":"driver"}
function currentWorkspace():"field"|"driver"{return window.location.pathname.startsWith("/field-officer")?"field":"driver"}

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
    tx.objectStore(STORE).add({ path, method, body, createdAt: new Date().toISOString(), workspace: workspaceForPath(path) });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event("ner-offline-queue-change"));
}

export async function queuedRequests(): Promise<QueuedRequest[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.filter((item:QueuedRequest)=>(item.workspace||workspaceForPath(item.path))===currentWorkspace()).sort((left:QueuedRequest,right:QueuedRequest)=>right.createdAt.localeCompare(left.createdAt)));
    request.onerror = () => reject(request.error);
  });
}

export async function pendingCount(): Promise<number> {
  return (await queuedRequests()).length;
}

export async function flushQueue() {
  const db = await database();
  const allItems = await new Promise<QueuedRequest[]>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const items=allItems.filter((item)=>(item.workspace||workspaceForPath(item.path))===currentWorkspace());
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
  window.dispatchEvent(new Event("ner-offline-queue-change"));
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
