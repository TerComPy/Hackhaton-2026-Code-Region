using Microsoft.Extensions.Logging;
using Microsoft.Maui.Handlers;

namespace AppWebView;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>();

        ConfigureWebView();

#if DEBUG
        builder.Logging.AddDebug();
#endif

        return builder.Build();
    }

    /// <summary>
    /// Платформенная настройка WebView: JS, localStorage, cookies (для входа в аккаунт),
    /// обработка ссылок target="_blank".
    /// </summary>
    private static void ConfigureWebView()
    {
        WebViewHandler.Mapper.AppendToMapping("StarterWebSettings", (handler, view) =>
        {
#if ANDROID
#if DEBUG
            // Отладка: chrome://inspect в Chrome на компьютере покажет консоль и сеть WebView
            Android.Webkit.WebView.SetWebContentsDebuggingEnabled(true);
#endif
            var webView = handler.PlatformView;
            var settings = webView.Settings;
            settings.JavaScriptEnabled = true;
            settings.DomStorageEnabled = true;
            settings.LoadWithOverviewMode = true;
            settings.UseWideViewPort = true;
            settings.SetSupportZoom(false);
            settings.BuiltInZoomControls = false;
            settings.DisplayZoomControls = false;

            var cookies = Android.Webkit.CookieManager.Instance;
            cookies?.SetAcceptCookie(true);
            cookies?.SetAcceptThirdPartyCookies(webView, true);
#elif WINDOWS
            var webView = handler.PlatformView;

            void Setup(Microsoft.Web.WebView2.Core.CoreWebView2 core)
            {
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = true;
#if DEBUG
                // Отладка: F12 внутри окна приложения открывает DevTools
                core.Settings.AreDevToolsEnabled = true;
#endif

                // Ссылки с target="_blank": свой сайт — в этом же окне, чужие — в браузере.
                core.NewWindowRequested += (s, e) =>
                {
                    e.Handled = true;
                    // about:blank и прочие служебные адреса игнорируем (window.open подменён скриптом на странице)
                    if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri) ||
                        (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
                        return;

                    if (SiteConfig.IsInternal(uri))
                        core.Navigate(uri.ToString());
                    else
                        _ = Launcher.Default.OpenAsync(uri);
                };
            }

            if (webView.CoreWebView2 is not null)
            {
                Setup(webView.CoreWebView2);
            }
            else
            {
                webView.CoreWebView2Initialized += (sender, args) =>
                {
                    if (sender.CoreWebView2 is not null)
                        Setup(sender.CoreWebView2);
                };
            }
#endif
        });
    }
}
