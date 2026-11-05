# Вызов и ответы

[Оглавление](README.md)

## Первый запрос: server/discover

Клиент может пропустить этот вызов и сразу отправить `tools/call`.

```http
POST /mcp/dzo-a/weather HTTP/1.1
Host: mcp.example.internal
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: server/discover

{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "method": "server/discover",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Допустимый ответ:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "discover-1",
  "result": {
    "resultType": "complete",
    "supportedVersions": ["2026-07-28"],
    "capabilities": {
      "tools": {}
    },
    "ttlMs": 3600000,
    "cacheScope": "private",
    "_meta": {
      "io.modelcontextprotocol/serverInfo": {
        "name": "service-4",
        "version": "1.0.0"
      }
    }
  }
}
```

Сервис 1 проверяет, что `2026-07-28` есть в `supportedVersions`, а capabilities не содержат запрещённых разделов. Ответ не создаёт сессию. Следующий вызов — новый независимый POST.

Если версия не поддерживается, сервис 4 возвращает JSON-RPC `-32022` и список поддерживаемых версий. Клиент не понижает версию автоматически до `2025-11-25`: для старой версии действует отдельный профиль V1 или V2.

## tools/call

```http
POST /mcp/dzo-a/weather HTTP/1.1
Host: mcp.example.internal
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: get_weather

{
  "jsonrpc": "2.0",
  "id": 18,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {},
      "progressToken": "progress-18"
    }
  }
}
```

Обязательные совпадения:

- `MCP-Protocol-Version` равен `_meta["io.modelcontextprotocol/protocolVersion"]`;
- `Mcp-Method` равен `method`;
- `Mcp-Name` равен `params.name`.

Расхождение даёт HTTP `400`.

Ограничения тела:

- `params.name` входит в allowlist;
- `arguments` соответствуют схеме инструмента;
- `params.task` отсутствует;
- кроме обязательных полей протокола в `_meta` разрешён только `progressToken`.

### JSON-ответ

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "complete",
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

HTTP-запрос завершён. Поле `id` совпадает с запросом. `resultType` обязателен.

### SSE-ответ на том же POST

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"progress-18","progress":40,"total":100}}

data: {"jsonrpc":"2.0","id":18,"result":{"resultType":"complete","content":[{"type":"text","text":"В Варшаве +12 °C"}],"isError":false}}

```

Progress не является отдельным POST. После финального `result` или `error` сервис 4 закрывает поток. Event ID и восстановление потока не используются.

Если соединение оборвалось до финального события, сервис 1 возвращает `MCP_RESULT_UNKNOWN` и не отправляет `tools/call` повторно. Спецификация разрешает новый запрос с новым `id`, но для этого профиля автоматический повтор запрещён: инструмент мог уже выполниться.

## Какие ответы может получить клиент

Один `tools/call` завершается ровно одним JSON-RPC-сообщением с тем же `id`. Оно приходит либо телом `application/json`, либо последним событием `text/event-stream`. До него в SSE могут быть только `notifications/progress`.

Клиент принимает решение по первому полю результата:

1. Есть `error` — вызов завершён ошибкой, повтор не нужен.
2. `result.resultType` равен `complete` — это итоговый ответ инструмента.
3. `result.resultType` равен `input_required` — инструмент ещё не закончен. Клиент выполняет вложенные запросы и отправляет новый `tools/call`.

Других значений `resultType` в этом профиле нет.

### 1. Ошибка

```json
{
  "jsonrpc": "2.0",
  "id": 18,
  "error": {
    "code": -32602,
    "message": "Неверные аргументы"
  }
}
```

Клиент возвращает ошибку вызывающему и ничего не переспрашивает.

### 2. Готовый результат

```json
{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "complete",
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

`isError: true` тоже завершает вызов. Это ошибка самого инструмента, а не просьба прислать дополнительные данные.

### 3. Прогресс и затем один из результатов

```text
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"progress-18","progress":40}}

data: {"jsonrpc":"2.0","id":18,"result":{"resultType":"complete","content":[{"type":"text","text":"Готово"}],"isError":false}}
```

Последнее сообщение может вместо `complete` содержать `input_required`. Progress самостоятельного действия не требует.
