using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace AppNative.Services.Api;

/// <summary>Ошибка API в формате бэкенда: { error: { code, message } }.</summary>
public class ApiException : Exception
{
    public HttpStatusCode Status { get; }
    public string Code { get; }

    public ApiException(HttpStatusCode status, string code, string message) : base(message)
    {
        Status = status;
        Code = code;
    }
}

/// <summary>
/// Тонкий клиент к Node-Back: JSON, Bearer-токен, единый разбор ошибок.
/// Токен хранится в Preferences (демо-приложение хакатона).
/// </summary>
public class ApiClient
{
    private const string TokenKey = "starter.api.token";
    private readonly HttpClient _http;

    /// <summary>Сервер ответил 401 — токен истёк или отозван.</summary>
    public event EventHandler? Unauthorized;

    public ApiClient()
    {
        _http = new HttpClient { BaseAddress = new Uri(ApiConfig.BaseUrl), Timeout = ApiConfig.Timeout };
        _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        Token = Preferences.Default.Get(TokenKey, string.Empty);
    }

    public string Token { get; private set; }
    public bool HasToken => !string.IsNullOrEmpty(Token);

    public void SetToken(string? token)
    {
        Token = token ?? string.Empty;
        if (HasToken) Preferences.Default.Set(TokenKey, Token);
        else Preferences.Default.Remove(TokenKey);
    }

    public Task<JsonElement?> GetAsync(string path, CancellationToken ct = default) =>
        SendAsync(HttpMethod.Get, path, null, ct);

    public Task<JsonElement?> PostAsync(string path, object? body = null, CancellationToken ct = default) =>
        SendAsync(HttpMethod.Post, path, body, ct);

    public Task<JsonElement?> PutAsync(string path, CancellationToken ct = default) =>
        SendAsync(HttpMethod.Put, path, null, ct);

    public Task<JsonElement?> PatchAsync(string path, object? body, CancellationToken ct = default) =>
        SendAsync(HttpMethod.Patch, path, body, ct);

    public Task<JsonElement?> DeleteAsync(string path, CancellationToken ct = default) =>
        SendAsync(HttpMethod.Delete, path, null, ct);

    private async Task<JsonElement?> SendAsync(HttpMethod method, string path, object? body, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, path);
        if (HasToken) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        if (body != null)
            request.Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, ct);
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ApiException(HttpStatusCode.RequestTimeout, "TIMEOUT", "Сервер долго не отвечает. Попробуйте ещё раз.");
        }
        catch (HttpRequestException)
        {
            throw new ApiException(HttpStatusCode.ServiceUnavailable, "NETWORK", "Нет связи с сервером. Проверьте интернет.");
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(ct);
            if (response.IsSuccessStatusCode)
            {
                if (string.IsNullOrWhiteSpace(text)) return null;
                using var doc = JsonDocument.Parse(text);
                return doc.RootElement.Clone();
            }

            var code = "HTTP_" + (int)response.StatusCode;
            var message = "Ошибка сервера (" + (int)response.StatusCode + ").";
            try
            {
                using var doc = JsonDocument.Parse(text);
                if (doc.RootElement.TryGetProperty("error", out var err))
                {
                    code = err.Str("code") ?? code;
                    message = err.Str("message") ?? message;
                }
            }
            catch (JsonException) { /* не JSON — оставляем общее сообщение */ }

            if (response.StatusCode == HttpStatusCode.Unauthorized && HasToken)
                Unauthorized?.Invoke(this, EventArgs.Empty);

            throw new ApiException(response.StatusCode, code, message);
        }
    }
}

/// <summary>Безопасное чтение полей: mysql2 отдаёт BIGINT/DECIMAL то числом, то строкой.</summary>
public static class JsonExt
{
    public static string? Str(this JsonElement e, string name)
    {
        if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(name, out var v)) return null;
        return v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number => v.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => null
        };
    }

    public static decimal? Dec(this JsonElement e, string name)
    {
        var s = e.Str(name);
        return decimal.TryParse(s, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    public static IEnumerable<JsonElement> Arr(this JsonElement e, string name)
    {
        if (e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Array)
            foreach (var item in v.EnumerateArray()) yield return item;
    }

    public static JsonElement? Obj(this JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Object ? v : null;
}
