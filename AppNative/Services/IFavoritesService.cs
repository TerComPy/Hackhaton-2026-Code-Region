using AppNative.Models;

namespace AppNative.Services;

public interface IFavoritesService
{
    event EventHandler<int>? FavoritesChanged;
    IReadOnlySet<int> GetFavoriteIds();
    bool IsFavorite(int vacancyId);
    void ToggleFavorite(int vacancyId);
    int Count { get; }

    /// <summary>Сохранённые вакансии с сервера; null — брать из каталога (демо).</summary>
    Task<List<Vacancy>?> GetSavedVacanciesAsync() => Task.FromResult<List<Vacancy>?>(null);
}
