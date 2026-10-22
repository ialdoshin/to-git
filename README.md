# Вариант V1 — ограниченный профиль MCP 2025-11-25

> В V1 `GET /mcp` запрещён. Вариант с разрешённым GET, reconnect и учётом
> таймаутов описан в [V2](V2.md).

## Назначение

Документ описывает требования к интеграции:

```text
Сервис 1 → Сервис 2 → SOWA → Сервис 4
```

- **Сервис 1** — MCP-клиент.
- **Сервис 2** — policy-прокси: проверяет методы, права, tool allowlist и ответы сервера.
- **SOWA** — JSON Schema gateway: валидирует тело каждого разрешённого JSON-запроса.
- **Сервис 4** — MCP-сервер версии `2025-11-25`.

Разрешены только lifecycle MCP, обычный `tools/call` и `notifications/progress`.

## Транспортный профиль

- Транспорт: Streamable HTTP.
- Endpoint: один фиксированный путь, например `/mcp`.
- `POST /mcp` разрешён.
- `DELETE /mcp` может быть разрешён только для завершения сессии.
- `GET /mcp` запрещён из-за таймаутов прокси.
- Постоянный SSE-канал сервер → клиент запрещён.
- Возобновление через `Last-Event-ID` запрещено.
- Сервер может ответить на `tools/call`:
  - одним `application/json`;
  - конечным `text/event-stream` на том же POST.
- SSE должен завершиться финальным JSON-RPC `result` или `error` в пределах таймаута прокси.
- При обрыве до финального ответа результат считается `MCP_RESULT_UNKNOWN`.
- Автоматический повтор `tools/call` запрещён.

## Разрешённые MCP-сообщения

### InitializeRequest

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": {
      "name": "service-1",
      "version": "1.0.0"
    }
  }
}
```

Клиентские capabilities должны быть пустыми. Клиент не объявляет `roots`, `sampling`,
`elicitation`, `tasks` или `experimental`.

Допустимый ответ сервера:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    },
    "serverInfo": {
      "name": "service-4",
      "version": "1.0.0"
    }
  }
}
```

Сервер не объявляет `resources`, `prompts`, `logging`, `completions`, `tasks` или
`experimental`.

### InitializedNotification

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

Уведомление не содержит `id`. Ожидаемый HTTP-ответ — `202 Accepted` без тела.

### CallToolRequest

```json
{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "_meta": {
      "progressToken": "progress-17"
    }
  }
}
```

Ограничения:

- `params.name` входит в согласованный allowlist;
- `params.arguments` соответствует схеме конкретного инструмента;
- `params.task` запрещён;
- в `_meta` разрешён только `progressToken`;
- `progressToken` является строкой или числом.

### Полный HTTP-пример tools/call

Один и тот же запрос может получить обычный JSON-ответ или конечный SSE-ответ:

```http
POST /mcp HTTP/1.1
Host: mcp.example.internal
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25
MCP-Session-Id: session-123

{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "_meta": {
      "progressToken": "progress-17"
    }
  }
}
```

`MCP-Session-Id` передаётся только в том случае, если сервис 4 выдал его при
инициализации.

#### Вариант 1: обычный JSON-ответ

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 17,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "В Варшаве +12 °C"
      }
    ],
    "isError": false
  }
}
```

HTTP-запрос завершается сразу после получения полного JSON. Поле `id` должно совпадать
с `id` исходного `tools/call`.

#### Вариант 2: SSE-ответ на том же POST

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"progress-17","progress":50,"total":100,"message":"Выполнение"}}

data: {"jsonrpc":"2.0","id":17,"result":{"content":[{"type":"text","text":"В Варшаве +12 °C"}],"isError":false}}

```

Это поток ответа на исходный `POST /mcp`: клиент не делает дополнительный GET. После
финального `result` или `error` сервис 4 закрывает HTTP response stream. В V1 reconnect
и `Last-Event-ID` запрещены; при обрыве до финального события результат считается
`MCP_RESULT_UNKNOWN`.

### ProgressNotification

