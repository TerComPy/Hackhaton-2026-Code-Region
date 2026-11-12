using AppNative.Models;

namespace AppNative.Services;

public class VacancyFilterOptions
{
    public string Query { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public HashSet<string> Formats { get; set; } = new();
    public bool OnlyNoExperience { get; set; }
    public int MinSalary { get; set; }
    public HashSet<string> Sources { get; set; } = new();
    public string SortBy { get; set; } = "date"; // "date", "salary", "fit"
}

public interface IVacancyService
{
    Task<List<Vacancy>> GetVacanciesAsync(VacancyFilterOptions? filters = null, HashSet<string>? fitDirections = null);
    Task<Vacancy?> GetVacancyByIdAsync(int id);
    Task<List<JobSource>> GetSourcesAsync();
    Task<List<Vacancy>> GetFeaturedRingJobsAsync();

    /// <summary>true — данные с бэкенда (starterjob.ru), false — демо-каталог.</summary>
    bool IsLive => false;

    /// <summary>Источник данных сменился (вход/выход) — каталог надо перечитать.</summary>
    event EventHandler? DataChanged { add { } remove { } }

    /// <summary>Ссылка на вакансию у работодателя с учётом перехода (API); null — использовать Vacancy.Url.</summary>
    Task<string?> GetOutboundUrlAsync(int id) => Task.FromResult<string?>(null);

    /// <summary>ИИ-пересказ: enqueue=false — только прочитать статус, true — поставить в очередь. Демо — null.</summary>
    Task<AiSummaryState?> GetAiSummaryAsync(int id, bool enqueue) => Task.FromResult<AiSummaryState?>(null);
}
