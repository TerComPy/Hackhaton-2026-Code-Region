using AppNative.ViewModels;

namespace AppNative.Views.Controls;

public partial class AppFooter : ContentView
{
    public AppFooter()
    {
        InitializeComponent();
        // Как и шапка, футер работает от общего AppShellViewModel, а не от VM страницы.
        BindingContext = IPlatformApplication.Current?.Services.GetService<AppShellViewModel>();
    }
}
