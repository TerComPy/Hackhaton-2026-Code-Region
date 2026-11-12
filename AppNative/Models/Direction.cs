namespace AppNative.Models;

public class Direction
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string What { get; set; } = string.Empty;
    public string Why { get; set; } = string.Empty;
    public string Start { get; set; } = string.Empty;
    public List<(string Pattern, string Label)> Signals { get; set; } = new();
}
