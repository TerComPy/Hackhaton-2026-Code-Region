using AppNative.Models;

namespace AppNative.Services;

public interface IMatchService
{
    event EventHandler? MatchUpdated;
    string SavedAboutText { get; }
    MatchResult? CurrentResult { get; }
    HashSet<string> FitDirectionKeys { get; }
    Task<MatchResult> AnalyzeAsync(string aboutText);
}
