using AppNative.Models;

namespace AppNative.Services.Api;

/// <summary>Понятное пользователю сообщение подбора (например, «подождите 15 секунд»).</summary>
public class MatchException : Exception
{
    public MatchException(string message) : base(message) { }
}

/// <summary>
/// ИИ-подбор профессий: POST /api/match (модуль Даниила, stage 7) — три направления + реальные вакансии.
/// Как Match.vue в режиме API: только после входа, ошибки — понятными сообщениями.
/// </summary>
public class ApiMatchService : IMatchService
{
    private readonly ApiClient _api;
    private readonly IAuthService _auth;

    public event EventHandler? MatchUpdated;
    // «Не сохраняется в СТАРТЕР» — рассказ о себе нигде не храним
    public string SavedAboutText => string.Empty;
    public MatchResult? CurrentResult { get; private set; }
    public string Notice { get; private set; } = string.Empty;

    public HashSet<string> FitDirectionKeys => CurrentResult != null
        ? CurrentResult.Directions.Select(d => d.Key).ToHashSet()
        : new HashSet<string>();

    public ApiMatchService(ApiClient api, IAuthService auth)
    {
        _api = api;
        _auth = auth;
        _auth.AuthStateChanged += (_, _) => Reset();
    }

    public async Task<MatchResult> AnalyzeAsync(string aboutText)
    {
        Notice = string.Empty;
        // Как Match.vue в режиме API: подбор только для вошедших, текст не сохраняем
        if (!_auth.IsSignedIn)
            throw new MatchException("Для персонального подбора нужно войти в аккаунт.");

        try
        {
            var root = await _api.PostAsync("/api/match", new { about = aboutText.Trim() });
            var result = new MatchResult();
            if (root is { } r)
            {
                foreach (var d in r.Arr("directions"))
                {
                    var quotes = d.Arr("evidence").Select(q => q.GetString()).Where(q => !string.IsNullOrWhiteSpace(q)).ToList();
                    var name = d.Str("name") ?? "Направление";
                    result.Directions.Add(new MatchedDirection
                    {
                        Key = name,
                        Name = name,
                        What = d.Str("what") ?? string.Empty,
                        Why = d.Str("why") ?? string.Empty,
                        Start = string.Join(" ", quotes.Select(q => $"«{q}»")),
                        Strength = 1,
                        Jobs = d.Arr("vacancies").Select(ApiMapper.FromListItem).ToList()
                    });
                    foreach (var q in quotes) result.Traits.Add(new MatchTrait { Label = name, Quote = q! });
                }
            }
            if (result.Directions.Count != 3) throw new MatchException("Не удалось подобрать направления. Повторите попытку.");
            return Publish(result);
        }
        catch (ApiException ex)
        {
            throw new MatchException(ex.Status switch
            {
                System.Net.HttpStatusCode.Unauthorized => "Сессия недействительна. Войдите повторно.",
                System.Net.HttpStatusCode.TooManyRequests => "Подождите немного перед повторным подбором.",
                System.Net.HttpStatusCode.ServiceUnavailable when ex.Code is "NETWORK" => "Не удалось связаться с сервером. Проверьте подключение.",
                System.Net.HttpStatusCode.RequestTimeout => "Не удалось связаться с сервером. Проверьте подключение.",
                System.Net.HttpStatusCode.ServiceUnavailable or System.Net.HttpStatusCode.BadGateway => "Сейчас не удалось получить рекомендации от ИИ. Повторите попытку.",
                _ => "Не удалось подобрать направления. Повторите попытку."
            });
        }
    }

    /// <summary>Сброс при смене пользователя (как resetPrivate на сайте).</summary>
    public void Reset()
    {
        CurrentResult = null;
        MatchUpdated?.Invoke(this, EventArgs.Empty);
    }

    private MatchResult Publish(MatchResult result)
    {
        CurrentResult = result;
        MatchUpdated?.Invoke(this, EventArgs.Empty);
        return result;
    }
}
