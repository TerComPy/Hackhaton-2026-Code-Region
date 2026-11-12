namespace AppNative.Services.Mock;

/// <summary>Демо-режим: редактора профиля нет (как Account.vue в режиме mock).</summary>
public class MockProfileService : IProfileService
{
    public bool IsAvailable => false;
    public Task<UserProfileData> GetAsync() => Task.FromException<UserProfileData>(new NotSupportedException());
    public Task<UserProfileData> UpdateAsync(string displayName, string? city) => Task.FromException<UserProfileData>(new NotSupportedException());
}
