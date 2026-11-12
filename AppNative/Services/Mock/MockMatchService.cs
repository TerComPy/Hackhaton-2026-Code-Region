using System.Text.RegularExpressions;
using AppNative.Models;

namespace AppNative.Services.Mock;

public class MockMatchService : IMatchService
{
    private const string AboutPrefKey = "starter.about";

    private readonly IVacancyService _vacancyService;
    private static readonly Dictionary<string, Direction> DirectionsMap = new()
    {
        ["it"] = new Direction
        {
            Key = "it",
            Name = "Веб-разработка",
            What = "Создавать сайты и приложения: то, что человек видит на экране и нажимает.",
            Why = "Во фронтенде берут по учебным проектам — диплом и стаж здесь важны меньше, чем умение показать работающий результат.",
            Start = "Начните с бесплатного курса по HTML и CSS и сделайте одну страницу для себя.",
            Signals = new()
            {
                (@"программ|кодить|(?<![а-я])код|написал[аи]? бота", "интерес к программированию"),
                (@"сайт|верст|html|css|javascript|react|фронтенд|frontend", "веб-технологии"),
                (@"компьютер|ноутбук|(?<![а-я])пк(?![а-я])|гаджет", "любите компьютеры"),
                (@"(?<![а-я])игр[ыауео]", "интерес к играм")
            }
        },
        ["qa"] = new Direction
        {
            Key = "qa",
            Name = "Тестирование",
            What = "Проверять приложения до того, как их увидят пользователи, и находить ошибки.",
            Why = "Тестировщику важнее внимательность и упорство, чем умение программировать, — поэтому сюда часто приходят без технического образования.",
            Start = "Попробуйте найти три ошибки в любом приложении и описать их так, чтобы их можно было повторить.",
            Signals = new()
            {
                (@"вниматель|дотошн|мелоч|замечаю", "внимательность к деталям"),
                (@"ошибк|(?<![а-я])баг|провер|тестир", "любите находить ошибки"),
                (@"приложени|смартфон|телефон[еу]? (всё|все)", "интерес к приложениям")
            }
        },
        ["data"] = new Direction
        {
            Key = "data",
            Name = "Аналитика данных",
            What = "Находить ответы в цифрах: строить таблицы и графики, объяснять, что происходит с бизнесом.",
            Why = "Если вам нравится, когда цифры складываются в понятную картину, аналитика превращает это в профессию. Excel — уже половина входного билета.",
            Start = "Освойте сводные таблицы в Excel и базовый SQL — это требуют почти во всех вакансиях для новичков.",
            Signals = new()
            {
                (@"цифр|числ|математ|статист|считать|считаю", "любите цифры"),
                (@"таблиц|excel|эксель", "работа с таблицами"),
                (@"анализ|аналит|закономерн|логик", "аналитический склад ума"),
                (@"эконом|финанс|бухгалт", "экономическое образование")
            }
        },
        ["design"] = new Direction
        {
            Key = "design",
            Name = "Дизайн интерфейсов",
            What = "Продумывать, как выглядят и работают экраны приложений и сайтов.",
            Why = "Интерфейсный дизайн — это сочетание вкуса и логики: важно не только красиво нарисовать, но и понять, где человек запутается.",
            Start = "Перерисуйте в Figma экран приложения, которым пользуетесь каждый день, и улучшите одну неудобную деталь.",
            Signals = new()
            {
                (@"рису|иллюстр|скетч", "рисование"),
                (@"дизайн|figma|фигм|макет|интерфейс", "интерес к дизайну"),
                (@"красив|визуал|цвет|эстет|фотошоп|photoshop", "визуальный вкус"),
                (@"творч|креатив", "творческий склад")
            }
        },
        ["marketing"] = new Direction
        {
            Key = "marketing",
            Name = "Контент и соцсети",
            What = "Вести соцсети компаний: придумывать посты, снимать короткие видео, следить за откликом аудитории.",
            Why = "Если вы и так ведёте блог или снимаете для себя, у вас уже есть портфолио — с ним проще всего прийти в SMM.",
            Start = "Соберите три лучших поста или видео в одну подборку: это и будет ваше первое портфолио.",
            Signals = new()
            {
                (@"соцсет|инстаграм|тикток|telegram|телеграм|блог|вконтакт|\bvk\b", "соцсети"),
                (@"текст|писать|пишу|статьи|сторис", "любите писать"),
                (@"фото|видео|снима|монтаж|камер", "фото и видео"),
                (@"идеи|придумыва", "генерируете идеи")
            }
        },
        ["service"] = new Direction
        {
            Key = "service",
            Name = "Сервис и работа с людьми",
            What = "Помогать людям вживую или по телефону: в кофейне, магазине, службе поддержки.",
            Why = "В сервисе главное — характер: остальному учат на месте за пару недель. Часто есть короткие смены, которые удобно совмещать с учёбой.",
            Start = "Ищите вакансии с пометкой «обучение» — их много, и опыт там не нужен.",
            Signals = new()
            {
                (@"общат|общени|общаюсь|общительн|разговарива|болтать", "любите общаться"),
                (@"людьми|с людьми|люд(ям|ей)", "работа с людьми"),
                (@"кофе|кафе|официант|бариста|(?<![а-я])бар(?![а-я])|гост", "опыт в гостеприимстве"),
                (@"гибк|подработ|совмещ", "нужен гибкий график"),
                (@"звонк|клиент|продаж", "работа с клиентами")
            }
        },
        ["food"] = new Direction
        {
            Key = "food",
            Name = "Кухня и рестораны",
            What = "Готовить в ресторанах, кафе и пекарнях — от заготовок до авторских блюд.",
            Why = "Поварское дело быстро даёт видимый результат, а хорошие кухни охотно учат тех, кто любит готовить и выдерживает темп.",
            Start = "Начните с позиции помощника повара или заготовщика — так проще всего попасть на сильную кухню.",
            Signals = new()
            {
                (@"готовить|готовлю|кулинар|кухн|выпечк|печь пиро|рецепт", "любите готовить"),
                (@"ресторан|кафе|пекарн", "интерес к ресторанам"),
                (@"темп|на ногах|динамичн|быстро", "не боитесь высокого темпа")
            }
        },
        ["care"] = new Direction
        {
            Key = "care",
            Name = "Медицина и забота",
            What = "Ухаживать за людьми, помогать врачам, работать в больницах и клиниках.",
            Why = "Медицина — одна из немногих сфер, где выпускников колледжа ждут с наставником и стабильной зарплатой.",
            Start = "Если диплома ещё нет, посмотрите программы медколледжей — многие берут после 9 или 11 класса.",
            Signals = new()
            {
                (@"помога|помощь|забот", "хотите помогать"),
                (@"медиц|врач|больниц|здоров|биолог|анатом|медколледж", "интерес к медицине"),
                (@"ответствен|спокойн|стрессоуст", "ответственность"),
                (@"людьми|с людьми|люд(ям|ей)", "работа с людьми")
            }
        },
        ["education"] = new Direction
        {
            Key = "education",
            Name = "Образование",
            What = "Учить детей и взрослых: в школе, на курсах, как репетитор.",
            Why = "Если вам нравится объяснять и видеть, как у человека «щёлкнуло», — это и есть главное качество педагога.",
            Start = "Попробуйте позаниматься со школьником как репетитор — станет понятно, ваше ли это.",
            Signals = new()
            {
                (@"объясня|учить друг|обуча|преподав|репетитор|наставн", "любите объяснять"),
                (@"дет(и|ей|ьми)|школьник|вожат|лагер", "опыт с детьми"),
                (@"педагог|учител", "интерес к педагогике"),
                (@"терпелив|терпени", "терпение")
            }
        },
        ["tech"] = new Direction
        {
            Key = "tech",
            Name = "Техника и производство",
            What = "Работать с оборудованием и материалами: станки, электромонтаж, сборка, ремонт.",
            Why = "Рабочим специальностям не хватает людей, поэтому заводы и подрядчики сами учат новичков и платят за обучение.",
            Start = "Ищите вакансии с пометкой «ученик» — на них берут без опыта и платят с первого дня.",
            Signals = new()
            {
                (@"техник|механ|станк|завод|производств|инженер|чертеж|черчени", "интерес к технике"),
                (@"руками|чинить|ремонт|собирать|разбирать|паять|пайк", "любите работать руками"),
                (@"электр|провод|розетк", "электрика"),
                (@"колледж|техникум|(?<![а-я])спо(?![а-я])", "среднее профобразование"),
                (@"физик", "физика")
            }
        },
        ["logistics"] = new Direction
        {
            Key = "logistics",
            Name = "Склад и логистика",
            What = "Принимать, хранить и отправлять товары: склады, доставка, распределительные центры.",
            Why = "Логистика ценит организованность. Можно начать со склада без опыта и вырасти до старшего смены или логиста.",
            Start = "Обратите внимание на вакансии с еженедельными выплатами и выбором графика.",
            Signals = new()
            {
                (@"склад|логист|достав|курьер|груз|коробк", "склад и логистика"),
                (@"физическ|спорт|актив", "физическая активность"),
                (@"порядок|порядк|организов|систематиз", "любите порядок"),
                (@"водител|(?<![а-я])права(?![а-я])|машин[аеуы]", "водительские права")
            }
        },
        ["science"] = new Direction
        {
            Key = "science",
            Name = "Лаборатория и наука",
            What = "Проводить анализы и эксперименты: качество воды, продуктов, лекарств.",
            Why = "Лаборант — спокойная работа с понятными правилами, где аккуратность ценится больше скорости.",
            Start = "Посмотрите вакансии лаборантов на предприятиях вашего города: их часто открывают для выпускников.",
            Signals = new()
            {
                (@"хими|биолог|лаборат|эксперимент|пробирк|микроскоп", "интерес к науке"),
                (@"аккурат|точност|педант", "аккуратность"),
                (@"исследова|изуча|разобраться|любопыт", "любознательность")
            }
        }
    };

