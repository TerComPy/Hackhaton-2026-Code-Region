using AppNative.ViewModels;

namespace AppNative.Views;

public partial class SavedPage : ContentPage
{
    private readonly SavedViewModel _viewModel;

    public SavedPage(SavedViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = _viewModel;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        _ = _viewModel.LoadSavedAsync();
    }
}
