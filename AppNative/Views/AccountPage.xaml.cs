using AppNative.ViewModels;

namespace AppNative.Views;

public partial class AccountPage : ContentPage
{
    public AccountPage(AccountViewModel viewModel)
    {
        InitializeComponent();
        BindingContext = viewModel;

        // «Карта возможностей» рисуется цветами темы — перерисовываем при переключении
        if (Application.Current != null)
            Application.Current.RequestedThemeChanged += (_, _) => OpportunityView.Invalidate();
    }
}
