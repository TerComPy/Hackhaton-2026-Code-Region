namespace AppNative.Views.Controls;

/// <summary>Скелетон каталога (CatalogSkeleton.vue): пульсирует, пока виден.</summary>
public partial class CatalogSkeleton : ContentView
{
    private bool _running;

    public CatalogSkeleton()
    {
        InitializeComponent();
        PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(IsVisible)) UpdatePulse();
        };
        Loaded += (_, _) => UpdatePulse();
        Unloaded += (_, _) => _running = false;
    }

    private async void UpdatePulse()
    {
        if (!IsVisible) { _running = false; Rows.Opacity = 1; return; }
        if (_running) return;
        _running = true;
        while (_running && IsVisible)
        {
            await Rows.FadeTo(0.55, 700, Easing.SinInOut);
            await Rows.FadeTo(1, 700, Easing.SinInOut);
        }
        Rows.Opacity = 1;
    }
}
