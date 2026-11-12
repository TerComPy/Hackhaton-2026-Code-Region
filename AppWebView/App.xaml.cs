namespace AppWebView;

public partial class App : Application
{
    public App()
    {
        InitializeComponent();
    }

    protected override Window CreateWindow(IActivationState? activationState)
    {
        return new Window(new MainPage())
        {
            Title = "Стартер — вакансии простым языком",
            Width = 1240,
            Height = 840,
            MinimumWidth = 400,
            MinimumHeight = 600
        };
    }
}
