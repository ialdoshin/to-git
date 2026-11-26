# Схемы SOWA v3: security-режим

[Оглавление](../README.md) · [Строгий вариант](../08-sowa-schema.md) · [Мягкий вариант v2](../schema_v2/README.md)

Две схемы draft-07 на разрешённые вызовы `server/discover` и `tools/call`. Набор обязательных полей тот же, что в v2. Отличие одно: **у каждого поля, объявленного в схеме, есть явные границы**. Длина строк, диапазон чисел, число элементов массива и число ключей объекта ограничены везде.

- Запрос: [mcp-request.json](mcp-request.json)
- Ответ: [mcp-response.json](mcp-response.json)
- Проверка правила: [tools/lint-constraints.js](tools/lint-constraints.js)
- Примеры: [examples](examples)

Аргументы тулы по-прежнему проверяет отдельная схема по `Mcp-Name`, пример: [../schemas/tool-arguments.example.json](../schemas/tool-arguments.example.json). В security-режиме к ней применяется то же правило границ.

## Главное

> **Обязательно.** Каждое объявленное поле ограничено:
>
> | Тип | Обязательные ключевые слова |
> | --- | --- |
> | `string` | `minLength` и `maxLength` |
> | `integer`, `number` | `minimum` и `maximum` |
> | `array` | `minItems`, `maxItems` и `items` |
> | `object` | `maxProperties`, а также `propertyNames` с лимитом длины либо `additionalProperties: false` |
> | `const`, `enum`, `boolean`, `null` | Уже ограничены |
>
> Правило проверяет [tools/lint-constraints.js](tools/lint-constraints.js). Поле без границ — ошибка линтера.

> **Мягко.** Значения политики схема не сверяет. Любая версия формата `ГГГГ-ММ-ДД`, любые `clientCapabilities`, любой тип `content` проходят. Эти решения остаются за сервисом 2. Неизвестные ключи внутри `params`, `_meta`, `clientInfo`, `clientCapabilities`, `arguments`, `result` и `error` проходят, но **их число и длина имени ограничены**.

> **Закрыто.** Корень запроса и ответа: JSON-RPC задаёт фиксированный набор полей, лишний ключ в корне отклоняется. `method` — только `server/discover` или `tools/call`. `result.resultType` — только `complete`.

> **Большой текст не роняет валидацию.** Превышение лимита — обычный ответ валидатора `false`. SOWA возвращает ошибку и не падает. Подробности ниже в разделе «Большие тексты».

## Лимиты запроса

| Поле | Лимит |
| --- | --- |
| Корень | Только `jsonrpc`, `id`, `method`, `params` |
| `id`, `progressToken` | Строка 1–128 символов либо целое в пределах ±(2^53 − 1) |
| `params` | До 16 ключей |
| `params._meta` | До 32 ключей |
| `_meta["io.modelcontextprotocol/protocolVersion"]` | Ровно 10 символов, формат `ГГГГ-ММ-ДД` |
| `_meta["io.modelcontextprotocol/clientInfo"]` | До 16 ключей. `name` и `title` 1–256, `version` 1–64, `description` до 4096, `websiteUrl` до 2048 |
| `_meta["io.modelcontextprotocol/clientCapabilities"]` | До 32 ключей |
| `params.name` (`tools/call`) | 1–128 символов, только `A–Z a–z 0–9 _ . -` |
| `params.arguments` (`tools/call`) | Необязателен. Если есть — объект до 64 ключей |
| Имя любого ключа в открытом объекте | 1–256 символов |

## Лимиты ответа

| Поле | Лимит |
| --- | --- |
| Корень | Только `jsonrpc`, `id` и ровно одно из `result` / `error` |
| `id` | Как в запросе, плюс `null` |
| `result` | До 32 ключей, `resultType: complete` |
| `result.content` | 0–256 элементов, каждый до 16 ключей, `type` 1–64 |
| `content[].text` | До 1 048 576 символов (1 Mi) |
| `content[].mimeType` / `uri` | До 256 / 2048 символов |
| `result.structuredContent` | Объект до 256 ключей |
| `result.supportedVersions` | 1–32 строк формата `ГГГГ-ММ-ДД` |
| `result.capabilities` | До 32 ключей |
| `result.ttlMs` | 0–604 800 000 (7 суток) |
| `result.cacheScope` | `public` или `private` |
| `_meta["io.modelcontextprotocol/serverInfo"]` | `name` 1–256, `version` 1–64 |
| `error.code` | 32-битное целое |
| `error.message` | До 8192 символов |
| `error.data` | Строка до 65 536, число, boolean, `null`, массив до 256 скаляров или объектов, объект до 64 ключей |

