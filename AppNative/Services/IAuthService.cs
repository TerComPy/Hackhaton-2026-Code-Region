using AppNative.Models;

namespace AppNative.Services;

public interface IAuthService
{
    event EventHandler? AuthStateChanged;
    bool IsSignedIn { get; }
    UserProfile? CurrentUser { get; }
    Task<bool> LoginAsync(string email, string password);
    Task<bool> RegisterAsync(string name, string email, string password);
    void Logout();
}
