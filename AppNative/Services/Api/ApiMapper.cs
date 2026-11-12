using System.Globalization;
using System.Text.Json;
using AppNative.Models;

namespace AppNative.Services.Api;

/// <summary>Перевод ответов бэкенда (snake_case) в модель приложения.</summary>
public static class ApiMapper
{
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

    /// <summary>Опыт как на сайте: «Без опыта» / «От N мес.» / «Не указано».</summary>
    public static string Experience(decimal? months)
    {
        if (months is null) return "Не указано";
        if (months.Value <= 0m) return "Без опыта";
        return $"От {months.Value.ToString("0.##", CultureInfo.InvariantCulture)} мес.";
    }

    /// <summary>Дата публикации как в ApiJobList.vue: первые 10 символов (ГГГГ-ММ-ДД).</summary>
    public static string Posted(string? publishedAt) =>
        string.IsNullOrEmpty(publishedAt) ? string.Empty : publishedAt.Length >= 10 ? publishedAt[..10] : publishedAt;

    // vacancyDetails.ts → decimal(): «50000.00» → «50 000,00»
    private static string Money(string value)
    {
        var parts = value.Split('.');
        var integer = parts[0];
        var grouped = System.Text.RegularExpressions.Regex.Replace(integer, @"\B(?=(\d{3})+(?!\d))", " ");
        return grouped + (parts.Length > 1 && parts[1].Length > 0 ? "," + parts[1] : string.Empty);
    }

    private static readonly Dictionary<string, string> Periods = new()
    {
        ["month"] = "мес.", ["hour"] = "час", ["year"] = "год", ["day"] = "день", ["week"] = "нед."
    };

    /// <summary>vacancySalary() с сайта: вилка, валюта, период (если известен), «до налогов» / «на руки».</summary>
    public static string SalaryText(JsonElement e)
    {
        var low = e.Str("salary_min");
        var high = e.Str("salary_max");
        if (low is null && high is null) return "Зарплата не указана";
        var amount = low != null && high != null ? $"{Money(low)} – {Money(high)}"
            : low != null ? $"от {Money(low)}" : $"до {Money(high!)}";
        var currency = e.Str("currency");
        var cur = currency == "RUB" ? "₽" : currency ?? string.Empty;
        var period = e.Str("salary_period") is { } pr && Periods.TryGetValue(pr, out var label) ? " / " + label : string.Empty;
        var gross = e.Str("salary_gross") switch { "1" or "true" => " до налогов", "0" or "false" => " на руки", _ => string.Empty };
        return $"{amount} {cur}{period}{gross}";
    }

    /// <summary>Строка каталога / избранного / подбора (ApiJobList.vue).</summary>
    public static Vacancy FromListItem(JsonElement e)
    {
        var id = ParseId(e.Str("id"));
        var position = e.Str("typical_position") ?? e.Str("specialisation") ?? string.Empty;
        return new Vacancy
        {
            Id = id,
            IsLive = true,
            Title = e.Str("title") ?? "Вакансия",
            Short = position,
            Company = e.Str("company_name") ?? "Компания не указана",
            City = e.Str("city") ?? "Город не указан",
            Format = Format(e.Str("work_format")),
            Experience = Experience(e.Dec("experience_months_min")),
            SalaryText = SalaryText(e),
            Salary = e.Dec("salary_min") is { } mn ? new[] { (int)mn, (int)(e.Dec("salary_max") ?? 0) }
                   : e.Dec("salary_max") is { } mx ? new[] { 0, (int)mx } : null,
            Source = e.Str("source_name") ?? string.Empty,
            Posted = Posted(e.Str("published_at")),
            Status = e.Str("status") ?? "active",
            Url = e.Str("original_url") ?? string.Empty
        };
    }

    private static readonly Dictionary<string, string> Schedules = new()
    {
        ["five_two"] = "5/2", ["six_one"] = "6/1", ["shift"] = "Сменный",
        ["flexible"] = "Гибкий", ["other"] = "Другой", ["unknown"] = "Не указано"
    };

    /// <summary>
    /// Полная карточка /api/vacancies/{id} — как VacancySheet.vue в режиме API:
    /// разделы «Описание / Обязанности / Требования» (пустые скрыты), «Навыки», факт «График», статус.
    /// </summary>
    public static Vacancy FromDetail(JsonElement vacancy, IEnumerable<JsonElement> skills)
    {
        var v = FromListItem(vacancy);
        v.Schedule = vacancy.Str("schedule_text") is { Length: > 0 } text
            ? text
            : Schedules.GetValueOrDefault(vacancy.Str("schedule_type") ?? "unknown", "Не указано");

        v.OriginalSections = new[]
            {
                new VacancySection("Описание", vacancy.Str("description") ?? string.Empty),
                new VacancySection("Обязанности", vacancy.Str("responsibilities") ?? string.Empty),
                new VacancySection("Требования", vacancy.Str("requirements") ?? string.Empty)
            }
            .Where(sec => sec.Text.Trim().Length > 0)
            .ToList();
        v.Skills = skills
            .Select(sk => (sk.Str("name") ?? "") + (sk.Str("is_required") is "1" or "true" ? " · обязательный" : ""))
            .Where(sk => sk.Length > 0)
            .ToList();
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


}
