# Схемы SOWA: запрос и ответ

[Оглавление](README.md)

Одна JSON Schema проверяет общий конверт каждого POST. Разрешены только `server/discover` и `tools/call`. Схемы аргументов тулов в этот файл не входят: SOWA выбирает их отдельно по заголовку `Mcp-Name`.

Схема запроса: [schemas/mcp-request.json](schemas/mcp-request.json).

Схема ответа: [schemas/mcp-response.json](schemas/mcp-response.json).

Пример схемы аргументов: [schemas/tool-arguments.example.json](schemas/tool-arguments.example.json).

Корень тела — один JSON-объект. Массив, пакет JSON-RPC и любой другой `method` схема отклоняет.

## Общие поля

Эти правила стоят на обоих вызовах. Описания полей лежат в `definitions` и подключаются через `$ref`.

| Поле | Правило |
| --- | --- |
| `jsonrpc` | Строго `2.0` |
| `id` | Непустая строка до 128 символов или целое число. `null` запрещён |
| `method` | `server/discover` или `tools/call`, и совпадает с веткой `params` |
| `params._meta["io.modelcontextprotocol/protocolVersion"]` | Строго `2026-07-28` |
| `params._meta["io.modelcontextprotocol/clientInfo"]` | Объект только с `name` и `version` |
| `params._meta["io.modelcontextprotocol/clientCapabilities"]` | Пустой объект |

Другие ключи корня и `params` запрещены. В `_meta` обязательные поля проверяются по типу, а неизвестный ключ проходит как есть: схему не нужно менять, когда в протоколе появится новое поле. Если ключ уже описан (`progressToken`, версия, `clientInfo`, `clientCapabilities`), его значение по-прежнему должно совпасть со схемой. У `tools/call` из заранее известных необязательных полей описан только `progressToken`.

`server/discover` содержит в `params` только `_meta`. Полей `name` и `arguments` нет.

`tools/call` требует `params.name`, `params.arguments` как объект и `_meta`. Поля `task`, `inputResponses` и `requestState` не проходят: их нет в списке свойств, а лишние свойства закрыты.

`params.arguments` в общей схеме — любой объект. Состав полей тулы проверяет вторая схема.

## Что схема не сверяет

JSON Schema не видит HTTP-заголовки. Рядом с ней SOWA и сервис 2 проверяют:

- метод HTTP — только `POST`;
- `Content-Type: application/json`;
- `Accept` содержит `application/json` и `text/event-stream`;
- `MCP-Protocol-Version` равен `2026-07-28` и полю версии в `_meta`;
- `Mcp-Method` равен `method`;
- для `tools/call` заголовок `Mcp-Name` равен `params.name` и входит в allowlist;
- для `server/discover` заголовка `Mcp-Name` нет.

## Ответ

[schemas/mcp-response.json](schemas/mcp-response.json) проверяет финальное JSON-RPC-сообщение. В нём есть `jsonrpc`, `id` и ровно одно из полей `result` или `error`.

`error` требует целое `code` и непустой `message`. Поле `data` может быть любым.

`result.resultType` строго `complete`. Поля `inputRequests` и `requestState` запрещены.

Ответ `server/discover` узнаётся по `supportedVersions` и `capabilities`. В списке версий есть `2026-07-28`. В `capabilities` разрешён только `tools`, без `listChanged: true`. Необязательны `ttlMs`, `cacheScope` и `_meta` с `serverInfo`.

Ответ `tools/call` узнаётся по `content`. Каждый элемент имеет `type: "text"` и строковый `text`. `isError` — логическое значение или отсутствует. `structuredContent` эта схема не разбирает: его проверяет отдельная схема тулы, так же как `arguments` в запросе.

Неизвестный ключ внутри `result`, `error` и `_meta` проходит. Уже описанное поле проверяется по типу.

Схема ответа не читает кадр SSE. Для `application/json` она применяется ко всему телу. Для `text/event-stream` ей соответствует только JSON из события `data`, у которого есть `id`. Событие `notifications/progress` этой схемой не проверяется. SOWA не буферизует поток и не применяет схему запроса к ответу.

## Вторая схема, только для тулы

После успешного конверта, если `Mcp-Method` равен `tools/call`, SOWA применяет заранее скомпилированную схему аргументов выбранной тулы к `params.arguments`. Для `get_weather` это объект с обязательной строкой `city`. Схемы тулов не складываются в один `oneOf` внутри конверта: имя уже выбрано заголовком `Mcp-Name`.

`server/discover` вторую схему не получает.
