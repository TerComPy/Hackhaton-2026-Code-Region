using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Models;
using AppNative.Services;

namespace AppNative.ViewModels;

[QueryProperty(nameof(VacancyId), "id")]
public partial class VacancyViewModel : ObservableObject
{
    private readonly IVacancyService _vacancyService;
    private readonly IFavoritesService _favoritesService;
    private readonly IMatchService _matchService;

    [ObservableProperty]
    private int _vacancyId;

    [ObservableProperty]
    private Vacancy? _vacancy;

    [ObservableProperty]
    private bool _isPlainMode = true;

    [ObservableProperty]
    private bool _isFavorite;

    [ObservableProperty]
    private string _fitTitle = "Подходит ли это вам?";

    [ObservableProperty]
    private string _fitText = "Расскажите о себе в паре абзацев — объясним, какие вакансии вам ближе и почему.";

    [ObservableProperty]
    private bool _showMatchLink = true;

    public VacancyViewModel(
        IVacancyService vacancyService,
        IFavoritesService favoritesService,
        IMatchService matchService)
    {
        _vacancyService = vacancyService;
        _favoritesService = favoritesService;
        _matchService = matchService;
    }

    async partial void OnVacancyIdChanged(int value)
    {
        Vacancy = await _vacancyService.GetVacancyByIdAsync(value);
        if (Vacancy != null)
        {
            IsFavorite = _favoritesService.IsFavorite(Vacancy.Id);
            UpdateFitBlock();
        }
    }

    private void UpdateFitBlock()
    {
        if (Vacancy == null) return;

        var result = _matchService.CurrentResult;
        if (result != null)
        {
            var dir = result.Directions.FirstOrDefault(d => d.Key == Vacancy.Direction);
            if (dir != null)
            {
                FitTitle = "Почему может подойти";
                FitText = $"{dir.Reason}\n\n{Vacancy.Note}.";
                ShowMatchLink = false;
            }
            else
            {
                FitTitle = "Не в ваших главных направлениях";
                var names = string.Join(", ", result.Directions.Select(d => d.Name.ToLower()));
                FitText = $"По вашему рассказу ближе {names}. Но посмотреть и сравнить никто не мешает.";
                ShowMatchLink = false;
            }
        }
        else
        {
            FitTitle = "Подходит ли это вам?";
            FitText = "Расскажите о себе в паре абзацев — объясним, какие вакансии вам ближе и почему.";
            ShowMatchLink = true;
        }
    }

    [RelayCommand]
    public void SetMode(string mode)
    {
        IsPlainMode = mode == "plain";
    }

    [RelayCommand]
    public void ToggleFavorite()
    {
        if (Vacancy == null) return;
        _favoritesService.ToggleFavorite(Vacancy.Id);
        IsFavorite = _favoritesService.IsFavorite(Vacancy.Id);
    }

    [RelayCommand]
    public async Task OpenExternalAsync()
    {
        if (Vacancy == null || string.IsNullOrWhiteSpace(Vacancy.Url)) return;
        try
        {
            await Launcher.Default.OpenAsync(new Uri(Vacancy.Url));
        }
        catch
        {
            // ignore
        }
    }

    [RelayCommand]
    public async Task CloseAsync()
    {
        await Shell.Current.GoToAsync("..");
    }

    [RelayCommand]
    public async Task NavigateToMatchAsync()
    {
        await Shell.Current.GoToAsync("//match");
    }
}