    public event EventHandler? MatchUpdated;
    public string SavedAboutText => Preferences.Default.Get(AboutPrefKey, string.Empty);
    public MatchResult? CurrentResult { get; private set; }
    public HashSet<string> FitDirectionKeys => CurrentResult != null
        ? CurrentResult.Directions.Select(d => d.Key).ToHashSet()
        : new HashSet<string>();

    public MockMatchService(IVacancyService vacancyService)
    {
        _vacancyService = vacancyService;
        var saved = SavedAboutText;
        if (!string.IsNullOrWhiteSpace(saved))
        {
            _ = AnalyzeAsync(saved);
        }
    }

    private static string Normalize(string text) => text.ToLower().Replace('ё', 'е');

    private static string FragmentAround(string text, int index)
    {
        var stops = new[] { '.', '!', '?', ';', '\n', ',', '—' };
        int start = index;
        int end = index;

        while (start > 0 && !stops.Contains(text[start - 1])) start--;
        while (end < text.Length && !stops.Contains(text[end])) end++;

        string frag = text[start..end].Trim();
        frag = Regex.Replace(frag, @"\s+", " ");

        if (frag.Length > 64)
        {
            int rel = index - start;
            int from = Math.Max(0, rel - 28);
            frag = (from > 0 ? "…" : "") + frag.Substring(from, Math.Min(60, frag.Length - from)).Trim() + "…";
        }

        if (string.IsNullOrEmpty(frag)) return string.Empty;
        return char.ToLower(frag[0]) + frag[1..];
    }