Лимиты выбраны с запасом над реальными значениями, чтобы корректный трафик не отклонялся. Менять их надо в схеме, линтер проверит, что граница не пропала.

## Большие тексты

Вопрос: лимит поля 128, а приходит строка на тысячу или миллион символов. Что будет?

**Падения нет.** `maxLength` — обычная проверка: валидатор возвращает `false` и ошибку вида `/params/name must NOT have more than 128 characters`. SOWA отвечает отказом, сервис 4 запрос не получает. Замер на ajv 8:

| Ввод | Результат | Время |
| --- | --- | --- |
| `params.name` 1 000 символов | Отклонено | < 1 мс |
| `params.name` 1 000 000 символов | Отклонено | ~5 мс |
| `params.name` 10 000 000 символов | Отклонено | ~20 мс |
| `params.name` 1 000 000 символов + `!` (против `pattern`) | Отклонено | ~2 мс |
| `arguments` со 100 000 ключей | Отклонено | ~30 мс |
| `content` из 100 000 элементов | Отклонено | ~12 мс |
| `content[].text` ровно 1 048 576 символов | Принято | ~4 мс |
| `content[].text` 10 000 000 символов | Отклонено | ~20 мс |

Почему это безопасно:

1. **Время линейное.** `maxLength`, `maxItems` и `maxProperties` проходят значение один раз. Ни одна проверка не растёт быстрее размера тела.
2. **Регулярные выражения без отката.** В схемах всего два `pattern`: `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` и `^[A-Za-z0-9_.-]+$`. В них нет вложенных квантификаторов, поэтому катастрофического backtracking нет на любой длине.
3. **Лимиты не мелкие.** Корректное значение до них не дотягивает: 128 на имя тулы — предел из MCP, 1 Mi на текстовый блок ответа.
4. **Отказ, а не обрезка.** Схема ничего не переписывает и не укорачивает. Значение либо проходит целиком, либо запрос отклоняется.

> **Что нужно настроить рядом со схемой.** JSON Schema не ограничивает глубину вложенности и размер неописанных значений: строка на 10 МБ внутри `arguments` пройдёт общую схему (её режет схема тулы). Поэтому до парсинга JSON нужен **лимит размера тела** (например, `client_max_body_size` в nginx и свой лимит в SOWA), а валидатор лучше запускать с `allErrors: false`: на враждебном вводе он останавливается на первой ошибке.

Ответ клиенту при отказе — HTTP `400` и JSON-RPC `-32602` или `-32600`. Значение поля в текст ошибки не копируется: достаточно пути и правила.

## Отличия от v2

| Случай | v2 | v3 |
| --- | --- | --- |
| Лишний ключ в корне | Проходит | Отклоняется |
| `id` длиннее 128 или целое за пределами ±(2^53 − 1) | Проходит | Отклоняется |
| `protocolVersion` не в формате `ГГГГ-ММ-ДД` | Проходит | Отклоняется |
| Имя тулы с пробелами, `;`, длиннее 128 | Проходит | Отклоняется |
| Длинные `clientInfo.name`, `error.message`, `text` | Проходят | Отклоняются выше лимита |
| Объекты с тысячами ключей, массивы с тысячами элементов | Проходят | Отклоняются выше лимита |
| Любая версия, любые capabilities, неизвестные ключи внутри объектов | Проходят | Проходят |
| Поля без явных границ | 38 по линтеру | 0 |

## Проверка

```bash
cd 2026/schema_v3

node tools/lint-constraints.js mcp-request.json mcp-response.json

npx ajv-cli@5 validate --spec=draft7 --strict=true -s mcp-request.json -d "examples/request/valid/*.json"
npx ajv-cli@5 validate --spec=draft7 --strict=true -s mcp-request.json -d "examples/request/invalid/*.json"
npx ajv-cli@5 validate --spec=draft7 --strict=true -s mcp-response.json -d "examples/response/valid/*.json"
npx ajv-cli@5 validate --spec=draft7 --strict=true -s mcp-response.json -d "examples/response/invalid/*.json"
```

Линтер должен вывести «все объявленные поля ограничены». Файлы из `valid` должны пройти, из `invalid` — нет. Имя файла в `invalid` называет нарушенный лимит, например `tool-name-1000-chars.json` или `arguments-65-keys.json`.
