using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Models;
using AppNative.Services;

namespace AppNative.ViewModels;

public partial class AccountViewModel : ObservableObject
{
    private readonly IAuthService _authService;
    private readonly IFavoritesService _favoritesService;
    private readonly IMatchService _matchService;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AuthTitle))]
    [NotifyPropertyChangedFor(nameof(AuthSubtitle))]
    [NotifyPropertyChangedFor(nameof(SwitchQuestion))]
    [NotifyPropertyChangedFor(nameof(SwitchAction))]
    private bool _isRegisterMode = true;

    partial void OnIsRegisterModeChanged(bool value)
    {
        OnPropertyChanged(nameof(SubmitButtonText));
    }

    public string SubmitButtonText => IsRegisterMode ? "Создать профиль" : "Войти";

    // Тексты Account.vue (режим mock)
    public string AuthTitle => IsRegisterMode ? "Начните со своего." : "Продолжим поиск.";
    public string AuthSubtitle => IsRegisterMode
        ? "Создайте демо-профиль, чтобы сохранять вакансии и собирать свою подборку."
        : "Войдите в демо-профиль и вернитесь к сохранённым вакансиям.";
    public string SwitchQuestion => IsRegisterMode ? "Уже есть аккаунт?" : "Нет аккаунта?";
    public string SwitchAction => IsRegisterMode ? "Войти" : "Зарегистрироваться";

    [RelayCommand]
    public void SwitchMode() => SetMode(IsRegisterMode ? "login" : "register");

    [ObservableProperty]
    private string _name = string.Empty;

    [ObservableProperty]
    private string _email = string.Empty;

    [ObservableProperty]
    private string _password = string.Empty;

    [ObservableProperty]
    private bool _isPasswordHidden = true;

    [ObservableProperty]
    private string _nameError = string.Empty;

    [ObservableProperty]
    private string _emailError = string.Empty;

    [ObservableProperty]
    private string _passwordError = string.Empty;

    [ObservableProperty]
    private string _generalError = string.Empty;

    [ObservableProperty]
    private bool _isSignedIn;

    [ObservableProperty]
    private UserProfile? _currentUser;

    [ObservableProperty]
    private string _savedStatsText = "Пока пусто";

    [ObservableProperty]
    private string _matchStatsText = "Ещё не пройден";

    [ObservableProperty]
    private string _aboutStatsText = "Расскажите о себе на странице подбора — по этому тексту мы подбираем направления.";

    [ObservableProperty]
    private string _memberSinceText = "Профиль";

    public AccountViewModel(
        IAuthService authService,
        IFavoritesService favoritesService,
        IMatchService matchService)
    {
        _authService = authService;
        _favoritesService = favoritesService;
        _matchService = matchService;

        _authService.AuthStateChanged += (s, e) => RefreshUser();
        _favoritesService.FavoritesChanged += (s, e) => RefreshStats();
        _matchService.MatchUpdated += (s, e) => RefreshStats();

        RefreshUser();
    }

    private void RefreshUser()
    {
        IsSignedIn = _authService.IsSignedIn;
        CurrentUser = _authService.CurrentUser;

        if (CurrentUser != null && IsSignedIn)
        {
            MemberSinceText = $"В Стартере с {CurrentUser.CreatedAt:d MMMM yyyy}";
            RefreshStats();
        }
        else
        {
            IsRegisterMode = CurrentUser == null;
        }
    }

    private void RefreshStats()
    {
        int count = _favoritesService.Count;
        SavedStatsText = $"{count} сохранённых вакансий"; // как в Account.vue

        if (_matchService.CurrentResult != null && _matchService.CurrentResult.Directions.Count > 0)
        {
            MatchStatsText = string.Join(", ", _matchService.CurrentResult.Directions.Select(d => d.Name));
        }
        else
        {
            MatchStatsText = "Ещё не пройден";
        }

        AboutStatsText = !string.IsNullOrWhiteSpace(_matchService.SavedAboutText)
            ? _matchService.SavedAboutText
            : "Расскажите о себе на странице подбора — по этому тексту мы подбираем направления.";
    }

    [RelayCommand]
    public void SetMode(string mode)
    {
        IsRegisterMode = mode == "register";
        ClearErrors();
    }

    [RelayCommand]
    public void TogglePasswordVisibility()
    {
        IsPasswordHidden = !IsPasswordHidden;
    }

    private void ClearErrors()
    {
        NameError = string.Empty;
        EmailError = string.Empty;
        PasswordError = string.Empty;
        GeneralError = string.Empty;
    }

    [RelayCommand]
    public async Task SubmitAuthAsync()
    {
        ClearErrors();

        // Account.vue (mock): одно общее сообщение и та же проверка
        var email = Email.Trim();
        bool emailOk = System.Text.RegularExpressions.Regex.IsMatch(email, @"^[^\s@]+@[^\s@]+\.[^\s@]+$");
        if ((IsRegisterMode && string.IsNullOrWhiteSpace(Name)) || !emailOk || Password.Length < 10)
        {
            GeneralError = "Укажите имя, корректный email и пароль не короче 10 символов.";
            return;
        }

        // Как на сайте: имя — введённое или часть email до «@»; пароль нигде не хранится
        var name = string.IsNullOrWhiteSpace(Name) ? email.Split('@')[0] : Name.Trim();
        if (!await _authService.LoginAsync(email, Password))
        {
            await _authService.RegisterAsync(name.Length < 2 ? name + "_" : name, email, Password);
        }
        Password = string.Empty;
        IsPasswordHidden = true;
    }

    [RelayCommand]
    public void Logout()
    {
        _authService.Logout();
        IsRegisterMode = false;
    }

    [RelayCommand]
    public async Task NavigateToSavedAsync()
    {
        await Shell.Current.GoToAsync("//saved");
    }

    [RelayCommand]
    public async Task NavigateToMatchAsync()
    {
        await Shell.Current.GoToAsync("//match");
    }
}
