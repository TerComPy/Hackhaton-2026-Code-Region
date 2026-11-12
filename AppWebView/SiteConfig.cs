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

    /// <summary>
    /// Служебная схема-«мост»: страница переходит на starterapp://open?url=...,
    /// приложение перехватывает это в Navigating и открывает url в системном браузере.
    /// </summary>
    public const string BridgeScheme = "starterapp";

    /// <summary>
    /// Скрипт, который внедряется в страницу: подменяет window.open, чтобы вакансии работодателей
    /// и любые «новые вкладки» открывались в системном браузере. Поддерживает приём сайта
    /// «открыть about:blank, а потом popup.location.replace(url)».
    /// </summary>
    public const string PopupShim = """
        (function () {
          if (window.__starterPopupShim) return 'already';
          window.__starterPopupShim = true;
          function go(u) {
            var abs;
            try { abs = new URL(String(u), location.href).href; } catch (e) { return; }
            if (!/^https?:/i.test(abs)) return;
            location.href = 'starterapp://open?url=' + encodeURIComponent(abs);
          }
          window.open = function (u) {
            var popup = { closed: false, opener: null, name: '',
              focus: function () {}, blur: function () {},
              close: function () { popup.closed = true; },
              document: { write: function () {}, writeln: function () {}, open: function () {}, close: function () {} } };
            var loc = {
              replace: function (x) { go(x); popup.closed = true; },
              assign: function (x) { go(x); popup.closed = true; },
              reload: function () {}
            };
            Object.defineProperty(loc, 'href', { get: function () { return 'about:blank'; }, set: function (x) { go(x); popup.closed = true; } });
            Object.defineProperty(popup, 'location', { get: function () { return loc; }, set: function (x) { go(x); popup.closed = true; } });
            if (u && String(u) !== 'about:blank') { go(u); popup.closed = true; }
            return popup;
          };
          return 'installed';
        })()
        """;

    /// <summary>Достаёт целевой адрес из starterapp://open?url=...</summary>
    public static Uri? ParseBridgeTarget(Uri bridgeUri)
    {
        // Берём исходную строку: Uri может по-своему нормализовать экранирование в query
        var raw = bridgeUri.OriginalString;
        var q = raw.IndexOf('?');
        if (q < 0)
            return null;

        foreach (var part in raw[(q + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = part.Split('=', 2);
            if (kv.Length == 2 && kv[0] == "url" &&
                Uri.TryCreate(Uri.UnescapeDataString(kv[1]), UriKind.Absolute, out var target) &&
                (target.Scheme == Uri.UriSchemeHttps || target.Scheme == Uri.UriSchemeHttp))
            {
                return target;
            }
        }
        return null;
    }

    /// <summary>Убирает переносы строк: MAUI оборачивает скрипт в eval('...').</summary>
    public static string OneLine(string script) =>
        System.Text.RegularExpressions.Regex.Replace(script, @"\s*[\r\n]+\s*", " ").Trim();

    /// <summary>Служебные схемы, которые WebView обрабатывает сам.</summary>
    public static bool IsWebViewInternalScheme(Uri uri) =>
        uri.Scheme is "about" or "data" or "blob" or "javascript";
}
