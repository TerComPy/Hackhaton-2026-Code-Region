namespace AppNative.Models;

public class MatchTrait
{
    public string Label { get; set; } = string.Empty;
    public string Quote { get; set; } = string.Empty;
}

public class MatchedDirection
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string What { get; set; } = string.Empty;
    public string Why { get; set; } = string.Empty;
    public string Start { get; set; } = string.Empty;
    public string Fit { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public int Strength { get; set; }
    public List<Vacancy> Jobs { get; set; } = new();
}

public class MatchResult
{
    public List<MatchTrait> Traits { get; set; } = new();
    public List<MatchedDirection> Directions { get; set; } = new();
    public bool WantsRemote { get; set; }
    public bool WantsNoExp { get; set; }
}
