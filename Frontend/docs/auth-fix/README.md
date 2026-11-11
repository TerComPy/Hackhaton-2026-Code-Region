# Проверка исправлений Auth

- Причина переполнения: min-height: 656px у карточки плюс шапка и отступы. До исправления при viewport 1366×650: scrollHeight 752, clientHeight 650, низ карточки 736.
- Layout: header + minmax(0, 1fr); карточка без min-height; SVG масштабируется. Overflow не скрывается. Поле имени удаляется из DOM при входе; формы выровнены сверху.
- Playwright: четыре desktop-размера, обе темы, оба режима, ошибки валидации; scroll по обеим осям 0, геометрия карточки и панелей стабильна. Дополнительно viewport 1366×650.
- 1366×768: innerHeight / scrollHeight / clientHeight = 768 / 768 / 768; низ карточки 752.640625; зазор перед первым полем 12 px.
- Пользовательский Vivaldi с панелями, обе темы и формы: viewport 1367×651, innerHeight / scrollHeight / clientHeight = 651 / 651 / 651; scrollX 0. Карточка: x=103.5, y=77.015625, width=1160, height=560.96875, bottom=637.984375; зазор 10 px. Header y=0, h=64; main y=64, h=587; обе панели h=558.96875. Временный код измерений удалён.
- Typecheck и build успешны; полный smoke-прогон через msedge: 42 passed.

[Регистрация 1366×768](register-1366x768.png) · [Вход 1366×768](login-1366x768.png)
