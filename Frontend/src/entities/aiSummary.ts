import { onBeforeUnmount, ref, watch } from "vue";
import {
  ApiError, type AiSummary, type AiSummaryResponse, type AiSummaryStatus
} from "../shared/api";
import { useSession } from "./session";

const POLL_DELAY_MS = 1600;
const MAX_POLL_MS = 90_000;
type Mode = "original" | "plain";

function validSummary(input: unknown): input is AiSummary {
  if (!input || typeof input !== "object") return false;
  const summary = input as Partial<AiSummary>;
  return typeof summary.simpleTitle === "string" && summary.simpleTitle.trim().length > 0
    && typeof summary.beginnerFriendly === "boolean"
    && [summary.whatYouDo, summary.requirements, summary.conditions].every(
      v => Array.isArray(v) && v.every(line => typeof line === "string")
    );
}
function parseResponse(input: AiSummaryResponse): AiSummaryResponse {
  if (!input || !["pending", "processing", "done", "failed", "unavailable"].includes(input.status)
    || !["ai", "original"].includes(input.display)) throw Error("Invalid AI status");
  if (input.status === "done" && (input.display !== "ai" || !validSummary(input.summary)))
    throw Error("Invalid AI result");
  return input;
}
function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 503) return "ИИ пока не настроен на сервере. Оригинал вакансии доступен.";
    if (error.status === 401) return "Сессия истекла. Войдите повторно, чтобы получить пересказ.";
    if (error.status === 404) return "ИИ-пересказ для этой вакансии недоступен.";
    if (error.kind === "network" || error.kind === "timeout")
      return "Нет связи с сервером. Оригинал вакансии доступен.";
    if (error.kind === "aborted") return "";
  }
  return "Не удалось получить пересказ. Оригинал вакансии доступен.";
}

/** Source vacancy and authenticated identity own all requests, timers and cached UI state. */
export function useAiSummary(id: () => string | undefined, active: () => boolean) {
  const session = useSession();
  const mode = ref<Mode>("original");
  const summary = ref<AiSummary | null>(null);
  const status = ref<AiSummaryStatus>("unavailable");
  const loading = ref(false);
  const polling = ref(false);
  const error = ref("");
  let generation = 0;
  let request: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = 0;
  let wantsPlain = false;
  let stopped = false;

  function cancel() {
    generation++;
    request?.abort();
    request = undefined;
    clearTimeout(timer);
    timer = undefined;
    loading.value = false;
    polling.value = false;
  }
  function reset() {
    cancel();
    summary.value = null;
    mode.value = "original";
    status.value = "unavailable";
    error.value = "";
    deadline = 0;
    wantsPlain = false;
  }
  function available() {
    return !stopped && Boolean(id()) && active() && session.authenticated;
  }
  function apply(response: AiSummaryResponse) {
    const data = parseResponse(response);
    status.value = data.status;
    if (data.status === "done" && validSummary(data.summary)) {
      summary.value = data.summary;
      polling.value = false;
      if (wantsPlain) mode.value = "plain";
    } else {
      summary.value = null;
      mode.value = "original";
      polling.value = data.status === "pending" || data.status === "processing";
      if (data.status === "failed") error.value = "ИИ не смог обработать вакансию. Можно повторить попытку.";
    }
  }
  async function fetchStatus(enqueue: boolean) {
    if (!available()) return;
    clearTimeout(timer);
    timer = undefined;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const serial = ++generation;
    const vacancyId = id()!;
    loading.value = true;
    try {
      const data = enqueue
        ? await session.api.enqueueAiSummary(vacancyId, { signal: controller.signal })
        : await session.api.aiSummary(vacancyId, { signal: controller.signal });
      if (serial !== generation || !available() || vacancyId !== id()) return;
      error.value = "";
      apply(data);
      if (polling.value) {
        if (!deadline) deadline = Date.now() + MAX_POLL_MS;
        if (Date.now() < deadline)
          timer = setTimeout(() => { void fetchStatus(false); }, POLL_DELAY_MS);
        else {
          polling.value = false;
          error.value = "Обработка занимает больше времени. Проверьте статус позднее.";
        }
      }
    } catch (cause) {
      if (serial !== generation || !available()) return;
      const message = friendlyError(cause);
      if (message) {
        error.value = message;
        polling.value = false;
      }
    } finally {
      if (serial === generation) {
        loading.value = false;
        request = undefined;
      }
    }
  }
  function showOriginal() {
    mode.value = "original";
    wantsPlain = false;
  }
  function showPlain() {
    if (!available()) return;
    wantsPlain = true;
    if (status.value === "done" && summary.value) {
      mode.value = "plain";
      return;
    }
    if (loading.value || polling.value) return;
    error.value = "";
    deadline = Date.now() + MAX_POLL_MS;
    // Existing jobs should be polled, not queued again.
    void fetchStatus(status.value !== "pending" && status.value !== "processing");
  }
  function retry() {
    if (!available() || loading.value) return;
    error.value = "";
    deadline = Date.now() + MAX_POLL_MS;
    void fetchStatus(status.value !== "pending" && status.value !== "processing");
  }
  watch(
    () => [id(), active(), session.user?.id, session.authenticated] as const,
    () => {
      reset();
      // Reading the cached state never triggers model spending.
      if (available()) void fetchStatus(false);
    },
    { immediate: true }
  );
  onBeforeUnmount(() => { stopped = true; cancel(); });
  return { mode, summary, status, loading, polling, error,
    showPlain, showOriginal, retry, cancel };
}
