namespace AppNative.Models;

public class UserProfile
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsSignedIn { get; set; }

    public string Initial => string.IsNullOrWhiteSpace(Name) ? "С" : Name.Trim()[..1].ToUpper();
    public string FirstName => string.IsNullOrWhiteSpace(Name) ? "Пользователь" : Name.Trim().Split(' ')[0];
}
