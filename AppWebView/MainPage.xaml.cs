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
            if (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)
                await Browser.Default.OpenAsync(uri, BrowserLaunchMode.External);
            else
                await Launcher.Default.TryOpenAsync(uri);
        }
        catch
        {
            // Нет приложения для такой ссылки — просто игнорируем.
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
