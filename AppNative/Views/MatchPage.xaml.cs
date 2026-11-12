using AppNative.ViewModels;

namespace AppNative.Views;

public partial class MatchPage : ContentPage
{
    public MatchPage(MatchViewModel viewModel)
    {
        InitializeComponent();
        BindingContext = viewModel;
    }
}
