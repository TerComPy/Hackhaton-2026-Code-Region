using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Models;
using AppNative.Services;

namespace AppNative.ViewModels;

public partial class VacancyItemViewModel : ObservableObject
{
    private readonly IFavoritesService _favoritesService;

    public Vacancy Vacancy { get; }

    [ObservableProperty]
    private bool _isFavorite;

    [ObservableProperty]
    private bool _isFit;

    public VacancyItemViewModel(Vacancy vacancy, IFavoritesService favoritesService, bool isFit = false)
    {
        Vacancy = vacancy;
        _favoritesService = favoritesService;
        _isFit = isFit;
        _isFavorite = _favoritesService.IsFavorite(vacancy.Id);

        _favoritesService.FavoritesChanged += OnFavoritesChanged;
    }

    private void OnFavoritesChanged(object? sender, int vacancyId)
    {
        if (vacancyId == Vacancy.Id)
        {
            IsFavorite = _favoritesService.IsFavorite(Vacancy.Id);
        }
    }

    [RelayCommand]
    public void ToggleFavorite()
    {
        _favoritesService.ToggleFavorite(Vacancy.Id);
        IsFavorite = _favoritesService.IsFavorite(Vacancy.Id);
    }

    [RelayCommand]
    public async Task OpenDetailsAsync()
    {
        await Shell.Current.GoToAsync($"vacancy?id={Vacancy.Id}");
    }
}
