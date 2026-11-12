using AppNative.ViewModels;

namespace AppNative.Views.Controls;

public partial class AppFooter : ContentView
{
    /// <summary>Кот с клубком в углу футера — как на сайте, только на главной.</summary>
    public static readonly BindableProperty ShowCatProperty = BindableProperty.Create(
        nameof(ShowCat), typeof(bool), typeof(AppFooter), false,
        propertyChanged: (b, _, v) => ((AppFooter)b).ApplyCat((bool)v));

    // Как .footer--illustrated: добавляем место снизу и ставим кота в эту полосу, не поверх текста
    private void ApplyCat(bool show)
    {
        var extra = DeviceInfo.Idiom == DeviceIdiom.Phone ? 110 : 160;
        var p = FooterRoot.Padding;
        FooterRoot.Padding = new Thickness(p.Left, p.Top, p.Right, show ? 32 + extra : 32);
        FooterCat.IsVisible = show;
        FooterCat.Margin = new Thickness(0, 0, 0, -(extra + 32) + 4);
    }

    public bool ShowCat
    {
        get => (bool)GetValue(ShowCatProperty);
        set => SetValue(ShowCatProperty, value);
    }

    public AppFooter()
    {
        InitializeComponent();
        // Как и шапка, футер работает от общего AppShellViewModel, а не от VM страницы.
        BindingContext = IPlatformApplication.Current?.Services.GetService<AppShellViewModel>();
    }
}
