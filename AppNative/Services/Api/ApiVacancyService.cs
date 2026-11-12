using System.Text.Json;
using AppNative.Models;
using AppNative.Services.Mock;

namespace AppNative.Services.Api;

/// <summary>
/// Каталог из /api/vacancies. Как веб в режиме API: каталог доступен после входа.
/// В «кольце» профессий — демо-карточки (отрицательные id, чтобы не пересекаться с реальными).
/// </summary>
public class ApiVacancyService : IVacancyService
{
    private readonly ApiClient _api;
    private readonly IAuthService _auth;
    private readonly MockVacancyService _demo = new();

    public event EventHandler? DataChanged;
    public bool IsLive => _auth.IsSignedIn;

    public ApiVacancyService(ApiClient api, IAuthService auth)
    {
        _api = api;
        _auth = auth;
        _auth.AuthStateChanged += (_, _) => DataChanged?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>Копия демо-вакансии с отрицательным id.</summary>
    public static Vacancy Demo(Vacancy v)
    {
        var copy = JsonSerializer.Deserialize<Vacancy>(JsonSerializer.Serialize(v))!;
        copy.Id = -Math.Abs(v.Id);
        return copy;
    }

    public async Task<List<Vacancy>> GetVacanciesAsync(VacancyFilterOptions? filters = null, HashSet<string>? fitDirections = null)
    {
        // Как CatalogWidget.vue: гостю каталог не показываем (CatalogGuestState — «войдите»)
        if (!_auth.IsSignedIn)
            return new List<Vacancy>();

        filters ??= new VacancyFilterOptions();
        var q = new List<string> { "pageSize=60" };
        void Add(string key, string? value)
        {
            if (!string.IsNullOrWhiteSpace(value)) q.Add(key + "=" + Uri.EscapeDataString(value.Trim()));
        }
        Add("search", filters.Query);
        if (!string.IsNullOrWhiteSpace(filters.City)) { Add("city", filters.City); q.Add("includeRemote=true"); }
        // API принимает один формат — как веб: берём первый отмеченный
        Add("workFormat", filters.Formats.Select(ApiMapper.WorkFormatKey).FirstOrDefault(k => k != null));
        if (filters.OnlyNoExperience) q.Add("onlyNoExperience=true");
        if (filters.MinSalary > 0) q.Add("minSalary=" + filters.MinSalary);

        var root = await _api.GetAsync("/api/vacancies?" + string.Join("&", q));
        var list = root is { } r ? r.Arr("items").Select(ApiMapper.FromListItem).ToList() : new List<Vacancy>();

        // Фильтр источников API пока не поддерживает — фильтруем на устройстве
        if (filters.Sources.Count > 0)
            list = list.Where(v => filters.Sources.Any(s => SourceMatches(v.Source, s))).ToList();

        if (filters.SortBy == "salary")
            list = list.OrderByDescending(v => v.Salary?.Max() ?? 0).ToList();
        return list;
    }

    private static bool SourceMatches(string apiName, string filterName)
    {
        var a = apiName.ToLowerInvariant();
        return filterName switch
        {
            "Работа России" => a.Contains("работа росси") || a.Contains("trudvsem"),
            "hh.ru" => a.Contains("hh") || a.Contains("headhunter"),
            "SuperJob" => a.Contains("superjob"),
            _ => a.Contains(filterName.ToLowerInvariant())
        };
    }

    public async Task<Vacancy?> GetVacancyByIdAsync(int id)
    {
        if (id < 0)
        {
            var demo = await _demo.GetVacancyByIdAsync(-id);
            return demo is null ? null : Demo(demo);
        }
        if (!_auth.IsSignedIn) return null;

        var root = await _api.GetAsync("/api/vacancies/" + id);
        if (root is not { } r || r.Obj("vacancy") is not { } card) return null;
        return ApiMapper.FromDetail(card, r.Arr("skills"));
    }

    /// <summary>
    /// ИИ-пересказ (модуль Даниила): GET — прочитать готовое/статус (не тратит модель),
    /// POST — поставить в очередь. Как entities/aiSummary.ts на сайте.
    /// </summary>
    public async Task<AiSummaryState?> GetAiSummaryAsync(int id, bool enqueue)
    {
        if (id < 0 || !_auth.IsSignedIn) return null;
        var root = enqueue
            ? await _api.PostAsync($"/api/vacancies/{id}/summary")
            : await _api.GetAsync($"/api/vacancies/{id}/summary");
        return root is { } r ? ApiMapper.Summary(r) : null;
    }

    /// <summary>Запись перехода к работодателю (POST outbound-click) — вернёт оригинальную ссылку.</summary>
    public async Task<string?> GetOutboundUrlAsync(int id)
    {
        if (id < 0) return null; // демо — ссылка поиска из карточки
        // Ошибки (404 архив, 401 сессия) пробрасываем — карточка покажет текст, как на сайте
        var root = await _api.PostAsync($"/api/vacancies/{id}/outbound-click");
        return root?.Str("originalUrl");
    }

    public Task<List<JobSource>> GetSourcesAsync() => _demo.GetSourcesAsync();

    public async Task<List<Vacancy>> GetFeaturedRingJobsAsync() =>
        (await _demo.GetFeaturedRingJobsAsync()).Select(Demo).ToList();
}
