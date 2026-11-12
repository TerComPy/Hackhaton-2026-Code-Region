// Contract: Node-Back/docs/api/openapi.yaml. IDs and DECIMAL remain strings.
export interface AiSummary {
  simpleTitle: string;
  whatYouDo: string[];
  requirements: string[];
  conditions: string[];
  beginnerFriendly: boolean;
}
export type AiSummaryStatus = "pending" | "processing" | "done" | "failed" | "unavailable";
export interface AiSummaryResponse {
  status: AiSummaryStatus;
  display: "ai" | "original";
  summary: AiSummary | null;
  errorCode?: string;
}

export interface MatchDirection {
  name: string;
  what: string;
  why: string;
  evidence: string[];
  vacancies: Vacancy[];
}
export interface MatchResponse { directions: MatchDirection[] }

export interface Account {
  id: string;
  profileId: string;
  email: string;
  displayName: string;
  role: "user" | "admin";
}
export interface AuthResponse {
  user: Account;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}
export interface Profile {
  id: string;
  displayName: string;
  city: string | null;
}
export interface Vacancy {
  published_at?: string | null;
  salary_period?: string | null;
  salary_gross?: 0 | 1 | null;
  id: string;
  title: string;
  company_name: string | null;
  city: string | null;
  salary_min: string | null;
  salary_max: string | null;
  currency: string | null;
  original_url: string;
  source_name: string;
  status: "active" | "archived";
  work_format: "onsite" | "remote" | "hybrid" | "unknown";
}
export interface VacancyCard extends Vacancy {
  schedule_text: string | null;
  schedule_type: string | null;
  experience_months_min: number | null;
  description: string;
  requirements: string | null;
  responsibilities: string | null;
}
export interface Favorite {
  currency: string | null;
  salary_period: string | null;
  status: "active" | "archived";
  id: string;
  title: string;
  company_name: string | null;
  city: string | null;
  salary_min: string | null;
  salary_max: string | null;
  original_url: string;
  saved_at: string;
}
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
}
export interface Search {
  search?: string;
  city?: string;
  workFormat?: Vacancy["work_format"];
  minSalary?: number;
  onlyNoExperience?: boolean;
  page?: number;
  pageSize?: number;
}
export type ApiErrorKind = "http" | "network" | "timeout" | "aborted" | "invalid-response";
export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(public status: number, public code: string, message: string,
    public kind: ApiErrorKind = "http") { super(message); }
}
export interface RequestOptions { signal?: AbortSignal; timeoutMs?: number }
export interface ApiOptions {
  timeoutMs?: number;
  onUnauthorized?: (rejectedToken: string) => void;
}
export function createApi(
  base = import.meta.env.VITE_API_URL || "",
  token: () => string | undefined = () => undefined,
  options: ApiOptions = {},
) {
  async function request<T>(path: string, method = "GET", body?: unknown,
    config: RequestOptions = {}): Promise<T> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    config.signal?.addEventListener("abort", abort, { once: true });
    if (config.signal?.aborted) abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); },
      config.timeoutMs ?? options.timeoutMs ?? 10000);
    try {
      const bearer = token();
      const response = await fetch(base.replace(/\/$/, "") + path, {
        method, signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (response.status === 401 && bearer) options.onUnauthorized?.(bearer);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(response.status,
          typeof payload?.error?.code === "string" ? payload.error.code : "HTTP_ERROR",
          typeof payload?.error?.message === "string" ? payload.error.message : response.statusText || `HTTP ${response.status}`);
      }
      if (response.status === 204) return undefined as T;
      try { return await response.json() as T; }
      catch (e) {
        if (controller.signal.aborted) throw e;
        throw new ApiError(response.status, "INVALID_RESPONSE", "Некорректный ответ сервера", "invalid-response");
      }
    } catch (e) {
      if (controller.signal.aborted) throw new ApiError(0,
        timedOut ? "TIMEOUT" : "ABORTED",
        timedOut ? "Сервер не ответил вовремя" : "Запрос отменён", timedOut ? "timeout" : "aborted");
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, "NETWORK_ERROR", "Не удалось подключиться к серверу", "network");
    } finally {
      clearTimeout(timer);
      config.signal?.removeEventListener("abort", abort);
    }
  }
  const query = (v: object) =>
    new URLSearchParams(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, String(x)]),
    ).toString();
  const id = encodeURIComponent;
  return {
    health: (config?: RequestOptions) => request<{ status: "ok" }>("/api/health", "GET", undefined, config),
    ready: (config?: RequestOptions) => request<{ status: "ready"; database: "ok" }>("/api/ready", "GET", undefined, config),
    register: (v: { email: string; password: string; displayName: string }, config?: RequestOptions) =>
      request<AuthResponse>("/api/auth/register", "POST", v, config),
    login: (v: { email: string; password: string }, config?: RequestOptions) =>
      request<AuthResponse>("/api/auth/login", "POST", v, config),
    me: (config?: RequestOptions) => request<{ user: Account }>("/api/auth/me", "GET", undefined, config),
    profile: (config?: RequestOptions) => request<{ profile: Profile }>("/api/profile", "GET", undefined, config),
    updateProfile: (v: { displayName?: string; city?: string | null }, config?: RequestOptions) =>
      request<{ profile: Profile }>("/api/profile", "PATCH", v, config),
    vacancies: (v: Search = {}, config?: RequestOptions) =>
      request<Page<Vacancy>>("/api/vacancies?" + query(v), "GET", undefined, config),
    vacancy: (v: string, config?: RequestOptions) =>
      request<{
        vacancy: VacancyCard;
        skills: { id: string; name: string; is_required: 0 | 1 }[];
      }>("/api/vacancies/" + id(v), "GET", undefined, config),
    favorites: (page = 1, config?: RequestOptions, pageSize = 20) =>
      request<Page<Favorite>>(
        "/api/favorites?" + query({ page, pageSize }), "GET", undefined, config,
      ),
    save: (v: string, config?: RequestOptions) => request<void>("/api/favorites/" + id(v), "PUT", undefined, config),
    remove: (v: string, config?: RequestOptions) => request<void>("/api/favorites/" + id(v), "DELETE", undefined, config),
    match: (v: { about: string }, config?: RequestOptions) =>
      request<MatchResponse>("/api/match", "POST", v, config),
    aiSummary: (v: string, config?: RequestOptions) =>
      request<AiSummaryResponse>("/api/vacancies/" + id(v) + "/summary", "GET", undefined, config),
    enqueueAiSummary: (v: string, config?: RequestOptions) =>
      request<AiSummaryResponse>("/api/vacancies/" + id(v) + "/summary", "POST", undefined, config),
    outbound: (v: string, config?: RequestOptions) =>
      request<{ originalUrl: string }>(
        "/api/vacancies/" + id(v) + "/outbound-click",
        "POST", undefined, config,
      ),
  };
}
export const dataMode = import.meta.env.VITE_DATA_MODE || "mock";
if (!["mock", "api"].includes(dataMode))
  throw new Error("VITE_DATA_MODE must be mock or api");
