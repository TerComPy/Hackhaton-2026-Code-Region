using AppNative.ViewModels;

namespace AppNative.Views;

public partial class HomePage : ContentPage
{
    private readonly HomeViewModel _viewModel;
    private bool _isCardFlipped = false;

    public HomePage(HomeViewModel viewModel)
    {
        InitializeComponent();
        _viewModel = viewModel;
        BindingContext = _viewModel;

        _viewModel.PropertyChanged += ViewModel_PropertyChanged;
    }

    private async void ViewModel_PropertyChanged(object? sender, System.ComponentModel.PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(HomeViewModel.IsHowDocAiSummary))
        {
            await AnimateCardFlipAsync();
        }
    }

    /// <summary>Клик по подписи чекбокса переключает его, как &lt;label class="check"&gt; на сайте.</summary>
    private void OnCheckLabelTapped(object? sender, TappedEventArgs e)
    {
        if (sender is Element { Parent: Layout layout })
        {
            var box = layout.Children.OfType<CheckBox>().FirstOrDefault();
            if (box != null) box.IsChecked = !box.IsChecked;
        }
    }

    private async Task AnimateCardFlipAsync()
    {
        // Проверка на уменьшение движения в системе
        // Если анимация отключена, не крутим
        try
        {
            _isCardFlipped = !_isCardFlipped;
            double targetRotation = _isCardFlipped ? 360 : 0;
            await HowDocCard.RotateYTo(targetRotation, 350, Easing.CubicOut);
            if (targetRotation >= 360) HowDocCard.RotationY = 0;
        }
        catch
        {
            // fallback
        }
    }
}
