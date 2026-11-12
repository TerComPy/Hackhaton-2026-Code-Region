namespace AppWebView;

/// <summary>
/// Настройки сайта, который открывается внутри приложения.
/// </summary>
public static class SiteConfig
{
    /// <summary>Стартовая страница.</summary>
    public const string StartUrl = "https://starterjob.ru/";

    /// <summary>
    /// Домены, которые открываются внутри WebView (поддомены тоже).
    /// Всё остальное (сайты работодателей, «Работа России» и т.п.) уходит в системный браузер.
    /// Если появится вход через внешний сервис (VK ID, Госуслуги и т.д.) — добавьте его домен сюда.
    /// </summary>
    public static readonly string[] InternalHosts =
    {
        "starterjob.ru",
    };

    public static bool IsInternal(Uri uri)
    {
        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
            return false;

        var host = uri.Host.ToLowerInvariant();
        return InternalHosts.Any(h => host == h || host.EndsWith("." + h, StringComparison.Ordinal));
    }

    /// <summary>Служебные схемы, которые WebView обрабатывает сам.</summary>
    public static bool IsWebViewInternalScheme(Uri uri) =>
        uri.Scheme is "about" or "data" or "blob" or "javascript";
}
