using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using AppNative.Models;
using AppNative.Services;

namespace AppNative.ViewModels;

[QueryProperty(nameof(VacancyId), "id")]
public partial class VacancyViewModel : ObservableObject
{
    private readonly IVacancyService _vacancyService;
    private readonly IFavoritesService _favoritesService;
    private readonly IMatchService _matchService;

    [ObservableProperty]
    private int _vacancyId;

    [ObservableProperty]
    private Vacancy? _vacancy;

    [ObservableProperty]
    private bool _isPlainMode = true;

    // ---------- ИИ-пересказ (VacancySheet.vue + entities/aiSummary.ts) ----------
    private const int PollDelayMs = 1600;
    private static readonly TimeSpan MaxPoll = TimeSpan.FromSeconds(90);
    private CancellationTokenSource? _aiCts;
    private AiSummaryState? _ai;
    private bool _wantsPlain;

    /// <summary>Вакансия из базы СТАРТЕР (API) — другие подписи, факт «График», ИИ-пересказ.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(PlainLabel))]
    [NotifyPropertyChangedFor(nameof(OriginalLabel))]
    [NotifyPropertyChangedFor(nameof(OriginalHead1))]
    [NotifyPropertyChangedFor(nameof(OriginalHead2))]
    [NotifyPropertyChangedFor(nameof(OriginalHead3))]
    [NotifyPropertyChangedFor(nameof(OpenButtonText))]
    [NotifyPropertyChangedFor(nameof(FootNote))]
    private bool _isLive;

    [ObservableProperty] private string _aiNote = string.Empty;

