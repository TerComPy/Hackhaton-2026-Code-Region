namespace AppNative.Views.Controls;

/// <summary>
/// Статичная «карта возможностей» для правой панели входа — нативная замена анимированного
/// canvas из PerlinOpportunity.vue: линии потока по гладкому шумовому полю, акцентный цвет.
/// </summary>
public class OpportunityDrawable : IDrawable
{
    public void Draw(ICanvas canvas, RectF rect)
    {
        bool dark = Application.Current?.RequestedTheme == AppTheme.Dark;
        var accent = dark ? Color.FromArgb("#FF6A43") : Color.FromArgb("#D9431F");
        var ink = dark ? Color.FromArgb("#EDEBE5") : Color.FromArgb("#141413");

        var rnd = new Random(2026); // фиксированное зерно — картинка всегда одинаковая
        canvas.StrokeLineCap = LineCap.Round;

        for (int i = 0; i < 420; i++)
        {
            float x = (float)(rnd.NextDouble() * rect.Width);
            float y = (float)(rnd.NextDouble() * rect.Height);
            bool hot = rnd.NextDouble() < 0.22;
            canvas.StrokeColor = (hot ? accent : ink).WithAlpha(hot ? 0.55f : 0.14f);
            canvas.StrokeSize = hot ? 1.4f : 1f;

            var path = new PathF();
            path.MoveTo(x, y);
            for (int step = 0; step < 28; step++)
            {
                double a = Field(x / rect.Width, y / rect.Height);
                x += (float)Math.Cos(a) * 6f;
                y += (float)Math.Sin(a) * 6f;
                if (x < 0 || y < 0 || x > rect.Width || y > rect.Height) break;
                path.LineTo(x, y);
            }
            canvas.DrawPath(path);
        }
    }

    // Гладкое псевдошумовое поле направлений (сумма синусоид)
    private static double Field(double u, double v) =>
        Math.Sin(u * 5.1 + Math.Cos(v * 3.7)) * 1.6
        + Math.Cos(v * 4.3 - u * 2.2) * 1.2
        + Math.Sin((u + v) * 7.9) * 0.4;
}
