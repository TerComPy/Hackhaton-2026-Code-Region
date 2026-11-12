namespace AppNative.Models;

/// <summary>Ответ /api/vacancies/{id}/summary: статус очереди ИИ и сам пересказ.</summary>
public class AiSummaryState
{
    /// <summary>pending | processing | done | failed | unavailable</summary>
    public string Status { get; set; } = "unavailable";
    public string SimpleTitle { get; set; } = string.Empty;
    public List<string> WhatYouDo { get; set; } = new();
    public List<string> Requirements { get; set; } = new();
    public List<string> Conditions { get; set; } = new();
    public bool BeginnerFriendly { get; set; }

    public bool IsDone => Status == "done";
    public bool IsInProgress => Status is "pending" or "processing";
}
