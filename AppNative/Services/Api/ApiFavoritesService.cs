using AppNative.Models;

namespace AppNative.Services.Api;

/// <summary>
/// Избранное на сервере (/api/favorites). Состояние держим локально и обновляем оптимистично;
/// демо-вакансии (отрицательные id) сохраняются только на устройстве.
/// </summary>
public class ApiFavoritesService : IFavoritesService
{
    private readonly ApiClient _api;
    private readonly IAuthService _auth;
    private readonly HashSet<int> _ids = new();
    private readonly Dictionary<int, Vacancy> _items = new();

    public event EventHandler<int>? FavoritesChanged;
    public int Count => _ids.Count;

    public ApiFavoritesService(ApiClient api, IAuthService auth)
    {
        _api = api;
        _auth = auth;
        _auth.AuthStateChanged += (_, _) => _ = ReloadAsync();
        _ = ReloadAsync();
    }

    public IReadOnlySet<int> GetFavoriteIds() => _ids;
    public bool IsFavorite(int vacancyId) => _ids.Contains(vacancyId);

    private async Task ReloadAsync()
    {
        _ids.RemoveWhere(id => id > 0);
        _items.Clear();
        if (_auth.IsSignedIn)
        {
            try
            {
                var root = await _api.GetAsync("/api/favorites?pageSize=100");
                if (root is { } r)
                    foreach (var item in r.Arr("items"))
                    {
                        var v = ApiMapper.FromListItem(item);
                        _ids.Add(v.Id);
                        _items[v.Id] = v;
                    }
            }
            catch (ApiException) { /* нет сети — список пустой, повторим при следующем входе */ }
        }
        MainThread.BeginInvokeOnMainThread(() => FavoritesChanged?.Invoke(this, 0));
    }

    public void ToggleFavorite(int vacancyId)
    {
        var add = !_ids.Contains(vacancyId);
        if (add) _ids.Add(vacancyId); else { _ids.Remove(vacancyId); _items.Remove(vacancyId); }
        FavoritesChanged?.Invoke(this, vacancyId);

        if (vacancyId > 0 && _auth.IsSignedIn) _ = SyncAsync(vacancyId, add);
    }

    private async Task SyncAsync(int vacancyId, bool add)
    {
        try
        {
            if (add) await _api.PutAsync("/api/favorites/" + vacancyId);
            else await _api.DeleteAsync("/api/favorites/" + vacancyId);
            // сервер подтвердил — страница «Избранное» перечитает список
            MainThread.BeginInvokeOnMainThread(() => FavoritesChanged?.Invoke(this, vacancyId));
        }
        catch (ApiException)
        {
            // Сервер не принял — откатываем отметку
            if (add) _ids.Remove(vacancyId); else _ids.Add(vacancyId);
            MainThread.BeginInvokeOnMainThread(() => FavoritesChanged?.Invoke(this, vacancyId));
        }
    }

    /// <summary>Для страницы «Избранное»: свежий список с сервера.</summary>
    public async Task<List<Vacancy>?> GetSavedVacanciesAsync()
    {
        if (!_auth.IsSignedIn) return null;
        try
        {
            var root = await _api.GetAsync("/api/favorites?pageSize=100");
            if (root is not { } r) return new List<Vacancy>();
            return r.Arr("items").Select(ApiMapper.FromListItem).ToList();
        }
        catch (ApiException)
        {
            return _items.Values.ToList();
        }
    }
}
