using System.Text.Json;

namespace AppNative.Services.Mock;

public class MockFavoritesService : IFavoritesService
{
    private const string PrefKey = "starter.saved";
    private readonly HashSet<int> _favoriteIds = new();

    public event EventHandler<int>? FavoritesChanged;

    public MockFavoritesService()
    {
        LoadFavorites();
    }

    private void LoadFavorites()
    {
        try
        {
            var json = Preferences.Default.Get(PrefKey, string.Empty);
            if (!string.IsNullOrEmpty(json))
            {
                var list = JsonSerializer.Deserialize<List<int>>(json);
                if (list != null)
                {
                    foreach (var id in list) _favoriteIds.Add(id);
                }
            }
        }
        catch
        {
            // fallback
        }
    }

    private void SaveFavorites()
    {
        try
        {
            var json = JsonSerializer.Serialize(_favoriteIds.ToList());
            Preferences.Default.Set(PrefKey, json);
        }
        catch
        {
            // ignore
        }
    }

    public IReadOnlySet<int> GetFavoriteIds() => _favoriteIds;

    public bool IsFavorite(int vacancyId) => _favoriteIds.Contains(vacancyId);

    public void ToggleFavorite(int vacancyId)
    {
        if (_favoriteIds.Contains(vacancyId))
            _favoriteIds.Remove(vacancyId);
        else
            _favoriteIds.Add(vacancyId);

        SaveFavorites();
        FavoritesChanged?.Invoke(this, vacancyId);
    }

    public int Count => _favoriteIds.Count;
}
