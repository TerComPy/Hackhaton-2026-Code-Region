namespace AppWebView;

public partial class MainPage : ContentPage
{
    private const string ProgressAnimationName = "StarterProgress";

    private bool _firstLoadDone;
    private bool _isLoading;
    private string _lastUrl = SiteConfig.StartUrl;

    public MainPage()
    {
        InitializeComponent();
        Connectivity.Current.ConnectivityChanged += OnConnectivityChanged;
        LoadUrl(SiteConfig.StartUrl);
    }

    /// <summary>Маскот на экране загрузки плавно «парит», пока идёт первая загрузка.</summary>
    private void StartMascotAnimation()
    {
        var animation = new Animation
        {
            { 0.0, 0.5, new Animation(v => SplashMascot.TranslationY = v, 0, -14, Easing.SinInOut) },
            { 0.5, 1.0, new Animation(v => SplashMascot.TranslationY = v, -14, 0, Easing.SinInOut) },
        };
        animation.Commit(this, "MascotFloat", length: 1400, repeat: () => SplashOverlay.IsVisible);
    }

    // ---------- Загрузка ----------

    private void LoadUrl(string url)
    {
        if (Connectivity.Current.NetworkAccess != NetworkAccess.Internet)
        {
            ShowError("Нет подключения к интернету. Как только сеть появится, страница загрузится сама.");
            return;
        }

        ErrorOverlay.IsVisible = false;
        if (!_firstLoadDone)
        {
            SplashOverlay.IsVisible = true;
            if (!this.AnimationIsRunning("MascotFloat"))
                StartMascotAnimation();
        }

        Web.Source = new UrlWebViewSource { Url = url };
    }

    private void OnNavigating(object? sender, WebNavigatingEventArgs e)
    {
        if (!Uri.TryCreate(e.Url, UriKind.Absolute, out var uri))
            return;

        if (SiteConfig.IsWebViewInternalScheme(uri))
            return;

        // «Мост» от страницы: starterapp://open?url=... — открыть ссылку (вакансию работодателя и т.п.)
        if (uri.Scheme == SiteConfig.BridgeScheme)
        {
            e.Cancel = true;
            var target = SiteConfig.ParseBridgeTarget(uri);
            if (target is null)
                return;

            if (SiteConfig.IsInternal(target))
                MainThread.BeginInvokeOnMainThread(() => Web.Source = new UrlWebViewSource { Url = target.ToString() });
            else
                _ = OpenExternalAsync(target);
            return;
        }

        if (SiteConfig.IsInternal(uri))
        {
            _lastUrl = uri.ToString();
            SetLoading(true);
            return;
        }

        // Внешние ссылки (сайты работодателей, tel:, mailto:, мессенджеры) — вне приложения.
        e.Cancel = true;
        _ = OpenExternalAsync(uri);
    }

    private void OnNavigated(object? sender, WebNavigatedEventArgs e)
    {
        SetLoading(false);

        switch (e.Result)
        {
            case WebNavigationResult.Success:
                _firstLoadDone = true;
                SplashOverlay.IsVisible = false;
                ErrorOverlay.IsVisible = false;
                _ = InstallPopupShimAsync();
                break;

            case WebNavigationResult.Failure:
            case WebNavigationResult.Timeout:
                ShowError(Connectivity.Current.NetworkAccess == NetworkAccess.Internet
                    ? "Сайт сейчас не отвечает. Попробуйте ещё раз чуть позже."
                    : "Нет подключения к интернету. Как только сеть появится, страница загрузится сама.");
                break;

            // Cancel — это наш собственный перехват внешней ссылки, ничего не делаем.
        }
    }

    /// <summary>
    /// Подменяем window.open на странице: «новые вкладки» и переходы к работодателю
    /// уходят в системный браузер (WebView сам новые окна не открывает).
    /// </summary>
    private async Task InstallPopupShimAsync()
    {
        try
        {
            await Web.EvaluateJavaScriptAsync(SiteConfig.OneLine(SiteConfig.PopupShim));
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Starter] popup shim failed: {ex.Message}");
        }
    }

    private void OnRetryClicked(object? sender, EventArgs e) => LoadUrl(_lastUrl);

    private void OnConnectivityChanged(object? sender, ConnectivityChangedEventArgs e)
    {
        if (e.NetworkAccess == NetworkAccess.Internet && ErrorOverlay.IsVisible)
            MainThread.BeginInvokeOnMainThread(() => LoadUrl(_lastUrl));
    }

    private static async Task OpenExternalAsync(Uri uri)
    {
        try
        {
            // Navigating может прийти не из UI-потока — открываем браузер из главного
            await MainThread.InvokeOnMainThreadAsync(async () =>
            {
                if (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
                {
                    // Системный браузер; если не вышло — через Launcher (ACTION_VIEW / ShellExecute)
                    if (!await Browser.Default.OpenAsync(uri, BrowserLaunchMode.External))
                        await Launcher.Default.TryOpenAsync(uri);
                }
                else
                {
                    await Launcher.Default.TryOpenAsync(uri);
                }
            });
        }
        catch (Exception ex)
        {
            // Нет приложения для такой ссылки — просто игнорируем.
            System.Diagnostics.Debug.WriteLine($"[Starter] open external failed: {uri} — {ex.Message}");
        }
    }

    // ---------- Кнопка «Назад» (Android) ----------

    protected override bool OnBackButtonPressed()
    {
        if (ErrorOverlay.IsVisible && Web.CanGoBack)
        {
            ErrorOverlay.IsVisible = false;
            Web.GoBack();
            return true;
        }

        if (Web.CanGoBack)
        {
            Web.GoBack();
            return true;
        }

        return base.OnBackButtonPressed();
    }

    // ---------- UI-состояния ----------

    private void ShowError(string message)
    {
        ErrorDetails.Text = message;
        SplashOverlay.IsVisible = false;
        ErrorOverlay.IsVisible = true;
        SetLoading(false);
    }

    private void SetLoading(bool loading)
    {
        if (_isLoading == loading)
            return;

        _isLoading = loading;

        // До первой успешной загрузки виден splash, полоска не нужна.
        if (!loading || !_firstLoadDone)
        {
            this.AbortAnimation(ProgressAnimationName);
            ProgressTrack.IsVisible = false;
            return;
        }

        ProgressTrack.IsVisible = true;
        var width = Math.Max(Width, 320);
        var lineWidth = Math.Max(width * 0.3, 80);
        ProgressBarLine.WidthRequest = lineWidth;

        var animation = new Animation(v => ProgressBarLine.TranslationX = v, -lineWidth, width);
        animation.Commit(this, ProgressAnimationName, length: 1100, easing: Easing.CubicInOut,
            repeat: () => _isLoading);
    }
}
