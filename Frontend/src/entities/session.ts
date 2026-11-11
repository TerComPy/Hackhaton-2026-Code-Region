import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ApiError, createApi, type Account, type Profile } from "../shared/api";
import { useCatalog } from "./store";
const storageKey = "starter.api.accessToken";
export function authMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return "Проверьте email, имя и пароль (от 8 до 128 символов).";
    if (error.status === 409) return "Этот email уже зарегистрирован. Войдите в аккаунт.";
    if (error.status === 401) return "Неверный email или пароль. Войдите повторно.";
    if (error.kind === "network") return "Не удалось подключиться к серверу. Повторите попытку.";
    if (error.kind === "timeout") return "Сервер не ответил вовремя. Повторите попытку.";
  }
  return "Не удалось загрузить аккаунт. Повторите попытку.";
}
export const useSession = defineStore("session", () => {
  const user = ref<Account | null>(null);
  const profile = ref<Profile | null>(null);
  const accessToken = ref<string>();
  const busy = ref(false);
  const notice = ref("");
  let generation = 0;
  let controller: AbortController | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let initialized = false;
  function persisted(value?: string) {
    try {
      if (value) sessionStorage.setItem(storageKey, value);
      else sessionStorage.removeItem(storageKey);
    } catch { /* Memory-only session remains available. */ }
  }
  function clear(message = "") {
    generation++;
    controller?.abort();
    clearTimeout(expiryTimer);
    user.value = null;
    profile.value = null;
    accessToken.value = undefined;
    busy.value = false;
    notice.value = message;
    persisted();
    const catalog = useCatalog();
    catalog.saved = [];
    catalog.about = "";
    catalog.reset();
  }
  function expiry(token: string) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
      return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
    } catch { return 0; }
  }
  function install(token: string) {
    const remaining = expiry(token) - Date.now();
    if (remaining <= 0) { clear("Сессия истекла. Войдите повторно."); return false; }
    accessToken.value = token;
    persisted(token);
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => clear("Сессия истекла. Войдите повторно."), Math.min(remaining, 2147483647));
    return true;
  }
  const api = createApi(undefined, () => accessToken.value, {
    onUnauthorized: rejected => {
      if (accessToken.value === rejected) clear("Сессия недействительна. Войдите повторно.");
    },
  });
  async function loadIdentity(id: number, signal: AbortSignal) {
    const identity = await api.me({ signal });
    const details = await api.profile({ signal });
    if (generation !== id) return;
    user.value = identity.user;
    profile.value = details.profile;
  }
  async function authenticate(mode: "login" | "register", credentials: { email: string; password: string; displayName: string }) {
    clear();
    const id = generation;
    controller = new AbortController();
    const signal = controller.signal;
    busy.value = true;
    try {
      const response = mode === "register"
        ? await api.register(credentials, { signal })
        : await api.login({ email: credentials.email, password: credentials.password }, { signal });
      if (id !== generation || !install(response.accessToken)) return;
      await loadIdentity(id, signal);
    } catch (e) {
      if (generation === id) clear(authMessage(e));
    } finally { if (generation === id) busy.value = false; }
  }
  async function restore() {
    if (initialized) return;
    initialized = true;
    let token: string | null = null;
    try { token = sessionStorage.getItem(storageKey); } catch { /* no saved session */ }
    if (!token) return;
    clear();
    if (!install(token)) return;
    const id = generation;
    controller = new AbortController();
    busy.value = true;
    try { await loadIdentity(id, controller.signal); }
    catch (e) { if (generation === id) clear(authMessage(e)); }
    finally { if (generation === id) busy.value = false; }
  }
  const authenticated = computed(() => !!user.value && !!profile.value && !!accessToken.value);
  return { user, profile, busy, notice, authenticated, authenticate, restore, clear, api };
});
