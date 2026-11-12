using AppNative.Models;

namespace AppNative.Services;

public interface IAuthService
{
    event EventHandler? AuthStateChanged;
    bool IsSignedIn { get; }
    UserProfile? CurrentUser { get; }
    Task<bool> LoginAsync(string email, string password);
    Task<bool> RegisterAsync(string name, string email, string password);
    void Logout();

    /// <summary>Понятная причина последней неудачи входа/регистрации (API). У демо — пусто.</summary>
    string LastError => string.Empty;

    /// <summary>После PATCH /api/profile — новое имя в шапке профиля (у демо — ничего).</summary>
    void UpdateDisplayName(string name) { }
}
