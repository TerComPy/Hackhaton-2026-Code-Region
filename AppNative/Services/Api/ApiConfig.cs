namespace AppNative.Services.Api;

/// <summary>Адрес бэкенда СТАРТЕР. Меняется в одном месте.</summary>
public static class ApiConfig
{
    public const string BaseUrl = "https://starterjob.ru";

    /// <summary>Таймаут обычных запросов. ИИ-подбор ждём отдельно дольше (бэкенд держит до 18 с).</summary>
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(25);
}
