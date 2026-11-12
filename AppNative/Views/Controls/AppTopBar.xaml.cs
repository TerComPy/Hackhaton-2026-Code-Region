using AppNative.ViewModels;

namespace AppNative.Views.Controls;

public partial class AppTopBar : ContentView
{
    public AppTopBar()
    {
        InitializeComponent();

        // Шапка живёт внутри страниц, у которых свой BindingContext (HomeViewModel и т.д.).
        // Раньше контекст наследовался от страницы и кнопки меню/темы/счётчик не работали —
        // поэтому задаём общий singleton AppShellViewModel явно.
        BindingContext = IPlatformApplication.Current?.Services.GetService<AppShellViewModel>();
    }

    protected override void OnHandlerChanged()
    {
        base.OnHandlerChanged();
        if (BindingContext is not AppShellViewModel && Handler?.MauiContext != null)
        {
            BindingContext = Handler.MauiContext.Services.GetService<AppShellViewModel>();
        }
    }
}
