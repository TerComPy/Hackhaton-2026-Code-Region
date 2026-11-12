namespace AppNative.Services;

/// <summary>Профиль на сервере (/api/profile): имя и город. У демо — недоступен.</summary>
public interface IProfileService
{
    bool IsAvailable { get; }
    Task<UserProfileData> GetAsync();
    Task<UserProfileData> UpdateAsync(string displayName, string? city);
}

public record UserProfileData(string DisplayName, string City);
