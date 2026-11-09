# Заголовки HTTP

[Оглавление](README.md)

Имена заголовков нечувствительны к регистру: `MCP-Protocol-Version` и `Mcp-Protocol-Version` — один и тот же заголовок. Значения чувствительны к регистру.

Протокол копирует в заголовки только те поля, по которым прокси может принять решение, не разбирая JSON. Ответ инструмента в заголовки не выносится.

Обычные поля HTTP (`Host`, `Content-Length`, `Connection`, `Date`) в таблицах нет: их ставит транспорт, и MCP им смысла не назначает.

## Запрос: клиент → сервер

| Заголовок | Пример | Когда ставится | Откуда значение | `2026-07-28` | `2025-11-25` |
| --- | --- | --- | --- | --- | --- |
| `MCP-Protocol-Version` | `MCP-Protocol-Version: 2026-07-28` | Каждый POST | Версия протокола. В `2026-07-28` обязана совпасть с `_meta["io.modelcontextprotocol/protocolVersion"]` | Обязателен | Обязателен после `initialize`. До него клиент его не шлёт |
| `Mcp-Method` | `Mcp-Method: tools/call` | Каждый JSON-RPC-запрос | Поле `method` | Обязателен | Нет такого заголовка |
| `Mcp-Name` | `Mcp-Name: get_weather` | Вызовы, у которых есть имя или адрес объекта | См. таблицу ниже | Обязателен для перечисленных методов | Нет такого заголовка |
| `Mcp-Param-{Name}` | `Mcp-Param-Region: us-west1` | `tools/call`, и только для аргумента с `x-mcp-header` | Копия значения аргумента. `{Name}` берётся из схемы, а не из имени поля | Если аргумент передан и схема его помечает. Нет аргумента или значение `null` — заголовка нет | Нет такого заголовка |
| `Accept` | `Accept: application/json, text/event-stream` | Каждый POST | Клиент перечисляет оба типа | Обязателен | Обязателен |
| `Content-Type` | `Content-Type: application/json` | POST с телом | Тип тела запроса | Обязателен | Обязателен |
| `Authorization` | `Authorization: Bearer eyJhbGciOiJIUzI1NiIs...` | Каждый запрос, если на сервере включена авторизация MCP | `Bearer` и access token. Токен в URL запрещён | Необязательная часть спецификации | То же правило |
| `Origin` | `Origin: https://app.example.com` | Браузерный клиент | Origin страницы. Сервер отклоняет чужой origin с HTTP `403` | Проверяется, если заголовок есть | То же правило |
| `Mcp-Session-Id` | `Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c` | Запросы после `initialize`, если сервер выдал сессию | Непрозрачный идентификатор из ответа `initialize` | Сервер игнорирует и сам не выдаёт | Необязателен: сервер может сессию не создавать |
| `Last-Event-ID` | `Last-Event-ID: 42` | Повторный `GET /mcp`, чтобы продолжить оборванный SSE | Идентификатор последнего полученного SSE-события | Сервер игнорирует. Поток не восстанавливается | Только в профиле, где `GET` разрешён |

`Mcp-Name` заполняется так:

| Метод | Поле тела | Пример |
| --- | --- | --- |
| `tools/call` | `params.name` | `Mcp-Name: get_weather` |
| `prompts/get` | `params.name` | `Mcp-Name: review` |
| `resources/read` | `params.uri` | `Mcp-Name: file:///project/readme.md` |
| `tasks/get`, `tasks/update`, `tasks/cancel` | `params.taskId` | `Mcp-Name: 786512e2-9e0d-44bd-8f29-789f320fe840` |

Последняя строка относится к расширению tasks, а не к базовому протоколу. `server/discover`, `tools/list` и остальные методы без имени объекта заголовок `Mcp-Name` не получают.

Если значение `Mcp-Name` или `Mcp-Param-{Name}` нельзя безопасно положить в HTTP (не ASCII, управляющие символы, пробелы по краям либо сама строка выглядит как `=?base64?...?=`), клиент кодирует UTF-8 в Base64. Для текста `Hello, 世界` заголовок выглядит так:

```text
Mcp-Param-Greeting: =?base64?SGVsbG8sIOS4lueVjA==?=
```

Префикс `=?base64?` и суффикс `?=` обязательны в нижнем регистре. Сервер декодирует значение до сверки с телом.

Расхождение заголовка и тела, отсутствующий обязательный заголовок или неверные символы дают HTTP `400` и JSON-RPC `-32020` (`HeaderMismatch`).

## Ответ: сервер → клиент

| Заголовок | Пример | Когда ставится | Что содержит | `2026-07-28` | `2025-11-25` |
| --- | --- | --- | --- | --- | --- |
| `Content-Type` | `Content-Type: application/json` | Ответ на JSON-RPC-запрос | `application/json` для одного объекта либо `text/event-stream` для SSE на том же POST | Обязателен. У принятого уведомления тела нет, ответ `202` | То же для POST. Отдельный поток `GET` тоже отвечает `text/event-stream` |
| `X-Accel-Buffering` | `X-Accel-Buffering: no` | Ответ SSE | Прокси не должен копить события | Рекомендуется | Рекомендуется |
| `Mcp-Session-Id` | `Mcp-Session-Id: 1f3a4b5c-6d7e-8f9a-0b1c-2d3e4f5a6b7c` | Ответ `initialize`, если сервер решил вести сессию | Непрозрачный идентификатор. Клиент возвращает его в следующих запросах | Не выдаётся | Необязателен |
| `WWW-Authenticate` | `WWW-Authenticate: Bearer scope="files:read"` | HTTP `401`, если включена авторизация | Challenge `Bearer`, в том числе `resource_metadata` и `scope` | Только при авторизации | То же правило |

На ответе нет `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` и `Mcp-Param-*`. Результат, прогресс и `input_required` приходят в теле JSON или в событиях SSE.

Строка SSE `id:` — не HTTP-заголовок. В `2025-11-25` её значение потом уходит в `Last-Event-ID`. В `2026-07-28` идентификаторы событий не используются.

## Какие имена зарезервированы

Спецификация закрепляет имена за протоколом. Их нельзя занимать своим смыслом.

Закреплённые имена:

- `MCP-Protocol-Version`
- `Mcp-Method`
- `Mcp-Name`
- `Mcp-Session-Id` — имя остаётся за протоколом и в `2026-07-28`, хотя сессии больше нет
- `Last-Event-ID` — имя из SSE; в MCP оно означает продолжение потока и только для `2025-11-25`

Закреплённый префикс:

- `Mcp-Param-`. Часть после префикса задаёт только `x-mcp-header` в `inputSchema` инструмента. Свой `Mcp-Param-Tenant` или `Mcp-Param-Dzo` без этой пометки ставить нельзя. Прокси, который конкретный `Mcp-Param-*` не понимает, обязан переслать его дальше и не отбрасывать.

Других имён с префиксом `Mcp-` спецификация не задаёт. Новый заголовок `Mcp-*` вводить не следует: сверка с телом и правила прокси описаны только для имён из таблиц выше.

`Authorization` и `WWW-Authenticate` зарезервированы спецификацией авторизации MCP, когда она включена. Это обычные заголовки OAuth, а не семейство `Mcp-*`.

В текущем профиле на запросе остаются `MCP-Protocol-Version`, `Mcp-Method`, для `tools/call` ещё `Mcp-Name`, а также `Accept` и `Content-Type`. `Mcp-Param-*`, `Mcp-Session-Id`, `Last-Event-ID` и заголовки авторизации профиль не использует.

Источник: [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http), [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), транспорт [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).
