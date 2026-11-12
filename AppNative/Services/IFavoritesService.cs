namespace AppNative.Services;

public interface IFavoritesService
{
    event EventHandler<int>? FavoritesChanged;
    IReadOnlySet<int> GetFavoriteIds();
    bool IsFavorite(int vacancyId);
    void ToggleFavorite(int vacancyId);
    int Count { get; }
}
