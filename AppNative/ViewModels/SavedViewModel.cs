using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Services;

namespace AppNative.ViewModels;

public partial class SavedViewModel : ObservableObject
{
    private readonly IVacancyService _vacancyService;
    private readonly IFavoritesService _favoritesService;
    private readonly IMatchService _matchService;

    [ObservableProperty]
    private string _countText = string.Empty;

    [ObservableProperty]
    private bool _isEmpty;

    [ObservableProperty]
    private bool _isLoading;

    public ObservableCollection<VacancyItemViewModel> SavedVacancies { get; } = new();

    public SavedViewModel(
        IVacancyService vacancyService,
        IFavoritesService favoritesService,
        IMatchService matchService)
    {
        _vacancyService = vacancyService;
        _favoritesService = favoritesService;
        _matchService = matchService;

        _favoritesService.FavoritesChanged += (s, e) => _ = LoadSavedAsync();
        _ = LoadSavedAsync();
    }

    public async Task LoadSavedAsync()
    {
        IsLoading = true;
        try
        {
            var favIds = _favoritesService.GetFavoriteIds().ToHashSet();
            // API: список с сервера; демо: из каталога
            var saved = await _favoritesService.GetSavedVacanciesAsync()
                        ?? (await _vacancyService.GetVacanciesAsync()).Where(j => favIds.Contains(j.Id)).ToList();
            // Отмеченные, которых нет в списке (демо-карточки при входе), догружаем по id
            foreach (var id in favIds.Where(id => saved.All(v => v.Id != id)).ToList())
            {
                if (await _vacancyService.GetVacancyByIdAsync(id) is { } extra) saved.Add(extra);
            }

            var fitKeys = _matchService.FitDirectionKeys;

            SavedVacancies.Clear();
            foreach (var j in saved)
            {
                SavedVacancies.Add(new VacancyItemViewModel(j, _favoritesService, fitKeys.Contains(j.Direction)));
            }

            IsEmpty = SavedVacancies.Count == 0;
            CountText = $"{SavedVacancies.Count} сохранено"; // как Saved.vue
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task NavigateToCatalogAsync()
    {
        await Shell.Current.GoToAsync("//home");
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
