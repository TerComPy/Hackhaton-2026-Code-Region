using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Services;
using AppNative.Services.Api;

namespace AppNative.ViewModels;

public partial class AppShellViewModel : ObservableObject
{
    private const string ThemeKey = "starter.theme";
    private readonly IFavoritesService _favoritesService;
    private readonly IAuthService _authService;
    private readonly ApiClient _api;

    // ---------- Проверка сервера (ApiConnection.vue + ConnectionErrorDialog.vue) ----------
    [ObservableProperty] private bool _connectionOpen;
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(RetryText))]
    private bool _connectionBusy;
    [ObservableProperty] private string _connectionCode = string.Empty;
    public string RetryText => ConnectionBusy ? "Проверяем…" : "Повторить";
    private CancellationTokenSource? _connectionCts;

    [ObservableProperty]
    private int _favoritesCount;

    [ObservableProperty]
    private string _accountTitle = "Войти";

    [ObservableProperty]
    private bool _isDarkTheme;

    /// <summary>true, пока пользователь не вошёл — кнопка «Войти» акцентная, как во фронтенде.</summary>
    [ObservableProperty]
    private bool _isGuest = true;

    /// <summary>Текущий раздел верхнего меню (home / match / saved / account) — для подчёркивания активного пункта.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(IsHomeActive))]
    [NotifyPropertyChangedFor(nameof(IsMatchActive))]
    [NotifyPropertyChangedFor(nameof(IsSavedActive))]
    [NotifyPropertyChangedFor(nameof(IsAccountActive))]
    private string _currentRoute = "home";

    public bool IsHomeActive => CurrentRoute == "home";
    public bool IsMatchActive => CurrentRoute == "match";
    public bool IsSavedActive => CurrentRoute == "saved";
    public bool IsAccountActive => CurrentRoute == "account";

    public AppShellViewModel(IFavoritesService favoritesService, IAuthService authService, ApiClient api)
    {
        _favoritesService = favoritesService;
        _authService = authService;
        _api = api;
        _ = CheckConnectionAsync();

        _favoritesCount = _favoritesService.Count;
        _favoritesService.FavoritesChanged += (s, e) => FavoritesCount = _favoritesService.Count;

        UpdateAccountTitle();
        _authService.AuthStateChanged += (s, e) => UpdateAccountTitle();

        InitTheme();
    }

    private void UpdateAccountTitle()
    {
        var signedIn = _authService.IsSignedIn && _authService.CurrentUser != null;
        AccountTitle = signedIn ? "Профиль" : "Войти"; // как пункт меню на сайте (режим mock)
        IsGuest = !signedIn;
    }

    private void InitTheme()
    {
        var saved = Preferences.Default.Get(ThemeKey, string.Empty);
        if (saved == "dark")
        {
            IsDarkTheme = true;
            if (Application.Current != null) Application.Current.UserAppTheme = AppTheme.Dark;
        }
        else if (saved == "light")
        {
            IsDarkTheme = false;
            if (Application.Current != null) Application.Current.UserAppTheme = AppTheme.Light;
        }
        else
        {
            IsDarkTheme = Application.Current?.RequestedTheme == AppTheme.Dark;
        }
    }

    [RelayCommand]
    public void ToggleTheme()
    {
        IsDarkTheme = !IsDarkTheme;
        var theme = IsDarkTheme ? AppTheme.Dark : AppTheme.Light;
        if (Application.Current != null)
        {
            Application.Current.UserAppTheme = theme;
        }
        Preferences.Default.Set(ThemeKey, IsDarkTheme ? "dark" : "light");
    }

    [RelayCommand]
    public async Task NavigateToAsync(string route)
    {
        CurrentRoute = route;
        await Shell.Current.GoToAsync($"//{route}");
    }

    /// <summary>
    /// /api/health → /api/ready (database = ok). Ошибка — окно «Не удалось подключиться к серверу»
    /// с кодом вида «/api/ready · HTTP 503», как на сайте. 401 окно не показывает.
    /// </summary>
    private async Task CheckConnectionAsync()
    {
        _connectionCts?.Cancel();
        var cts = _connectionCts = new CancellationTokenSource();
        ConnectionBusy = true;
        var endpoint = "/api/health";
        try
        {
            await _api.GetAsync(endpoint, cts.Token);
            endpoint = "/api/ready";
            var ready = await _api.GetAsync(endpoint, cts.Token);
            if (ready is not { } r || r.Str("status") != "ready" || r.Str("database") != "ok")
                throw new ApiException(0, "NOT_READY", "Сервис не готов");
            if (!cts.IsCancellationRequested) ConnectionOpen = false;
        }
        catch (ApiException ex) when (!cts.IsCancellationRequested && ex.Status != System.Net.HttpStatusCode.Unauthorized)
        {
            var reason = ex.Code switch
            {
                "TIMEOUT" => "Таймаут соединения",
                "NETWORK" => "Ошибка сети",
                "NOT_READY" => "Сервис не готов",
                _ => "HTTP " + (int)ex.Status
            };
            ConnectionCode = $"{endpoint} · {reason}";
            ConnectionOpen = true;
        }
        catch (Exception) when (cts.IsCancellationRequested) { }
        finally
        {
            if (_connectionCts == cts) ConnectionBusy = false;
        }
    }

    [RelayCommand]
    public void RetryConnection()
    {
        if (!ConnectionBusy) _ = CheckConnectionAsync();
    }

    [RelayCommand]
    public void CloseConnection() => ConnectionOpen = false;

    /// <summary>Внешние ссылки футера (источники, почта, телефон, карта).</summary>
    [RelayCommand]
    public async Task OpenUrlAsync(string url)
    {
        try { await Launcher.Default.OpenAsync(new Uri(url)); } catch { /* нет обработчика ссылки — молча */ }
    }

    /// <summary>Вызывается из AppShell.Navigated: синхронизирует активный пункт меню с реальным маршрутом (вкладки, «назад»).</summary>
    public void SyncRoute(string? location)
    {
        if (string.IsNullOrEmpty(location)) return;
        foreach (var route in new[] { "home", "match", "saved", "account" })
        {
            if (location.Contains($"/{route}", StringComparison.OrdinalIgnoreCase))
            {
                CurrentRoute = route;
                return;
            }
        }
    }
}