    public async Task<MatchResult> AnalyzeAsync(string aboutText)
    {
        Preferences.Default.Set(AboutPrefKey, aboutText);

        string lower = Normalize(aboutText);
        var traits = new Dictionary<string, string>();

        var scored = new List<(string Key, Direction Direction, List<(string Label, string Quote)> Hits, double Score)>();

        foreach (var (key, dir) in DirectionsMap)
        {
            var hits = new List<(string Label, string Quote)>();
            foreach (var (pat, label) in dir.Signals)
            {
                var match = Regex.Match(lower, pat);
                if (match.Success)
                {
                    string quote = FragmentAround(aboutText, match.Index);
                    hits.Add((label, quote));
                    if (!traits.ContainsKey(label)) traits[label] = quote;
                }
            }
            scored.Add((key, dir, hits, hits.Count));
        }

        bool wantsRemote = Regex.IsMatch(lower, @"удален|удалён|из дома|дистанц|онлайн");
        if (wantsRemote)
        {
            var m = Regex.Match(lower, @"удален|удалён|из дома|дистанц|онлайн");
            traits["хотите работать удалённо"] = FragmentAround(aboutText, m.Index);
        }

        bool wantsNoExp = Regex.IsMatch(lower, @"без опыта|нет опыта|не работал|первая работа|первую работу|школьник|студент|учусь|\d+ класс");
        if (wantsNoExp)
        {
            var m = Regex.Match(lower, @"без опыта|нет опыта|не работал|первая работа|первую работу|школьник|студент|учусь|\d+ класс");
            traits["ищете первую работу"] = FragmentAround(aboutText, m.Index);
        }

        var allVacancies = await _vacancyService.GetVacanciesAsync();

        // Bonus for format & experience matches
        for (int i = 0; i < scored.Count; i++)
        {
            var item = scored[i];
            var dirJobs = allVacancies.Where(j => j.Direction == item.Key).ToList();
            double bonus = 0;
            if (wantsRemote && dirJobs.Any(j => j.Format == "Удалённо")) bonus += 0.5;
            if (wantsNoExp && dirJobs.Any(j => j.Experience == "Без опыта")) bonus += 0.3;

            scored[i] = (item.Key, item.Direction, item.Hits, item.Score + bonus);
        }

        scored.Sort((a, b) => b.Score.CompareTo(a.Score));

        var picked = scored.Where(s => s.Hits.Count > 0).Take(3).ToList();
        var fallbackKeys = new[] { "service", "logistics", "qa" };
        foreach (var fk in fallbackKeys)
        {
            if (picked.Count < 3)
            {
                var fItem = scored.FirstOrDefault(s => s.Key == fk);
                if (fItem.Direction != null && !picked.Any(p => p.Key == fk))
                {
                    picked.Add(fItem);
                }
            }
        }

        var matchedDirections = new List<MatchedDirection>();
        foreach (var item in picked)
        {
            var quotes = item.Hits.Select(h => h.Quote).Distinct().Take(2).ToList();
            string fit = item.Hits.Count >= 3 ? "Сильное совпадение" :
                         item.Hits.Count == 2 ? "Хорошее совпадение" :
                         item.Hits.Count == 1 ? "Есть пересечения" : "Можно начать без опыта";

            string reason = quotes.Count > 0
                ? $"Вы написали {string.Join(" и ", quotes.Select(q => $"«{q}»"))}. {item.Direction.Why}"
                : $"В вашем рассказе нет прямых зацепок за это направление, но здесь легко начать без опыта. {item.Direction.Why}";

            var dirJobs = allVacancies.Where(j => j.Direction == item.Key).ToList();
            dirJobs.Sort((a, b) =>
            {
                int remA = wantsRemote && a.Format == "Удалённо" ? 1 : 0;
                int remB = wantsRemote && b.Format == "Удалённо" ? 1 : 0;
                if (remA != remB) return remB.CompareTo(remA);

                int expA = wantsNoExp && a.Experience == "Без опыта" ? 1 : 0;
                int expB = wantsNoExp && b.Experience == "Без опыта" ? 1 : 0;
                return expB.CompareTo(expA);
            });

            matchedDirections.Add(new MatchedDirection
            {
                Key = item.Key,
                Name = item.Direction.Name,
                What = item.Direction.What,
                Why = item.Direction.Why,
                Start = item.Direction.Start,
                Fit = fit,
                Reason = reason,
                Strength = item.Hits.Count,
                Jobs = dirJobs
            });
        }

        var result = new MatchResult
        {
            Traits = traits.Select(kv => new MatchTrait { Label = kv.Key, Quote = kv.Value }).ToList(),
            Directions = matchedDirections,
            WantsRemote = wantsRemote,
            WantsNoExp = wantsNoExp
        };

        CurrentResult = result;
        MatchUpdated?.Invoke(this, EventArgs.Empty);
        return result;
    }
}
