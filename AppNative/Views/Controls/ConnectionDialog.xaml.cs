using AppNative.ViewModels;

namespace AppNative.Views.Controls;

public partial class ConnectionDialog : ContentView
{
    public ConnectionDialog()
    {
        InitializeComponent();
        // Общий AppShellViewModel: проверка сервера одна на всё приложение
        BindingContext = IPlatformApplication.Current?.Services.GetService<AppShellViewModel>();
    }
}
