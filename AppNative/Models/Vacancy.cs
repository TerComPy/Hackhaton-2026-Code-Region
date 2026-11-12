namespace AppNative.Models;

public class VacancyDuties
{
    public List<string> Duties { get; set; } = new();
    public List<string> Requirements { get; set; } = new();
    public List<string> Conditions { get; set; } = new();
}

public class VacancyPlain
{
    public string Duties { get; set; } = string.Empty;
    public string Requirements { get; set; } = string.Empty;
    public string Conditions { get; set; } = string.Empty;
}

public class Vacancy
{
    public int Id { get; set; }
    public string Short { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Search { get; set; } = string.Empty;
    public string Company { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public string Format { get; set; } = string.Empty;
    public string Experience { get; set; } = string.Empty;
    public int[]? Salary { get; set; }
    public string Source { get; set; } = string.Empty;
    public string Posted { get; set; } = string.Empty;
    public string Direction { get; set; } = string.Empty;
    public string Photo { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string SourceFrom { get; set; } = string.Empty;
    public string SourceOn { get; set; } = string.Empty;

    public VacancyDuties Original { get; set; } = new();
    public VacancyPlain Plain { get; set; } = new();

    public string PhotoUrl => $"https://images.unsplash.com/photo-{Photo}?auto=format&fit=crop&w=480&q=70";
    public string LargePhotoUrl => $"https://images.unsplash.com/photo-{Photo}?auto=format&fit=crop&w=1200&h=600&q=70";

    public string SalaryDisplay
    {
        get
        {
            if (Salary == null || Salary.Length < 2) return "Зарплата не указана";
            return $"{Salary[0]:N0} – {Salary[1]:N0} ₽".Replace(',', ' ');
        }
    }

    public string SalaryShortDisplay
    {
        get
        {
            if (Salary == null || Salary.Length < 1) return "зарплата не указана";
            return $"от {Salary[0]:N0} ₽".Replace(',', ' ');
        }
    }

    public string ExperienceTag => Experience == "Без опыта" ? "Без опыта" : $"Опыт {Experience.ToLower()}";
}
