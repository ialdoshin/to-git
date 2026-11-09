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

Сервис 1 не открывает второй запрос. Заголовки ответа и все события приходят в теле того же `POST`, которым отправлен `tools/call`. Пока поток открыт, HTTP-запрос не завершён.

Сервис 4 сразу отдаёт заголовки и дальше пишет события по мере готовности. Длины всего тела нет: ответ идёт как `Transfer-Encoding: chunked`. После каждого события сервис сбрасывает буфер, и это событие уходит отдельным HTTP-chunk. Пустая строка заканчивает событие SSE.

Заголовки уходят первыми и chunk не являются:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
Transfer-Encoding: chunked

```

Дальше тело. Строка с hex-длиной — рамка HTTP chunk. После разбора `Transfer-Encoding` сервис 1 её уже не видит и читает только строки `data:`. Пустая строка входит в длину: она заканчивает событие SSE. `\r\n` после длины и в конце chunk в длину не входят.

Chunk 1, прогресс, 126 байт (`7e`):

```text
7e\r\n
data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"progress-18","progress":40,"total":100}}\n
\n
\r\n
```

Chunk 2, готовый результат, 147 байт (`93`). В длину входят кириллица и знак градуса:

```text
93\r\n
data: {"jsonrpc":"2.0","id":18,"result":{"resultType":"complete","content":[{"type":"text","text":"В Варшаве +12 °C"}],"isError":false}}\n
\n
\r\n
```

Chunk 3 закрывает тело. Полезных байт в нём нет:

```text
0\r\n
\r\n
```

Порядок на проводе:

1. Заголовки. Сервис 1 видит `text/event-stream` и начинает читать поток. Результата ещё нет.
2. Первый chunk — `notifications/progress`. У события нет JSON-RPC `id`. Сервис 1 сверяет `progressToken` с `progress-18` и оставляет вызов открытым.
3. Если до следующего события пауза длиннее heartbeat, сервис 4 пишет комментарий SSE `: keep-alive` и снова сбрасывает буфер. Комментарий клиент не разбирает как JSON. Он нужен, чтобы прокси увидел байты и не закрыл соединение по idle timeout.
4. Следующий chunk — единственное сообщение с `"id": 18`. Здесь это `result` и `resultType: "complete"`. Вызов закончен.
5. Сервис 4 отправляет завершающий chunk нулевой длины и закрывает тело ответа.

Между пунктами 2 и 4 может быть несколько progress-событий. Число `progress` растёт. После финального `result` или `error` новых событий нет.

Каждый промежуточный nginx, SOWA и сервис 2 передают байты дальше сразу, тем же ответом. Цепочка ответа:

```text
Сервис 4 → nginx → SOWA → nginx → Сервис 2 → nginx → Сервис 1
```

Сервис 1 читает события с того сокета, куда отправил POST. Отдельного GET нет. `Transfer-Encoding: chunked` — признак одного участка HTTP/1.1. Следующий участок может переложить те же события в кадры HTTP/2. Сервис 1 разбирает строки `data:`, а не номера chunk.

Сервис 2 проверяет каждое событие на проходе и сразу отдаёт его сервису 1. Он ограничивает размер события, их число и общее время потока. SOWA схему ответа к этому потоку не применяет и тело не переписывает.

Если любой участок накопит ответ до закрытия потока, сервис 1 получит progress только вместе с финальным результатом либо не получит ничего до обрыва по таймауту. Обрыв до сообщения с `id` 18 — это `MCP_RESULT_UNKNOWN`. Повторный `tools/call` не отправляется.

Event ID и восстановление потока не используются.

#### Nginx на пути ответа

Такие настройки нужны в `location` каждого nginx, через который проходит этот POST. `X-Accel-Buffering: no` первый nginx забирает себе и дальше может не передать, поэтому на каждом участке буферизацию выключают явно.

```nginx
location /mcp/ {
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_buffering off;
    proxy_cache off;
    gzip off;
    proxy_max_temp_file_size 0;
    tcp_nodelay on;

    proxy_read_timeout 60s;
    send_timeout 60s;
    proxy_ignore_client_abort off;
}
```

- `proxy_http_version 1.1` и пустой `Connection` оставляют ответ chunked между nginx и следующим узлом.
- `proxy_buffering off` отправляет каждый полученный кусок сразу, не дожидаясь конца ответа и не складывая его во временный файл.
- `gzip off` нужен потому, что сжатие собирает тело перед отправкой.
- `proxy_read_timeout` — пауза между двумя чтениями от предыдущего узла. `send_timeout` — пауза между двумя записями клиенту. Оба должны быть больше интервала heartbeat и меньше таймаута сервиса 1. Пришедший chunk или `: keep-alive` эти таймеры обнуляет.
- Эти таймауты не ограничивают полную длительность вызова. Пока события идут, поток может жить долго. Абсолютный предел задают сервис 1, сервис 2 и SOWA, как в [требованиях](06-trebovaniya.md).
- `proxy_ignore_client_abort off` закрывает поток к сервису 4, когда сервис 1 отключился. Для сервиса 4 это отмена текущего вызова.

`proxy_buffer_size` оставляет место под заголовки ответа и один исходящий кусок. На накопление всего SSE он не влияет, пока `proxy_buffering` выключен.

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
