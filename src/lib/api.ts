const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

interface ApiResponse {
  txid: number;
  row?: Record<string, unknown>;
  [key: string]: unknown;
}

// The server answers a refused write with `{ error }`, often GitHub's own reason,
// which says more than the status code.
async function readResponse(response: Response): Promise<ApiResponse> {
  if (response.ok) return response.json();
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(body?.error ?? `API error: ${response.status}`);
}

export async function apiPost(table: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readResponse(response);
}

export async function apiDelete(table: string, id: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/${table}/${id}`, { method: "DELETE" });
  return readResponse(response);
}

export async function apiPatch(table: string, id: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/${table}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readResponse(response);
}

export async function apiCreateList(data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readResponse(response);
}

export async function apiDeleteList(id: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${id}/delete`, { method: "DELETE" });
  return readResponse(response);
}

export async function apiUpdateList(id: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${id}/update`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readResponse(response);
}

export async function apiUnstarRepo(id: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/repos/${id}/unstar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return readResponse(response);
}

export async function apiAddRepoToList(listId: string, data: Record<string, unknown>): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${listId}/add-repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return readResponse(response);
}

export async function apiRemoveRepoFromList(listId: string, repoId: string): Promise<ApiResponse> {
  const response = await fetch(`${API_URL}/api/lists/${listId}/remove-repo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_id: repoId }),
  });
  return readResponse(response);
}
