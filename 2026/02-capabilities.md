# Capabilities

[Оглавление](README.md)

## Capabilities

В `2026-07-28` capabilities не согласуются один раз при инициализации. Клиент заново передаёт свои capabilities в каждом запросе. Сервер не имеет права переносить их из предыдущего POST. Сервер публикует свои capabilities в ответе `server/discover`.

Отсутствие ключа означает, что возможность выключена. Пустой объект `{}` внутри ключа означает базовую поддержку без дополнительных режимов. Значение `true` у вложенного флага включает только этот режим.

Типы `image`, `audio`, `resource_link` и встроенный `resource` capabilities не являются. Они ограничиваются отдельной проверкой `result.content`.

### Capabilities клиента

Клиент передаёт их в `_meta["io.modelcontextprotocol/clientCapabilities"]`.

| Capability | Включение | Что разрешает серверу |
| --- | --- | --- |
| Ключ отсутствует | Выключено | Сервер не может использовать возможность |
| `elicitation: {}` | Form | Запросить у клиента плоскую форму через `input_required` |
| `elicitation.form: {}` | Form явно | То же, что пустой объект `elicitation` |
| `elicitation.url: {}` | URL | Запросить переход по внешней ссылке |
| `sampling: {}` | Базовый sampling | Запросить у клиента генерацию модели; возможность устарела |
| `sampling.tools: {}` | Sampling с тулами | Передать в sampling собственный список tools и `toolChoice` |
| `sampling.context: {}` | Контекст sampling | Поле `includeContext`; режим устарел |
| `roots: {}` | Roots | Запросить список каталогов клиента; возможность устарела |
| `experimental` | Нестандартные возможности | Только явно названные экспериментальные ключи |
| `extensions` | Именованные расширения | Только расширения с явным идентификатором, например tasks или UI |

Для elicitation режимы независимы. Объект `elicitation: {}` включает только form. URL не включается, пока нет `elicitation.url`.

Sampling и roots в `2026-07-28` помечены как устаревшие. Новым клиентам не следует их объявлять.

### Capabilities сервера

Сервер передаёт их в `result.capabilities` ответа `server/discover`.

| Capability | Включение | Что это даёт |
| --- | --- | --- |
| Ключ отсутствует | Выключено | Клиент не использует возможность |
| `tools: {}` | Вызов инструментов | Разрешены `tools/list` и `tools/call` |
| `tools.listChanged: true` | Уведомления о каталоге tools | Сервер может сообщать об изменении списка |
| `tools.listChanged: false` или поле отсутствует | Без уведомлений | Каталог запрашивается явно |
| `resources: {}` | Чтение ресурсов | Разрешены список и `resources/read` |
| `resources.subscribe: true` | Подписка на ресурс | Нужен отдельный `subscriptions/listen` |
| `resources.listChanged: true` | Уведомления о списке ресурсов | Также требуется канал подписки |
| `prompts: {}` | Шаблоны prompt | Разрешены `prompts/list` и `prompts/get` |
| `prompts.listChanged: true` | Уведомления о списке prompt | Требуется канал подписки |
| `completions: {}` | Автодополнение | Разрешён `completion/complete` |
| `logging: {}` | Журналы сервера | Устаревшая возможность |
| `experimental` | Нестандартные возможности | Только явно названные ключи |
| `extensions` | Именованные расширения | Например `io.modelcontextprotocol/tasks` |

Флаг `listChanged` или `subscribe` сам по себе канал уведомлений не открывает. Клиент должен отдельно вызвать `subscriptions/listen` и перечислить нужные уведомления. Без этого вызова сервер не получает постоянного канала.

### Состояние в текущем профиле

Сервис 1 в каждом запросе передаёт:

```json
"io.modelcontextprotocol/clientCapabilities": {}
```

Сервис 4 в `server/discover` возвращает только:

```json
"capabilities": {
  "tools": {}
}
```

Следствия:

- capability `tools` не открывает `tools/list`: метод по-прежнему запрещён policy;
- вложенные `elicitation`, `sampling` и `roots` выключены пустыми capabilities;
- сам `resultType: "input_required"` дополнительно запрещён проверкой JSON-ответа;
- каталог tools не приходит уведомлением, потому что нет `tools.listChanged: true` и нет `subscriptions/listen`;
- ресурсы, prompts, completions, logging, experimental и extensions выключены;
- устаревшие sampling, roots и logging не реализуются.

Сервис 2 отклоняет запрос, если в `clientCapabilities` есть любой ключ. Он также отклоняет ответ `server/discover`, если capabilities сервера содержат что-либо кроме `tools` без `listChanged: true`.

Чтобы включить возможность позже, недостаточно изменить только одну сторону. Нужны одновременно:

