using System.Text.Json;
using AppNative.Models;

namespace AppNative.Services.Api;

/// <summary>Вход и регистрация через /api/auth. Токен живёт 1 час — при 401 выходим из профиля.</summary>
public class ApiAuthService : IAuthService
{
    private const string UserKey = "starter.api.user";
    private readonly ApiClient _api;

    public event EventHandler? AuthStateChanged;
    public bool IsSignedIn => _api.HasToken && CurrentUser != null;
    public UserProfile? CurrentUser { get; private set; }
    public string LastError { get; private set; } = string.Empty;

    public ApiAuthService(ApiClient api)
    {
        _api = api;
        _api.Unauthorized += (_, _) => MainThread.BeginInvokeOnMainThread(Logout);

        try
        {
            var json = Preferences.Default.Get(UserKey, string.Empty);
            if (_api.HasToken && !string.IsNullOrEmpty(json))
                CurrentUser = JsonSerializer.Deserialize<UserProfile>(json);
        }
        catch { CurrentUser = null; }

        if (CurrentUser != null) _ = ValidateAsync();
    }

    /// <summary>Проверяем сохранённый токен при запуске (истёкший → выход).</summary>
    private async Task ValidateAsync()
    {
        try { await _api.GetAsync("/api/auth/me"); }
        catch (ApiException) { /* 401 обработает Unauthorized; сеть — остаёмся в профиле */ }
    }

    public Task<bool> LoginAsync(string email, string password) =>
        AuthenticateAsync("/api/auth/login", new { email = email.Trim(), password });

    public Task<bool> RegisterAsync(string name, string email, string password) =>
        AuthenticateAsync("/api/auth/register", new { email = email.Trim(), password, displayName = name.Trim() });

    private async Task<bool> AuthenticateAsync(string path, object body)
    {
        LastError = string.Empty;
        try
        {
            var root = await _api.PostAsync(path, body);
            if (root is not { } r) throw new ApiException(System.Net.HttpStatusCode.BadGateway, "EMPTY", "Пустой ответ сервера.");
            var token = r.Str("accessToken");
            var user = r.Obj("user");
            if (string.IsNullOrEmpty(token) || user is null) throw new ApiException(System.Net.HttpStatusCode.BadGateway, "EMPTY", "Сервер не вернул токен.");

            _api.SetToken(token);
            CurrentUser = new UserProfile
            {
                Name = user.Value.Str("displayName") ?? string.Empty,
                Email = user.Value.Str("email") ?? string.Empty,
                CreatedAt = DateTime.UtcNow,
                IsSignedIn = true
            };
            Preferences.Default.Set(UserKey, JsonSerializer.Serialize(CurrentUser));
            AuthStateChanged?.Invoke(this, EventArgs.Empty);
            return true;
        }
        catch (ApiException ex)
        {
            LastError = ex.Code switch
            {
                "INVALID_CREDENTIALS" => "Неверный email или пароль.",
                "EMAIL_EXISTS" => "Этот email уже зарегистрирован — войдите.",
                "VALIDATION_ERROR" => "Проверьте email, имя и пароль (от 8 до 128 символов).",
                _ => ex.Message
            };
            return false;
        }
    }

    public void Logout()
    {
        var wasSignedIn = IsSignedIn;
        _api.SetToken(null);
        CurrentUser = null;
        Preferences.Default.Remove(UserKey);
        if (wasSignedIn) AuthStateChanged?.Invoke(this, EventArgs.Empty);
    }
}
