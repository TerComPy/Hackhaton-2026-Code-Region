namespace AppNative.Models;

public class JobSource
{
    public string Name { get; set; } = string.Empty;
    public string Site { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string On { get; set; } = string.Empty;
    public int Count { get; set; }

    public string DisplayText => Site != Name && !string.IsNullOrEmpty(Site) ? $"{Site} · {Count} вакансий" : $"{Count} вакансий";
}