Progress разрешён только внутри SSE-ответа на тот же `tools/call`:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "progress-17",
    "progress": 50,
    "total": 100,
    "message": "Выполнение"
  }
}
```

Требования:

- исходный `tools/call` содержал такой же `progressToken`;
- `id` отсутствует;
- `progress` является числом и не уменьшается;
- `total` и `message` опциональны;
- после финального `result` или `error` progress запрещён.

## HTTP-заголовки

Для POST обязательны:

```http
Content-Type: application/json
Accept: application/json, text/event-stream
```

После `initialize` обязателен:

```http
MCP-Protocol-Version: 2025-11-25
```

Если сервис 4 выдал сессию, обязателен:

```http
MCP-Session-Id: session-123
```

Сервис 2 удаляет недоверенные пользовательские значения и самостоятельно устанавливает:

```http
X-User-Id
X-Tenant-Id
X-Request-Id
Authorization
```

`MCP-Protocol-Version` и `MCP-Session-Id` проходят через сервис 2 и SOWA без изменения.

## Требования к сервису 1

Сервис 1 должен:

1. Отправлять `initialize` с версией `2025-11-25` и пустыми capabilities.
2. Проверять версию и capabilities сервера.
3. Сохранять `MCP-Session-Id`, если он выдан.
4. Отправлять `notifications/initialized` до первого `tools/call`.
5. Передавать protocol version и session id в следующих запросах.
6. Принимать JSON или конечный SSE на том же POST.
7. Сопоставлять финальный ответ с исходным JSON-RPC `id`.
8. Принимать progress только с ожидаемым token.
9. Не открывать `GET /mcp`.
10. Не выполнять автоматический повтор после обрыва.

## Требования к сервису 2

### Проверка запроса

Сервис 2 должен:

1. Разрешать только `POST /mcp` и опционально `DELETE /mcp`.
2. Блокировать `GET`, `PUT`, `PATCH` и остальные HTTP-методы.
3. Проверять `Content-Type`, `Accept`, protocol version и session id.
4. Запрещать JSON-RPC batch.
5. Разрешать только:
   - `initialize`;
   - `notifications/initialized`;
   - `tools/call`.
6. Проверять tool allowlist и права пользователя.
7. Запрещать `params.task`.
8. Передавать запрос в SOWA для JSON Schema-валидации.

### Проверка ответа

Сервис 2 должен:

1. Разрешать только `application/json` и `text/event-stream`.
2. Проверять совпадение финального `id` с исходным запросом.
3. Разрешать ровно одно из `result` или `error`.
4. Запрещать task handle в ответе.
5. Потоково разбирать SSE без буферизации.
6. Разрешать внутри SSE только:
   - `notifications/progress`;
   - финальный `result` или `error`.
7. Блокировать любой server-to-client request.
8. Ограничивать длительность, размер ответа и число SSE-событий.

При N репликах без общего хранилища сервис 2 выполняет синтаксическую и policy-проверку.
Существование MCP-сессии проверяет сервис 4. Корреляция progress и результата хранится
только в контексте одного открытого POST.

## Требования к SOWA

SOWA валидирует каждый разрешённый POST request по JSON Schema.

Поскольку URL и HTTP-метод одинаковы, корневая схема должна содержать `oneOf` из трёх
взаимоисключающих веток:

1. `InitializeRequest`:
   - `method` строго `initialize`;
   - `id` присутствует;
   - protocol version строго `2025-11-25`;
   - capabilities — пустой объект.
2. `InitializedNotification`:
   - `method` строго `notifications/initialized`;
   - `id` отсутствует;
   - params отсутствует либо соответствует утверждённой пустой форме.
3. `CallToolRequest`:
   - `method` строго `tools/call`;
   - `id` присутствует;
   - `name` входит в allowlist;
   - `arguments` соответствует схеме инструмента;
   - `task` отсутствует;
   - в `_meta` разрешён только `progressToken`.

Для каждого инструмента используется отдельная ветка схемы `arguments`, выбранная по
`params.name`.

SOWA должна:

- запрещать JSON-RPC batch и неизвестные методы;
- ограничивать размер, глубину JSON, длины строк и число свойств;
- не изменять `jsonrpc`, `id`, `method`, `params` и `arguments`;
- не изменять protocol version и session id;
- блокировать `GET /mcp`;
- передавать response SSE потоково, без накопления полного ответа;
- не применять request JSON Schema к `text/event-stream` response.

`DELETE /mcp` не содержит JSON body и проверяется HTTP-policy отдельно.

## Требования к сервису 4

Сервис 4 должен:

1. Реализовать MCP `2025-11-25`.
2. Объявлять только capability `tools` с `listChanged: false`.
3. Принимать только согласованные имена инструментов.
4. Валидировать arguments и права повторно на доверенной стороне.
5. Не требовать task-augmented execution.
6. Возвращать JSON или конечный SSE на том же POST.
7. Завершать SSE финальным `result` или `error` до таймаута прокси.
8. Отправлять progress только при наличии `progressToken`.
9. Не инициировать `sampling`, `elicitation`, `roots` или другие запросы клиенту.
10. Возвращать HTTP 404 для неизвестного или просроченного session id.
11. Поддерживать DELETE сессии либо очищать сессии по TTL.

## Запрещённые методы и возможности

- `tools/list`;
- `notifications/tools/list_changed`;
- `resources/list`;
- `resources/templates/list`;
- `resources/read`;
- `resources/subscribe`;
- `resources/unsubscribe`;
- `notifications/resources/list_changed`;
- `notifications/resources/updated`;
- `prompts/list`;
- `prompts/get`;
- `notifications/prompts/list_changed`;
- `completion/complete`;
- `sampling/createMessage`;
- `elicitation/create`;
- `notifications/elicitation/complete`;
- `roots/list`;
- `notifications/roots/list_changed`;
- `logging/setLevel`;
- `notifications/message`;
- `tasks/get`;
- `tasks/result`;
- `tasks/list`;
- `tasks/cancel`;
- `notifications/tasks/status`;
- `notifications/cancelled`;
- `ping`;
- все experimental capabilities;
- все vendor-specific методы;
- JSON-RPC batch;
- `GET /mcp`;
- `Last-Event-ID`;
- task-augmented `tools/call`.

## Ошибки

- HTTP 405 — запрещённый HTTP-метод.
- HTTP 403 — запрещённый MCP method, tool или недостаточные права.
- HTTP 400 — request не соответствует JSON Schema.
- HTTP 413 — превышен размер тела.
- HTTP 415 — неверный `Content-Type`.
- JSON-RPC `-32600` — неверная структура запроса.
- JSON-RPC `-32602` — неверные параметры.
- HTTP 504 / `MCP_RESULT_UNKNOWN` — таймаут или обрыв после отправки `tools/call`.

## Таймауты

Должно выполняться:

```text
таймаут сервиса 1
  > таймаут сервиса 2
    > таймаут SOWA
      > максимальное время инструмента сервиса 4
```

SSE keep-alive не отменяет абсолютный timeout прокси.

## Sequence-диаграммы

- [Инициализация](diagrams/01-initialization.puml)
- [tools/call с JSON-ответом](diagrams/02-tool-call-json.puml)
- [tools/call с SSE и progress](diagrams/03-tool-call-sse-progress.puml)

## Другие варианты

- [V2 — GET /mcp разрешён, таймауты и SSE resume](V2.md)

