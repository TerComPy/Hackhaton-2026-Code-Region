using AppNative.ViewModels;

namespace AppNative.Views;

public partial class VacancyPage : ContentPage
{
    public VacancyPage(VacancyViewModel viewModel)
    {
        InitializeComponent();
        BindingContext = viewModel;
    }
}