    /// <summary>ИИ генерирует пересказ (ai.busy во фронтенде): кнопка «Простыми словами» неактивна.</summary>
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(CanShowPlain))]
    private bool _aiBusy;
    public bool CanShowPlain => !AiBusy;

    // ---------- Загрузка и переход к работодателю (vacancyDetails.ts) ----------
    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasLoadError))]
    private string _loadError = string.Empty;
    public bool HasLoadError => !string.IsNullOrEmpty(LoadError);

    [ObservableProperty] private bool _isLoading;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(OpenButtonText))]
    [NotifyPropertyChangedFor(nameof(CanOpen))]
    private bool _outboundBusy;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasOutboundError))]
    private string _outboundError = string.Empty;
    public bool HasOutboundError => !string.IsNullOrEmpty(OutboundError);

    private bool _outboundUnavailable;
    public bool CanOpen => !OutboundBusy && (!IsLive || (Vacancy?.IsActive == true && !_outboundUnavailable));
    /// <summary>Переключатель «Простыми словами / Оригинал» — у демо и активных вакансий.</summary>
    public bool ShowSeg => !IsLive || Vacancy?.IsActive == true;
    public bool ShowArchivedNote => IsLive && Vacancy?.IsArchived == true;
    [ObservableProperty] private string _aiError = string.Empty;
    [ObservableProperty] private string _aiSimpleTitle = string.Empty;
    [ObservableProperty] private bool _aiBeginner;

    public string PlainLabel => IsLive ? "ПЕРЕСКАЗ ИИ" : string.Empty;
    public string OriginalLabel => IsLive ? "ОРИГИНАЛЬНОЕ ОБЪЯВЛЕНИЕ" : string.Empty;
    public string OriginalHead1 => IsLive ? "Обязанности" : "Что делать";
    public string OriginalHead2 => IsLive ? "Требования" : "Что нужно";
    public string OriginalHead3 => IsLive ? "Описание" : "Условия";
    public string OpenButtonText => IsLive
        ? (OutboundBusy ? "Открываем…" : "Открыть у работодателя")
        : $"Открыть на {Vacancy?.Source}";
    public string FootNote => IsLive
        ? "Переход к работодателю не является откликом на вакансию."
        : "Демо-вакансия: ссылка открывает поиск похожих объявлений.";

    [ObservableProperty]
    private bool _isFavorite;

    [ObservableProperty]
    private string _fitTitle = "Подходит ли это вам?";

    [ObservableProperty]
    private string _fitText = "Расскажите о себе в паре абзацев — объясним, какие вакансии вам ближе и почему.";

    [ObservableProperty]
    private bool _showMatchLink = true;

    public VacancyViewModel(
        IVacancyService vacancyService,
        IFavoritesService favoritesService,
        IMatchService matchService)
    {
        _vacancyService = vacancyService;
        _favoritesService = favoritesService;
        _matchService = matchService;
    }

    async partial void OnVacancyIdChanged(int value)
    {
        _aiCts?.Cancel();
        _ai = null;
        _wantsPlain = false;
        AiNote = AiError = AiSimpleTitle = LoadError = OutboundError = string.Empty;
        AiBeginner = AiBusy = _outboundUnavailable = false;
        IsLoading = true;
        try
        {
            Vacancy = await _vacancyService.GetVacancyByIdAsync(value);
            if (Vacancy == null) LoadError = "Вакансия не найдена или удалена.";
        }
        catch (AppNative.Services.Api.ApiException ex)
        {
            Vacancy = null;
            LoadError = ex.Status switch
            {
                System.Net.HttpStatusCode.Unauthorized => "Сессия недействительна. Войдите повторно.",
                System.Net.HttpStatusCode.NotFound => "Вакансия не найдена или удалена.",
                _ => "Не удалось загрузить вакансию. Повторите попытку."
            };
        }
        catch (Exception)
        {
            Vacancy = null;
            LoadError = "Не удалось загрузить вакансию. Повторите попытку.";
        }
        finally
        {
            IsLoading = false;
        }
        IsLive = Vacancy?.IsLive == true;
        OnPropertyChanged(nameof(OpenButtonText));
        OnPropertyChanged(nameof(CanOpen));
        OnPropertyChanged(nameof(ShowSeg));
        OnPropertyChanged(nameof(ShowArchivedNote));
        if (IsLive && Vacancy?.IsActive == true)
        {
            // Как на сайте: сначала оригинал; готовый пересказ только читаем (модель не тратим)
            IsPlainMode = false;
            _ = FetchAiAsync(enqueue: false);
        }
        if (Vacancy != null)
        {
            IsFavorite = _favoritesService.IsFavorite(Vacancy.Id);
            UpdateFitBlock();
        }
    }

    private void UpdateFitBlock()
    {
        if (Vacancy == null) return;

        var result = _matchService.CurrentResult;
        if (result != null)
        {
            var dir = result.Directions.FirstOrDefault(d => d.Key == Vacancy.Direction);
            if (dir != null)
            {
                FitTitle = "Почему может подойти";
                FitText = $"{dir.Reason}\n\n{Vacancy.Note}.";
                ShowMatchLink = false;
            }
            else
            {
                FitTitle = "Не в ваших главных направлениях";
                var names = string.Join(", ", result.Directions.Select(d => d.Name.ToLower()));
                FitText = $"По вашему рассказу ближе {names}. Но посмотреть и сравнить никто не мешает.";
                ShowMatchLink = false;
            }
        }
        else
        {
            FitTitle = "Подходит ли это вам?";
            FitText = "Расскажите о себе в паре абзацев — объясним, какие вакансии вам ближе и почему.";
            ShowMatchLink = true;
        }
    }

    [RelayCommand]
    public void SetMode(string mode)
    {
        if (!IsLive)
        {
            IsPlainMode = mode == "plain";
            return;
        }
        if (mode != "plain")
        {
            _wantsPlain = false;
            IsPlainMode = false;
            return;
        }
        _wantsPlain = true;
        if (_ai?.IsDone == true) { IsPlainMode = true; return; }
        if (_aiCts != null) return; // уже ждём
        AiError = string.Empty;
        AiBusy = true;
        // Уже в очереди — только опрашиваем, иначе ставим в очередь
        _ = FetchAiAsync(enqueue: _ai?.IsInProgress != true);
    }

    [RelayCommand]
    public void RetryAi()
    {
        if (_aiCts != null) return;
        _wantsPlain = true;
        AiError = string.Empty;
        AiBusy = true;
        _ = FetchAiAsync(enqueue: _ai?.IsInProgress != true);
    }

    private async Task FetchAiAsync(bool enqueue)
    {
        if (Vacancy == null) return;
        _aiCts?.Cancel();
        var cts = _aiCts = new CancellationTokenSource();
        var id = Vacancy.Id;
        var deadline = DateTime.UtcNow + MaxPoll;
        AiNote = "Проверяем наличие ИИ-пересказа…";
        try
        {
            var state = await _vacancyService.GetAiSummaryAsync(id, enqueue);
            while (!cts.IsCancellationRequested && state is { IsInProgress: true })
            {
                ApplyAi(state);
                AiBusy = true;
                AiNote = "ИИ готовит понятное описание. Оригинал доступен, пока идёт обработка.";
                if (DateTime.UtcNow > deadline)
                {
                    AiError = "Обработка занимает больше времени. Проверьте статус позднее.";
                    return;
                }
                await Task.Delay(PollDelayMs, cts.Token);
                state = await _vacancyService.GetAiSummaryAsync(id, false);
            }
            if (cts.IsCancellationRequested || Vacancy?.Id != id) return;
            ApplyAi(state);
            if (state?.Status == "failed") AiError = "ИИ не смог обработать вакансию. Можно повторить попытку.";
            else if (enqueue && state?.IsDone != true) AiError = "Не удалось получить пересказ. Оригинал вакансии доступен.";
        }
        catch (TaskCanceledException) { }
        catch (AppNative.Services.Api.ApiException ex)
        {
            AiError = ex.Code switch
            {
                "AI_NOT_CONFIGURED" => "ИИ пока не настроен на сервере. Оригинал вакансии доступен.",
                "UNAUTHORIZED" => "Сессия истекла. Войдите повторно, чтобы получить пересказ.",
                "NOT_FOUND" => "ИИ-пересказ для этой вакансии недоступен.",
                "NETWORK" or "TIMEOUT" => "Нет связи с сервером. Оригинал вакансии доступен.",
                _ => "Не удалось получить пересказ. Оригинал вакансии доступен."
            };
        }
        finally
        {
            if (_aiCts == cts) { _aiCts = null; AiNote = string.Empty; AiBusy = false; }
        }
    }

    private void ApplyAi(AiSummaryState? state)
    {
        _ai = state;
        if (state is not { IsDone: true } || Vacancy == null) return;
        static string Lines(List<string> l) => string.Join("\n", l.Select(x => "— " + x));
        AiSimpleTitle = state.SimpleTitle;
        AiBeginner = state.BeginnerFriendly;
        Vacancy.Plain = new VacancyPlain
        {
            Duties = Lines(state.WhatYouDo),
            Requirements = Lines(state.Requirements),
            Conditions = Lines(state.Conditions)
        };
        OnPropertyChanged(nameof(Vacancy));
        if (_wantsPlain) IsPlainMode = true;
    }

    [RelayCommand]
    public void ToggleFavorite()
    {
        if (Vacancy == null) return;
        _favoritesService.ToggleFavorite(Vacancy.Id);
        IsFavorite = _favoritesService.IsFavorite(Vacancy.Id);
    }

    [RelayCommand]
    public async Task OpenExternalAsync()
    {
        if (Vacancy == null || !CanOpen) return;
        // API: фиксируем переход (outbound-click) и берём оригинальную ссылку; демо — ссылка поиска
        string? url;
        OutboundBusy = true;
        OutboundError = string.Empty;
        try
        {
            url = await _vacancyService.GetOutboundUrlAsync(Vacancy.Id) ?? Vacancy.Url;
        }
        catch (AppNative.Services.Api.ApiException ex)
        {
            if (ex.Status == System.Net.HttpStatusCode.NotFound)
            {
                _outboundUnavailable = true;
                OutboundError = "Переход недоступен: вакансия удалена или находится в архиве.";
            }
            else
            {
                OutboundError = ex.Status == System.Net.HttpStatusCode.Unauthorized
                    ? "Сессия недействительна. Войдите повторно."
                    : "Не удалось открыть вакансию. Повторите попытку.";
            }
            return;
        }
        catch (Exception)
        {
            OutboundError = "Не удалось открыть вакансию. Повторите попытку.";
            return;
        }
        finally
        {
            OutboundBusy = false;
            OnPropertyChanged(nameof(CanOpen));
        }
        // Как safeExternalUrl на сайте: только http/https
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            OutboundError = "Не удалось открыть вакансию. Повторите попытку.";
            return;
        }
        try
        {
            await Launcher.Default.OpenAsync(uri);
        }
        catch
        {
            OutboundError = "Не удалось открыть вакансию. Повторите попытку.";
        }
    }

    [RelayCommand]
    public async Task CloseAsync()
    {
        await Shell.Current.GoToAsync("..");
    }

    [RelayCommand]
    public async Task NavigateToMatchAsync()
    {
        await Shell.Current.GoToAsync("//match");
    }
}
