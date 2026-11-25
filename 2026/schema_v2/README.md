# Схемы SOWA v2: общий конверт без строгой проверки

[Оглавление](../README.md) · [Строгий вариант](../08-sowa-schema.md)

Две схемы draft-07 на все разрешённые вызовы: `server/discover` и `tools/call`. Они проверяют, что общие поля есть и имеют нужный тип. Значения политики (версия, capabilities, allowlist тулов) сверяют сервис 2 и заголовки, а не схема.

- Запрос: [mcp-request.json](mcp-request.json)
- Ответ: [mcp-response.json](mcp-response.json)
- Аргументы тулы по-прежнему проверяет отдельная схема по `Mcp-Name`, пример: [../schemas/tool-arguments.example.json](../schemas/tool-arguments.example.json)

## Запрос

Общие поля для обоих методов:

| Поле | Правило |
| --- | --- |
| `jsonrpc` | `2.0` |
| `id` | Строка или целое число. `null` запрещён |
| `method` | `server/discover` или `tools/call` |
| `params` | Объект |
| `params._meta["io.modelcontextprotocol/protocolVersion"]` | Непустая строка |
| `params._meta["io.modelcontextprotocol/clientInfo"]` | Объект с непустыми строками `name` и `version` |
| `params._meta["io.modelcontextprotocol/clientCapabilities"]` | Объект |
| `params._meta.progressToken` | Необязателен. Строка или целое число |

Только для `tools/call`:

| Поле | Правило |
| --- | --- |
| `params.name` | Непустая строка, обязательна |
| `params.arguments` | Необязателен. Если есть — объект |

Ветка `tools/call` подключается через `if`/`then` по значению `method`, а не через `oneOf`. Поэтому ошибка указывает на конкретное поле, а не на все ветки сразу.

## Ответ

| Поле | Правило |
| --- | --- |
| `jsonrpc` | `2.0` |
| `id` | Строка, целое число или `null` (JSON-RPC ставит `null`, если `id` запроса не удалось прочитать) |
| `result` / `error` | Ровно одно из двух |
| `result.resultType` | `complete` |
| `error.code` | Целое число |
| `error.message` | Строка |

Состав `result` по методу не разбирается: схема ответа не знает, на какой метод ответ. `content`, `supportedVersions`, `capabilities`, `structuredContent` проходят как есть.

`resultType: complete` — единственное правило политики, оставленное в схеме: без него сквозь SOWA пройдёт `input_required`. Если решение о `input_required` полностью отдаётся сервису 2, `const` можно заменить на `{ "type": "string" }`.

Кадр SSE схема не описывает. Для `text/event-stream` проверяется JSON из события `data`, у которого есть `id`. `notifications/progress` этой схемой не проверяется.

## Что проходит и что нет

Неизвестные ключи на любом уровне проходят: `additionalProperties` нигде не закрыт.

Отклоняются: не объект (в том числе batch-массив), `jsonrpc` не `2.0`, другой `method`, `id` равный `null` или дробный, нет `_meta` или одного из трёх обязательных ключей в нём, `tools/call` без `name`, `arguments` не объект. В ответе — оба поля `result` и `error` или ни одного, `result` без `resultType` или с другим значением, `error` без `code` или `message`.

## Отличия от [строгого варианта](../schemas)

| Случай | `schemas` | `schema_v2` |
| --- | --- | --- |
| Лишний ключ в корне, `params`, `clientInfo` (например, `clientInfo.title` из MCP) | Отклоняется | Проходит |
| `protocolVersion` не `2026-07-28` | Отклоняется | Проходит, сверка с заголовком `MCP-Protocol-Version` у сервиса 2 |
| Непустые `clientCapabilities` | Отклоняется | Проходит, решает сервис 2 |
| `tools/call` без `arguments` (в MCP поле необязательно) | Отклоняется | Проходит |
| `params.task`, `inputResponses`, `requestState` в запросе | Отклоняется | Проходит, решает сервис 2 |
| Лимиты длины `id`, `name`, `version` | 128 / 64 символа | Нет, кроме запрета пустой строки |
| Ошибка с `id: null` | Отклоняется | Проходит |
| `content` не только `text` (image, resource_link) | Отклоняется | Проходит |
| `capabilities` с `extensions`, `listChanged: true` | Отклоняется | Проходит |
| `result` с полями и discover, и tools/call | Отклоняется из-за `oneOf` | Проходит |
| Компиляция в ajv 8 с настройками по умолчанию | Предупреждения `strictTypes`, при `strict: true` ошибка | Без предупреждений |

## Проверка примеров

В [examples](examples) лежат валидные и невалидные тела. Проверить можно любым валидатором draft-07, например:

```bash
npx ajv-cli@5 validate --spec=draft7 -s mcp-request.json -d "examples/request/valid/*.json"
npx ajv-cli@5 validate --spec=draft7 -s mcp-request.json -d "examples/request/invalid/*.json"
npx ajv-cli@5 validate --spec=draft7 -s mcp-response.json -d "examples/response/valid/*.json"
npx ajv-cli@5 validate --spec=draft7 -s mcp-response.json -d "examples/response/invalid/*.json"
```

Файлы из `valid` должны пройти, из `invalid` — нет.
