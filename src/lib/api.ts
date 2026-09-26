const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

interface ApiResponse {
  txid: number;
  row?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function apiPost(table: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiDelete(table: string, id: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/${table}/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiPatch(table: string, id: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/${table}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiCreateList(data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiDeleteList(id: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${id}/delete`, { method: "DELETE" });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiUpdateList(id: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${id}/update`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiUnstarRepo(id: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/repos/${id}/unstar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiAddRepoToList(listId: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${listId}/add-repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

export async function apiRemoveRepoFromList(listId: string, repoId: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${listId}/remove-repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_id: repoId }),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}
