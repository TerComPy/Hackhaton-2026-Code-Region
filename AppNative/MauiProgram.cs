using Microsoft.Extensions.Logging;
using AppNative.Services;
using AppNative.Services.Mock;
using AppNative.ViewModels;
using AppNative.Views;

namespace AppNative
{
    public static class MauiProgram
    {
        public static MauiApp CreateMauiApp()
        {
            var builder = MauiApp.CreateBuilder();
            builder
                .UseMauiApp<App>()
                .ConfigureFonts(fonts =>
                {
                    fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                    fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
                    fonts.AddFont("GolosText-Regular.ttf", "GolosTextRegular");
                    fonts.AddFont("GolosText-Medium.ttf", "GolosTextMedium");
                    fonts.AddFont("GolosText-SemiBold.ttf", "GolosTextSemiBold");
                    fonts.AddFont("JetBrainsMono-Regular.ttf", "JetBrainsMonoRegular");
                    fonts.AddFont("JetBrainsMono-Medium.ttf", "JetBrainsMonoMedium");
                });

            // Services
            builder.Services.AddSingleton<IVacancyService, MockVacancyService>();
            builder.Services.AddSingleton<IFavoritesService, MockFavoritesService>();
            builder.Services.AddSingleton<IAuthService, MockAuthService>();
            builder.Services.AddSingleton<IMatchService, MockMatchService>();

            // ViewModels
            builder.Services.AddSingleton<AppShellViewModel>();
            builder.Services.AddTransient<HomeViewModel>();
            builder.Services.AddTransient<MatchViewModel>();
            builder.Services.AddTransient<SavedViewModel>();
            builder.Services.AddTransient<AccountViewModel>();
            builder.Services.AddTransient<VacancyViewModel>();

            // Views & Shell
            builder.Services.AddSingleton<AppShell>();
            builder.Services.AddTransient<HomePage>();
            builder.Services.AddTransient<MatchPage>();
            builder.Services.AddTransient<SavedPage>();
            builder.Services.AddTransient<AccountPage>();
            builder.Services.AddTransient<VacancyPage>();

            // Поля ввода рисуем сами (рамка — Border в XAML, как во фронтенде).
            // На Windows у TextBox/ComboBox своя рамка, подложка и белый фон при фокусе — убираем.
            RemoveNativeInputChrome();

#if DEBUG
            builder.Logging.AddDebug();
#endif

            return builder.Build();
        }

        private static void RemoveNativeInputChrome()
        {
#if WINDOWS
            static void Clear(Microsoft.UI.Xaml.Controls.Control c)
            {
                var clear = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.Transparent);
                c.BorderThickness = new Microsoft.UI.Xaml.Thickness(0);
                c.Background = clear;
                foreach (var key in new[]
                {
                    "TextControlBackground", "TextControlBackgroundPointerOver", "TextControlBackgroundFocused",
                    "TextControlBorderBrush", "TextControlBorderBrushPointerOver", "TextControlBorderBrushFocused",
                    "ComboBoxBackground", "ComboBoxBackgroundPointerOver", "ComboBoxBackgroundPressed", "ComboBoxBackgroundFocused",
                    "ComboBoxBorderBrush", "ComboBoxBorderBrushPointerOver", "ComboBoxBorderBrushPressed", "ComboBoxBorderBrushFocused"
                })
                {
                    c.Resources[key] = clear;
                }
            }

            Microsoft.Maui.Handlers.EntryHandler.Mapper.AppendToMapping("StarterNoChrome", (h, v) => Clear(h.PlatformView));
            Microsoft.Maui.Handlers.EditorHandler.Mapper.AppendToMapping("StarterNoChrome", (h, v) => Clear(h.PlatformView));
            Microsoft.Maui.Handlers.PickerHandler.Mapper.AppendToMapping("StarterNoChrome", (h, v) => Clear(h.PlatformView));
#endif
#if ANDROID
            // Убираем подчёркивание у EditText на Android
            Microsoft.Maui.Handlers.EntryHandler.Mapper.AppendToMapping("StarterNoChrome", (h, v) =>
                h.PlatformView.BackgroundTintList = Android.Content.Res.ColorStateList.ValueOf(Android.Graphics.Color.Transparent));
            Microsoft.Maui.Handlers.EditorHandler.Mapper.AppendToMapping("StarterNoChrome", (h, v) =>
                h.PlatformView.BackgroundTintList = Android.Content.Res.ColorStateList.ValueOf(Android.Graphics.Color.Transparent));
#endif
        }
    }
}
