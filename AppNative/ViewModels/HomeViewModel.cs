using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Models;
using AppNative.Services;

namespace AppNative.ViewModels;

public partial class HomeViewModel : ObservableObject
{
    private readonly IVacancyService _vacancyService;
    private readonly IFavoritesService _favoritesService;
    private readonly IMatchService _matchService;

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    private string _cityQuery = string.Empty;

    [ObservableProperty]
    private bool _onlyNoExperience;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(MinSalaryIndex))]
    private int _minSalary;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(SelectedSortIndex))]
    private string _selectedSort = "date";

    // --- «Показать ещё»: как на сайте, по 6 вакансий ---
    private const int PageSize = 6;
    private List<Vacancy> _allResults = new();
    private int _limit = PageSize;

    [ObservableProperty]
    private bool _hasMore;

    [ObservableProperty]
    private bool _hasActiveFilters;

    private void FillVisible()
    {
        var fitKeys = _matchService.FitDirectionKeys;
        Vacancies.Clear();
        foreach (var job in _allResults.Take(_limit))
        {
            Vacancies.Add(new VacancyItemViewModel(job, _favoritesService, fitKeys.Contains(job.Direction)));
        }
        HasMore = _limit < _allResults.Count;
    }

    [RelayCommand]
    public void ShowMore()
    {
        _limit += PageSize;
        FillVisible();
    }

    /// <summary>«Зарплата от»: Любая / 50 000 / 70 000 / 90 000 / 120 000 ₽ (select на сайте).</summary>
    private static readonly int[] SalarySteps = { 0, 50000, 70000, 90000, 120000 };
    public IList<string> SalaryOptions { get; } = new[] { "Любая", "50000 ₽", "70000 ₽", "90000 ₽", "120000 ₽" };
    public int MinSalaryIndex
    {
        get => Math.Max(0, Array.IndexOf(SalarySteps, MinSalary));
        set => MinSalary = value >= 0 && value < SalarySteps.Length ? SalarySteps[value] : 0;
    }

    /// <summary>Индекс для Picker («Сначала новые» = 0, «По зарплате» = 1) → ключ сортировки сервиса.</summary>
    public int SelectedSortIndex
    {
        get => SelectedSort switch { "salary" => 1, "fit" => 2, _ => 0 };
        set => SelectedSort = value switch { 1 => "salary", 2 => "fit", _ => "date" };
    }

    // --- Автоприменение фильтров (как во фронтенде: меняешь фильтр — список обновляется сам) ---
    private bool _suppressAutoApply;
    private CancellationTokenSource? _debounceCts;
    private int _applyVersion;

    private void QueueApply(int delayMs = 0)
    {
        if (_suppressAutoApply) return;
        _debounceCts?.Cancel();
        var cts = _debounceCts = new CancellationTokenSource();
        _ = RunDebouncedAsync(delayMs, cts.Token);
    }

    private async Task RunDebouncedAsync(int delayMs, CancellationToken ct)
    {
        try
        {
            if (delayMs > 0) await Task.Delay(delayMs, ct);
            if (!ct.IsCancellationRequested) await ApplyFiltersAsync();
        }
        catch (TaskCanceledException) { }
    }

    partial void OnSearchQueryChanged(string value) => QueueApply(350);
    partial void OnCityQueryChanged(string value) => QueueApply(350);
    partial void OnMinSalaryChanged(int value) => QueueApply();
    partial void OnOnlyNoExperienceChanged(bool value) => QueueApply();
    partial void OnSelectedSortChanged(string value) => QueueApply();
    partial void OnFormatOnSiteChanged(bool value) => QueueApply();
    partial void OnFormatHybridChanged(bool value) => QueueApply();
    partial void OnFormatRemoteChanged(bool value) => QueueApply();
    partial void OnSourceHhChanged(bool value) => QueueApply();
    partial void OnSourceTrudVsemChanged(bool value) => QueueApply();
    partial void OnSourceSuperJobChanged(bool value) => QueueApply();

    [ObservableProperty]
    private bool _isLoading = true;

    [ObservableProperty]
    private bool _hasError;

    [ObservableProperty]
    private bool _isEmpty;

    [ObservableProperty]
    private string _resultCountText = "Загружаем…";

    [ObservableProperty]
    private int _activeFiltersCount;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsFiltersPanelVisible))]
    private bool _isFiltersExpanded;

    /// <summary>На десктопе панель фильтров — постоянная левая колонка; на телефоне раскрывается кнопкой.</summary>
    public bool IsFiltersPanelVisible => DeviceInfo.Idiom != DeviceIdiom.Phone || IsFiltersExpanded;

    // How it works interactive step
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsHowStep0))]
    [NotifyPropertyChangedFor(nameof(IsHowStep1))]
    [NotifyPropertyChangedFor(nameof(IsHowStep2))]
    [NotifyPropertyChangedFor(nameof(IsHowDocVisible))]
    private int _howStep = 0;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsHowDocOriginal))]
    private bool _isHowDocAiSummary = false;

    // Как на сайте: шаг 1 — три объявления с разных площадок, шаг 2 — документ (текст работодателя ⇄ пересказ ИИ),
    // шаг 3 — пересказ ИИ + плашка «Подходит вам».
    public bool IsHowStep0 => HowStep == 0;
    public bool IsHowStep1 => HowStep == 1;
    public bool IsHowStep2 => HowStep == 2;
    public bool IsHowDocVisible => HowStep != 0;
    public bool IsHowDocOriginal => !IsHowDocAiSummary;

    // Filter toggles
    [ObservableProperty] private bool _formatOnSite;
    [ObservableProperty] private bool _formatHybrid;
    [ObservableProperty] private bool _formatRemote;

    [ObservableProperty] private bool _sourceHh;
    [ObservableProperty] private bool _sourceTrudVsem;
    [ObservableProperty] private bool _sourceSuperJob;

    public ObservableCollection<VacancyItemViewModel> Vacancies { get; } = new();
    public ObservableCollection<Vacancy> FeaturedRingJobs { get; } = new();
    public ObservableCollection<JobSource> Sources { get; } = new();

    public HomeViewModel(
        IVacancyService vacancyService,
        IFavoritesService favoritesService,
        IMatchService matchService)
    {
        _vacancyService = vacancyService;
        _favoritesService = favoritesService;
        _matchService = matchService;

        _matchService.MatchUpdated += (s, e) => _ = ApplyFiltersAsync();
        // Вход/выход: каталог переключается между демо и API
        _vacancyService.DataChanged += (s, e) => MainThread.BeginInvokeOnMainThread(() => _ = ApplyFiltersAsync());

        _ = LoadInitialDataAsync();
    }

    private async Task LoadInitialDataAsync()
    {
        var sources = await _vacancyService.GetSourcesAsync();
        Sources.Clear();
        foreach (var s in sources) Sources.Add(s);

        var ring = await _vacancyService.GetFeaturedRingJobsAsync();
        FeaturedRingJobs.Clear();
        foreach (var r in ring) FeaturedRingJobs.Add(r);

        await ApplyFiltersAsync();
    }

    [RelayCommand]
    public async Task SearchAsync()
    {
        await ApplyFiltersAsync();
    }

    [RelayCommand]
    public async Task ResetFiltersAsync()
    {
        _suppressAutoApply = true;
        SearchQuery = string.Empty;
        CityQuery = string.Empty;
        OnlyNoExperience = false;
        MinSalary = 0;
        FormatOnSite = false;
        FormatHybrid = false;
        FormatRemote = false;
        SourceHh = false;
        SourceTrudVsem = false;
        SourceSuperJob = false;
        SelectedSort = "date";
        _suppressAutoApply = false;
        _debounceCts?.Cancel();

        await ApplyFiltersAsync();
    }

    [RelayCommand]
    public void ToggleFiltersExpanded()
    {
        IsFiltersExpanded = !IsFiltersExpanded;
    }

    [RelayCommand]
    public void SelectHowStep(int step)
    {
        HowStep = step;
        IsHowDocAiSummary = step >= 1;
    }

    [RelayCommand]
    public void FlipHowDoc()
    {
        IsHowDocAiSummary = !IsHowDocAiSummary;
    }

    [RelayCommand]
    public async Task OpenVacancyAsync(Vacancy vacancy)
    {
        await Shell.Current.GoToAsync($"vacancy?id={vacancy.Id}");
    }

    [RelayCommand]
    public async Task NavigateToMatchAsync()
    {
        await Shell.Current.GoToAsync("//match");
    }

    public async Task ApplyFiltersAsync()
    {
        var version = Interlocked.Increment(ref _applyVersion);
        IsLoading = true;
        HasError = false;

        try
        {
            var formats = new HashSet<string>();
            if (FormatOnSite) formats.Add("На месте");
            if (FormatHybrid) formats.Add("Гибрид");
            if (FormatRemote) formats.Add("Удалённо");

            var sources = new HashSet<string>();
            if (SourceHh) sources.Add("hh.ru");
            if (SourceTrudVsem) sources.Add("Работа России");
            if (SourceSuperJob) sources.Add("SuperJob");

            int activeCount = 0;
            if (!string.IsNullOrWhiteSpace(SearchQuery)) activeCount++;
            if (!string.IsNullOrWhiteSpace(CityQuery)) activeCount++;
            if (OnlyNoExperience) activeCount++;
            if (MinSalary > 0) activeCount++;
            activeCount += formats.Count;
            activeCount += sources.Count;
            ActiveFiltersCount = activeCount;

            var opts = new VacancyFilterOptions
            {
                Query = SearchQuery,
                City = CityQuery,
                Formats = formats,
                OnlyNoExperience = OnlyNoExperience,
                MinSalary = MinSalary,
                Sources = sources,
                SortBy = SelectedSort
            };

            var fitKeys = _matchService.FitDirectionKeys;
            var list = await _vacancyService.GetVacanciesAsync(opts, fitKeys);
            if (version != _applyVersion) return; // пришёл более свежий запрос — этот результат устарел

            _allResults = list;
            _limit = PageSize;
            FillVisible();

            IsEmpty = list.Count == 0;
            HasActiveFilters = activeCount > 0;
            // Как в CatalogWidget.vue: «Загружено: N · API» / «N вакансий · Демо (mock)»
            ResultCountText = _vacancyService.IsLive
                ? $"Загружено: {list.Count} · API"
                : $"{list.Count} вакансий · Демо — войдите, чтобы увидеть реальные";
        }
        catch
        {
            HasError = true;
            ResultCountText = string.Empty;
        }
        finally
        {
            if (version == _applyVersion) IsLoading = false;
        }
    }

    private static string Plural(int n, string form1, string form2, string form5)
    {
        int a = Math.Abs(n) % 100;
        int b = a % 10;
        if (a > 10 && a < 20) return form5;
        if (b == 1) return form1;
        if (b > 1 && b < 5) return form2;
        return form5;
    }
}
