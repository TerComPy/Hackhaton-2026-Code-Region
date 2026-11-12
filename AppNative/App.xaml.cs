namespace AppNative
{
    public partial class App : Application
    {
        private readonly IServiceProvider _serviceProvider;

        public App(IServiceProvider serviceProvider)
        {
            InitializeComponent();
            _serviceProvider = serviceProvider;
        }

        protected override Window CreateWindow(IActivationState? activationState)
        {
            var shell = _serviceProvider.GetRequiredService<AppShell>();
            var window = new Window(shell)
            {
                Title = "Стартер — вакансии простым языком",
                Width = 1240,
                Height = 840,
                MinimumWidth = 900,
                MinimumHeight = 600
            };
            return window;
        }
    }
}
