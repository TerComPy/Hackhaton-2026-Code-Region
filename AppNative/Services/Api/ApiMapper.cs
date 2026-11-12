using System.Globalization;
using System.Text.Json;
using AppNative.Models;

namespace AppNative.Services.Api;

/// <summary>Перевод ответов бэкенда (snake_case) в модель приложения.</summary>
public static class ApiMapper
{
    // Фото по направлению у API нет — берём нейтральные фото из демо-каталога, стабильно по id.
    private static readonly string[] Photos =
    {
        "1757495152561-1f632725b271", "1747999827332-163aa33cd597", "1761234852472-85aeea9c3eac", "1758873272249-71e3d173f3b2", "1551288049-bebda4e38f71", "1758691737605-69a0e78bd193", "1761122827167-159d1d272313", "1766066014237-00645c74e9c6", "1781559818983-c32838ee3d55", "1580894732444-8ecded7900cd", "1760273380806-ebf70b968d3a", "1614935151651-0bea6508db6b", "1621905251189-08b45d6a269e", "1600565193348-f74bd3c7ccdf"
    };

    public static int ParseId(string? s) =>
        int.TryParse(s, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) ? id : 0;

    public static string Format(string? workFormat) => workFormat switch
    {
        "onsite" => "На месте",
        "remote" => "Удалённо",
        "hybrid" => "Гибрид",
        _ => "Формат не указан"
    };

    public static string? WorkFormatKey(string label) => label switch
    {
        "На месте" => "onsite",
        "Удалённо" => "remote",
        "Гибрид" => "hybrid",
        _ => null
    };

    private static string Employment(string? type) => type switch
    {
        "full_time" => "Полная занятость",
        "part_time" => "Частичная занятость",
        "internship" => "Стажировка",
        _ => "Занятость не указана"
    };

    public static string Experience(decimal? months)
    {
        if (months is null) return "Не указано";
        if (months.Value <= 0m) return "Без опыта";
        if (months.Value < 12m) return $"От {months.Value:0} мес.";
        var years = Math.Round(months.Value / 12m, 1);
        return "От " + years.ToString("0.#", CultureInfo.GetCultureInfo("ru-RU")) + " г.";
    }

    public static string Posted(string? publishedAt)
    {
        if (!DateTimeOffset.TryParse(publishedAt, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date))
            return string.Empty;
        var days = (int)(DateTimeOffset.Now.Date - date.ToLocalTime().Date).TotalDays;
        return days switch
        {
            <= 0 => "сегодня",
            1 => "вчера",
            < 5 => $"{days} дня назад",
            < 30 => $"{days} дн. назад",
            _ => date.ToLocalTime().ToString("d MMMM", CultureInfo.GetCultureInfo("ru-RU"))
        };
    }

    /// <summary>Строка каталога / избранного / подбора.</summary>
    public static Vacancy FromListItem(JsonElement e)
    {
        var id = ParseId(e.Str("id"));
        var min = e.Dec("salary_min");
        var max = e.Dec("salary_max");
        var currency = e.Str("currency");
        int[]? salary = null;
        if ((min.HasValue || max.HasValue) && (currency is null or "RUB"))
            salary = new[] { (int)(min ?? 0), (int)(max ?? 0) };

        var position = e.Str("typical_position") ?? e.Str("specialisation") ?? string.Empty;
        return new Vacancy
        {
            Id = id,
            Title = e.Str("title") ?? "Вакансия",
            Short = position,
            Company = e.Str("company_name") ?? "Компания не указана",
            City = e.Str("city") ?? e.Str("region_name") ?? "Город не указан",
            Format = Format(e.Str("work_format")),
            Experience = e.Str("experience_months_min") != null ? Experience(e.Dec("experience_months_min")) : Employment(e.Str("employment_type")),
            Salary = salary,
            Source = e.Str("source_name") ?? string.Empty,
            Posted = Posted(e.Str("published_at")),
            Summary = position,
            Url = e.Str("original_url") ?? string.Empty,
            Photo = Photos[Math.Abs(id) % Photos.Length]
        };
    }

    /// <summary>Полная карточка: /api/vacancies/{id} (+ пересказ ИИ, если готов).</summary>
    private static readonly Dictionary<string, string> Schedules = new()
    {
        ["five_two"] = "5/2", ["six_one"] = "6/1", ["shift"] = "Сменный",
        ["flexible"] = "Гибкий", ["other"] = "Другой", ["unknown"] = "Не указано"
    };

    /// <summary>
    /// Полная карточка /api/vacancies/{id} — как VacancySheet.vue в режиме API:
    /// оригинал по разделам «Обязанности / Требования (+ навыки) / Описание», факты + «График».
    /// </summary>
    public static Vacancy FromDetail(JsonElement vacancy, IEnumerable<JsonElement> skills)
    {
        var v = FromListItem(vacancy);
        v.IsLive = true;
        v.Experience = Experience(vacancy.Dec("experience_months_min"));
        v.Schedule = vacancy.Str("schedule_text") is { Length: > 0 } text
            ? text
            : Schedules.GetValueOrDefault(vacancy.Str("schedule_type") ?? "unknown", "Не указано");

        var reqs = Lines(vacancy.Str("requirements"));
        var skillLines = skills
            .Select(s => (s.Str("name") ?? "") + (s.Str("is_required") == "1" ? " · обязательный" : ""))
            .Where(s => s.Length > 0).ToList();
        if (skillLines.Count > 0) reqs.Add("Навыки: " + string.Join(", ", skillLines));

        v.Original = new VacancyDuties
        {
            Duties = Lines(vacancy.Str("responsibilities")),
            Requirements = reqs,
            Conditions = Lines(vacancy.Str("description"))
        };
        v.Plain = new VacancyPlain(); // заполняется пересказом ИИ
        return v;
    }

    public static AiSummaryState Summary(JsonElement root)
    {
        static List<string> List(JsonElement e, string name) =>
            e.Arr(name).Select(i => i.GetString() ?? "").Where(s => s.Trim().Length > 0).ToList();

        var state = new AiSummaryState { Status = root.Str("status") ?? "unavailable" };
        if (state.IsDone && root.Obj("summary") is { } s)
        {
            state.SimpleTitle = s.Str("simpleTitle") ?? string.Empty;
            state.WhatYouDo = List(s, "whatYouDo");
            state.Requirements = List(s, "requirements");
            state.Conditions = List(s, "conditions");
            state.BeginnerFriendly = s.Str("beginnerFriendly") == "true";
        }
        return state;
    }

    private static List<string> Lines(string? text) =>
        string.IsNullOrWhiteSpace(text)
            ? new List<string>()
            : text.Replace("\r", "").Split('\n')
                .Select(l => l.Trim().TrimStart('-', '•', '·', '*').Trim())
                .Where(l => l.Length > 0)
                .ToList();
}
