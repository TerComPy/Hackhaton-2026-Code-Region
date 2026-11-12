using AppNative.ViewModels;
using AppNative.Views;

namespace AppNative;

public partial class AppShell : Shell
{
    public AppShell(AppShellViewModel viewModel)
    {
        InitializeComponent();
        BindingContext = viewModel;

        Routing.RegisterRoute("vacancy", typeof(VacancyPage));

        Navigated += (_, e) => viewModel.SyncRoute(e.Current?.Location?.OriginalString);
    }
}
