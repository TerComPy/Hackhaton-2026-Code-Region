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
}