1. Явное поле capability в запросе сервиса 1.
2. Поддержка этой возможности сервисом 4.
3. Разрешение конкретного ключа в policy сервиса 2 и в схеме SOWA.
4. Для уведомлений — отдельное разрешение долгого `subscriptions/listen`.

До этого изменения пустой объект отключает необязательные capabilities. Он не заменяет проверку тела ответа.

## Контроль функционала

`input_required` встроен в результат `tools/call`, `resources/read` и `prompts/get`. Отдельной capability с таким именем нет.

Пустые capabilities объявляются так:

```json
"io.modelcontextprotocol/clientCapabilities": {}
```

Они запрещают серверу добавлять вложенные запросы. Например, `elicitation/create` разрешён только после явного объявления:

```json
"io.modelcontextprotocol/clientCapabilities": {
  "elicitation": {
    "form": {}
  }
}
```

Даже после такого объявления сервер сам решает, возвращать ли `input_required`. Объявление capability разрешает механизм, но не вызывает его.

Вариант только с `requestState` не требует ни одной capability:

```json
{
  "resultType": "input_required",
  "requestState": "opaque-state"
}
```

Поэтому сервис 2 запрещает любой ответ, у которого `resultType` не равен `complete`.

| Функция | Управление по стандарту | Как выключено в профиле |
| --- | --- | --- |
| `server/discover` | Метод протокола, capability не требуется | Разрешён |
| `tools/call` | Сервер объявляет `capabilities.tools: {}` | Разрешён |
| `tools/list` | Включается вместе с capability `tools` | Запрещён policy по `Mcp-Method` и `method` |
| `tools.listChanged` | Сервер ставит `tools.listChanged: true`; клиент открывает `subscriptions/listen` | Запрещены оба флага и метод подписки |
| `notifications/progress` | Клиент передаёт `_meta.progressToken`; отдельной capability нет | Разрешён только внутри SSE того же POST |
| `resultType: complete` | Обязательное поле успешного результата | Единственный разрешённый `resultType` |
| `input_required` с `elicitation/create` | Клиент объявляет `elicitation`; `elicitation: {}` включает только form, `elicitation.url` включает внешнюю ссылку | Capability отсутствует; дополнительно JSON-ответ с таким `resultType` блокируется |
| `input_required` с `sampling/createMessage` | Клиент объявляет `sampling: {}`; для tools внутри sampling нужно `sampling.tools: {}` | Capability отсутствует и JSON-ответ блокируется; механизм устарел |
| `input_required` с `roots/list` | Клиент объявляет `roots: {}` | Capability отсутствует и JSON-ответ блокируется; механизм устарел |
| `input_required` только с `requestState` | Capability не управляет этим ответом | Только проверка JSON: `resultType` обязан быть `complete` |
| Повтор с `inputResponses` | Клиент добавляет его в следующий `tools/call` | Поле запрещено схемой запроса |
| `content.type: text` | Обычное поле результата, capability нет | Разрешён |
| `content.type: image` или `audio` | Обычное поле результата, capability нет | Запрещены схемой ответа |
| `resource_link` и встроенный `resource` | Сервер дополнительно объявляет `resources` для полноценной работы ресурсов | Запрещены схемой `content` и отсутствием capability `resources` |
| `resources/list`, `resources/read` | Сервер объявляет `resources: {}` | Capability и методы запрещены |
| `resources.subscribe` | Сервер ставит `resources.subscribe: true` и клиент вызывает `subscriptions/listen` | Запрещены |
| `prompts/list`, `prompts/get` | Сервер объявляет `prompts: {}` | Capability и методы запрещены |
| `prompts.listChanged` | `prompts.listChanged: true` плюс `subscriptions/listen` | Запрещены |
| `completion/complete` | Сервер объявляет `completions: {}` | Capability и метод запрещены |
| `logging` | Сервер объявляет `logging: {}`; уровень может передаваться в `_meta["io.modelcontextprotocol/logLevel"]` | Capability отсутствует, поле `_meta` запрещено; механизм устарел |
| `subscriptions/listen` | Отдельный метод, не capability | Запрещён policy |
| `experimental` | Явные ключи в client или server capabilities | Любой ключ отклоняется |
| `extensions`, включая tasks | Явный идентификатор, например `extensions["io.modelcontextprotocol/tasks"]: {}` | Любой идентификатор отклоняется |
| JSON-RPC batch | Стандарт HTTP запрещает массив в корне тела | Схема SOWA требует один JSON-объект |
| `GET`, `DELETE`, `PUT`, `PATCH` | Транспорт `2026-07-28` использует POST | Запрещены HTTP-policy |

Если серверу для выполнения запроса необходима capability, которую клиент не объявил, он не подставляет скрытый `input_required`. Он возвращает JSON-RPC `-32021` и HTTP `400`. В текущем профиле сервису 4 запрещено требовать такие capabilities: обычный `tools/call` должен завершаться без них.
