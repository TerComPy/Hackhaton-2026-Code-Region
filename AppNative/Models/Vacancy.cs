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

/// <summary>Раздел оригинального объявления (Описание / Обязанности / Требования).</summary>
public record VacancySection(string Label, string Text);

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

    /// <summary>График (только вакансии из API).</summary>
    public string Schedule { get; set; } = string.Empty;
    public bool HasSchedule => !string.IsNullOrWhiteSpace(Schedule);

    /// <summary>true — вакансия из базы СТАРТЕР (API), false — демо-карточка.</summary>
    public bool IsLive { get; set; }

    // ---------- Поля вакансии из API (как ApiJobList.vue / VacancySheet.vue) ----------
    /// <summary>Готовая строка зарплаты API: «50 000 – 70 000 ₽ / мес. на руки».</summary>
    public string SalaryText { get; set; } = string.Empty;
    /// <summary>active | archived | …</summary>
    public string Status { get; set; } = "active";
    public bool IsArchived => Status == "archived";
    public bool IsActive => Status == "active";
    public List<VacancySection> OriginalSections { get; set; } = new();
    public List<string> Skills { get; set; } = new();
    public bool HasSkills => Skills.Count > 0;

    /// <summary>Фото только у демо-карточек; у вакансий API — заглушка с портфелем.</summary>
    public bool HasPhoto => !IsLive;
    public bool ShowSummary => !IsLive && !string.IsNullOrWhiteSpace(Summary);
    /// <summary>У вакансий API в строке каталога только тег формата.</summary>
    public bool ShowExperienceTag => !IsLive;

    public VacancyDuties Original { get; set; } = new();
    public VacancyPlain Plain { get; set; } = new();

    public string PhotoUrl => $"https://images.unsplash.com/photo-{Photo}?auto=format&fit=crop&w=480&q=70";
    /// <summary>Фото для карточек профессий (ringPhoto на сайте): без обрезки, крупнее.</summary>
    public string RingPhotoUrl => $"https://images.unsplash.com/photo-{Photo}?auto=format&w=1000&q=80";
    public string LargePhotoUrl => $"https://images.unsplash.com/photo-{Photo}?auto=format&fit=crop&w=1200&h=600&q=70";

    public string SalaryDisplay
    {
        get
        {
            if (!string.IsNullOrEmpty(SalaryText)) return SalaryText;
            if (Salary == null || Salary.Length < 2) return "Зарплата не указана";
            // С бэкенда может прийти только «от» или только «до» (0 = не указано)
            if (Salary[0] > 0 && Salary[1] > 0 && Salary[0] != Salary[1]) return $"{Salary[0]:N0} – {Salary[1]:N0} ₽".Replace(',', ' ');
            if (Salary[0] > 0) return $"от {Salary[0]:N0} ₽".Replace(',', ' ');
            if (Salary[1] > 0) return $"до {Salary[1]:N0} ₽".Replace(',', ' ');
            return "Зарплата не указана";
        }
    }

    public string SalaryShortDisplay
    {
        get
        {
            if (Salary == null || Salary.Length < 1) return "зарплата не указана";
            if (Salary[0] <= 0) return Salary.Length > 1 && Salary[1] > 0 ? $"до {Salary[1]:N0} ₽".Replace(',', ' ') : "зарплата не указана";
            return $"от {Salary[0]:N0} ₽".Replace(',', ' ');
        }
    }

    public string ExperienceTag => Experience == "Без опыта" ? "Без опыта" : $"Опыт {Experience.ToLower()}";
}
