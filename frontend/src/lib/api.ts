import { AuthUser, RegisterPayload, TokenResponse } from "@/types/auth";

const RAW_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, "");

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
};

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", token, body = null, headers = {} } = options;
  const requestUrl = API_BASE_URL ? `${API_BASE_URL}${path}` : path;

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method,
      body,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    const configuredBase = API_BASE_URL || "<same-origin>";
    throw new Error(
      `Network error: unable to reach API at ${configuredBase}. ` +
      "Set VITE_API_BASE_URL to your live backend URL (https://...)."
    );
  }

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        errorMessage = String(payload.detail);
      }
    } catch {
      // Ignore JSON parse failures for non-JSON errors.
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export async function loginApi(email: string, password: string): Promise<TokenResponse> {
  const formData = new URLSearchParams();

  formData.set("username", email);
  formData.set("password", password);

  return apiRequest<TokenResponse>("/auth/login", {
    method: "POST",
    body: formData,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
}

export async function oauthExchangeApi(accessToken: string, provider: string = "google"): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/auth/oauth/exchange", {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken, provider }),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function registerApi(payload: RegisterPayload): Promise<AuthUser> {
  return apiRequest<AuthUser>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function meApi(token: string): Promise<AuthUser> {
  return apiRequest<AuthUser>("/auth/me", { token });
}

export async function logoutApi(token: string): Promise<void> {
  await apiRequest<{ message: string }>("/auth/logout", {
    method: "POST",
    token,
  });
}

export async function protectedGetApi<T>(path: string, token: string): Promise<T> {
  return apiRequest<T>(path, { token });
}

export async function protectedPostApi<T>(
  path: string,
  token: string,
  payload: unknown,
): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export async function protectedPatchApi<T>(
  path: string,
  token: string,
  payload: unknown,
): Promise<T> {
  return apiRequest<T>(path, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export { API_BASE_URL };
