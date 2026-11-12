namespace AppNative.Services.Api;

/// <summary>GET/PATCH /api/profile → { profile: { id, displayName, city } } (entities/userProfile.ts).</summary>
public class ApiProfileService : IProfileService
{
    private readonly ApiClient _api;
    private readonly IAuthService _auth;

    public ApiProfileService(ApiClient api, IAuthService auth)
    {
        _api = api;
        _auth = auth;
    }

    public bool IsAvailable => _auth.IsSignedIn;

    public async Task<UserProfileData> GetAsync() => Apply(await _api.GetAsync("/api/profile"));

    public async Task<UserProfileData> UpdateAsync(string displayName, string? city) =>
        Apply(await _api.PatchAsync("/api/profile", new { displayName, city }));

    private UserProfileData Apply(System.Text.Json.JsonElement? root)
    {
        var p = root?.Obj("profile") ?? throw new ApiException(System.Net.HttpStatusCode.BadGateway, "EMPTY", "Пустой ответ сервера.");
        var data = new UserProfileData(p.Str("displayName") ?? string.Empty, p.Str("city") ?? string.Empty);
        _auth.UpdateDisplayName(data.DisplayName);
        return data;
    }
}
