using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Models;
using AppNative.Services;

namespace AppNative.ViewModels;

public record MatchExample(string Label, string Text);

/// <summary>Направление в правой колонке (Match.vue .direction): название, суть, почему, с чего начать, вакансии.</summary>
public record DirectionView(string Num, string Name, string What, string Why, string Evidence, List<VacancyItemViewModel> Jobs)
{
    public bool HasEvidence => !string.IsNullOrWhiteSpace(Evidence);
    public bool HasJobs => Jobs.Count > 0;
    public bool NoJobs => Jobs.Count == 0;
}

public partial class MatchViewModel : ObservableObject
{
    private readonly IMatchService _matchService;
    private readonly IFavoritesService _favoritesService;
    private readonly IAuthService _authService;

    /// <summary>Гость: подбор недоступен, показываем «Войти в аккаунт».</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSubmit))]
    private bool _isGuest;

    public bool CanSubmit => !IsAnalyzing && !IsGuest;
    public string SubmitText => IsAnalyzing ? "Подбираем направления…" : "Подобрать профессии";
    public bool ShowPlaceholder => !HasResult && !IsAnalyzing;

    public ObservableCollection<DirectionView> Directions { get; } = new();

    [ObservableProperty]
    private string _aboutText = string.Empty;

    [ObservableProperty]
    private string _charCountText = "0 / 1500";

    [ObservableProperty]
    private string _errorMessage = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanSubmit))]
    [NotifyPropertyChangedFor(nameof(SubmitText))]
    [NotifyPropertyChangedFor(nameof(ShowPlaceholder))]
    private bool _isAnalyzing;

    [ObservableProperty]
    private string _statusText = string.Empty;

    [ObservableProperty]
    private MatchResult? _result;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(ShowPlaceholder))]
    private bool _hasResult;

    public ObservableCollection<MatchExample> Examples { get; } = new();

    public MatchViewModel(IMatchService matchService, IFavoritesService favoritesService, IAuthService authService)
    {
        _matchService = matchService;
        _favoritesService = favoritesService;
        _authService = authService;
        IsGuest = !_authService.IsSignedIn;
        // Смена пользователя — сбрасываем рассказ и результат (resetPrivate на сайте)
        _authService.AuthStateChanged += (s, e) => MainThread.BeginInvokeOnMainThread(() =>
        {
            IsGuest = !_authService.IsSignedIn;
            AboutText = string.Empty;
            Result = null;
            HasResult = false;
            ErrorMessage = string.Empty;
        });

        Examples.Add(new MatchExample("Школьник, люблю технику", "Учусь в 10 классе. Люблю разбирать технику и паять, дома сам чинил ноутбук и розетку. Физика нравится, сочинения — не очень. Хочу работать руками и видеть результат."));
        Examples.Add(new MatchExample("Экономист, хочу из дома", "Закончила экономический колледж, хорошо считаю и люблю порядок в таблицах — Excel знаю уверенно. Нравится разбираться, почему цифры получились именно такими. Хочется работать из дома."));
        Examples.Add(new MatchExample("Общительный студент", "Мне 19, учусь заочно на юриста. Люблю общаться с людьми, летом работал официантом в кафе, и мне понравилось. Нужен гибкий график, чтобы совмещать с учёбой."));

        if (!string.IsNullOrWhiteSpace(_matchService.SavedAboutText))
        {
            AboutText = _matchService.SavedAboutText;
            CharCountText = $"{AboutText.Length} / 1500";
            Result = _matchService.CurrentResult;
            HasResult = Result != null;
            BuildDirections();
        }
    }

    partial void OnResultChanged(MatchResult? value) => BuildDirections();

    private void BuildDirections()
    {
        Directions.Clear();
        if (Result == null) return;
        var n = 0;
        foreach (var d in Result.Directions)
        {
            var why = d.Strength > 0 ? d.Why : "Прямых совпадений нет — направление для знакомства.";
            var jobs = d.Jobs.Select(j => new VacancyItemViewModel(j, _favoritesService, false)).ToList();
            Directions.Add(new DirectionView((++n).ToString("00"), d.Name, d.What, why, d.Start, jobs));
        }
    }

    partial void OnAboutTextChanged(string value)
    {
        CharCountText = $"{value.Length} / 1500";
        if (!string.IsNullOrEmpty(ErrorMessage))
        {
            ErrorMessage = string.Empty;
        }
    }

    [RelayCommand]
    public void ApplyExample(MatchExample example)
    {
        AboutText = example.Text;
        ErrorMessage = string.Empty;
    }

    [RelayCommand]
    public async Task SubmitMatchAsync()
    {
        if (IsAnalyzing) return;

        var text = AboutText.Trim();
        if (text.Length < 40)
        {
            ErrorMessage = "Напишите хотя бы 40 символов о себе.";
            return;
        }

        if (IsGuest)
        {
            ErrorMessage = "Для персонального подбора нужно войти в аккаунт.";
            return;
        }

        IsAnalyzing = true;
        ErrorMessage = string.Empty;
        Result = null;
        HasResult = false;
        try
        {
            Result = await _matchService.AnalyzeAsync(text);
            HasResult = Result != null;
        }
        catch (Exception ex)
        {
            ErrorMessage = ex is AppNative.Services.Api.MatchException ? ex.Message : "Не удалось подобрать направления. Повторите попытку.";
        }
        finally
        {
            IsAnalyzing = false;
        }
    }

    [RelayCommand]
    public async Task OpenVacancyAsync(Vacancy vacancy)
    {
        await Shell.Current.GoToAsync($"vacancy?id={vacancy.Id}");
    }

    [RelayCommand]
    public async Task NavigateToAccountAsync()
    {
        await Shell.Current.GoToAsync("//account");
    }

    [RelayCommand]
    public async Task NavigateToCatalogAsync()
    {
        await Shell.Current.GoToAsync("//home");
    }
}
