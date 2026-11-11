// Contract: Node-Back/docs/api/openapi.yaml. IDs and DECIMAL remain strings.
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
  description: string;
  requirements: string | null;
  responsibilities: string | null;
}
export interface Favorite {
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
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function createApi(
  base = import.meta.env.VITE_API_URL || "",
  token: () => string | undefined = () => undefined,
) {
  async function request<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const bearer = token();
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        payload?.error?.code || "HTTP_ERROR",
        payload?.error?.message || response.statusText,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }
  const query = (v: object) =>
    new URLSearchParams(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, String(x)]),
    ).toString();
  const id = encodeURIComponent;
  return {
    register: (v: { email: string; password: string; displayName: string }) =>
      request<AuthResponse>("/api/auth/register", "POST", v),
    login: (v: { email: string; password: string }) =>
      request<AuthResponse>("/api/auth/login", "POST", v),
    me: () => request<{ user: Account }>("/api/auth/me"),
    profile: () => request<{ profile: Profile }>("/api/profile"),
    updateProfile: (v: { displayName?: string; city?: string | null }) =>
      request<{ profile: Profile }>("/api/profile", "PATCH", v),
    vacancies: (v: Search = {}) =>
      request<Page<Vacancy>>("/api/vacancies?" + query(v)),
    vacancy: (v: string) =>
      request<{
        vacancy: VacancyCard;
        skills: { id: string; name: string; is_required: 0 | 1 }[];
      }>("/api/vacancies/" + id(v)),
    favorites: (page = 1) =>
      request<Page<Favorite>>(
        "/api/favorites?" + query({ page, pageSize: 100 }),
      ),
    save: (v: string) => request<void>("/api/favorites/" + id(v), "PUT"),
    remove: (v: string) => request<void>("/api/favorites/" + id(v), "DELETE"),
    outbound: (v: string) =>
      request<{ originalUrl: string }>(
        "/api/vacancies/" + id(v) + "/outbound-click",
        "POST",
      ),
  };
}
export const dataMode = import.meta.env.VITE_DATA_MODE || "mock";
if (!["mock", "api"].includes(dataMode))
  throw new Error("VITE_DATA_MODE must be mock or api");
