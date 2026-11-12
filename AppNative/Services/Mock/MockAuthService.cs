using System.Text.Json;
using AppNative.Models;

namespace AppNative.Services.Mock;

public class MockAuthService : IAuthService
{
    private const string AccountKey = "starter.account";
    private const string SignedInKey = "starter.signedIn";

    public event EventHandler? AuthStateChanged;
    public bool IsSignedIn { get; private set; }
    public UserProfile? CurrentUser { get; private set; }

    public MockAuthService()
    {
        LoadState();
    }

    private void LoadState()
    {
        try
        {
            var json = Preferences.Default.Get(AccountKey, string.Empty);
            if (!string.IsNullOrEmpty(json))
            {
                CurrentUser = JsonSerializer.Deserialize<UserProfile>(json);
            }
            IsSignedIn = CurrentUser != null && Preferences.Default.Get(SignedInKey, false);
            if (CurrentUser != null)
            {
                CurrentUser.IsSignedIn = IsSignedIn;
            }
        }
        catch
        {
            // fallback
        }
    }

    public Task<bool> RegisterAsync(string name, string email, string password)
    {
        name = name.Trim();
        email = email.Trim().ToLower();

        if (name.Length < 2 || string.IsNullOrEmpty(email) || password.Length < 10)
        {
            return Task.FromResult(false);
        }

        CurrentUser = new UserProfile
        {
            Name = name,
            Email = email,
            CreatedAt = DateTime.UtcNow,
            IsSignedIn = true
        };
        IsSignedIn = true;

        Preferences.Default.Set(AccountKey, JsonSerializer.Serialize(CurrentUser));
        Preferences.Default.Set(SignedInKey, true);

        AuthStateChanged?.Invoke(this, EventArgs.Empty);
        return Task.FromResult(true);
    }

    public Task<bool> LoginAsync(string email, string password)
    {
        email = email.Trim().ToLower();

        if (CurrentUser != null && CurrentUser.Email.Equals(email, StringComparison.OrdinalIgnoreCase))
        {
            IsSignedIn = true;
            CurrentUser.IsSignedIn = true;
            Preferences.Default.Set(SignedInKey, true);
            AuthStateChanged?.Invoke(this, EventArgs.Empty);
            return Task.FromResult(true);
        }

        // Demo fallback if account existed
        return Task.FromResult(false);
    }

    public void Logout()
    {
        IsSignedIn = false;
        if (CurrentUser != null)
        {
            CurrentUser.IsSignedIn = false;
        }
        Preferences.Default.Set(SignedInKey, false);
        AuthStateChanged?.Invoke(this, EventArgs.Empty);
    }
}
