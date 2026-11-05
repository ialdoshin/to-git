# Методы и будущие разрешения

[Оглавление](README.md)

## Методы MCP 2026-07-28

В этой версии есть три способа передать метод:

- клиент отправляет его отдельным POST;
- сервер вкладывает его в `result.inputRequests`, отдельного POST при этом нет;
- уведомление приходит внутри SSE и не требует JSON-RPC-ответа.

В примерах ниже пропущен обязательный объект `_meta` с версией `2026-07-28`, `clientInfo` и `clientCapabilities`. В реальном запросе он есть у каждого клиентского метода. Методы расширения tasks здесь не входят в базовый протокол: они включаются только через `extensions["io.modelcontextprotocol/tasks"]`.

| Метод | Когда используется | Запрос | Ответ |
| --- | --- | --- | --- |
| `server/discover` | Клиент заранее узнаёт версии и capabilities. Вызов необязателен | `{"method":"server/discover"}` | `{"resultType":"complete","supportedVersions":["2026-07-28"],"capabilities":{"tools":{}}}` |
| `tools/list` | Клиент получает каталог инструментов. Нужна server capability `tools` | `{"method":"tools/list"}` | `{"resultType":"complete","tools":[{"name":"get_weather","inputSchema":{"type":"object"}}]}` |
| `tools/call` | Клиент выполняет инструмент | `{"method":"tools/call","params":{"name":"get_weather","arguments":{"city":"Warsaw"}}}` | `{"resultType":"complete","content":[{"type":"text","text":"В Варшаве +12 °C"}]}` |
| `resources/list` | Клиент получает список ресурсов. Нужна capability `resources` | `{"method":"resources/list"}` | `{"resultType":"complete","resources":[{"uri":"file:///project/readme.md","name":"readme"}]}` |
| `resources/templates/list` | Клиент получает шаблоны URI ресурсов | `{"method":"resources/templates/list"}` | `{"resultType":"complete","resourceTemplates":[{"uriTemplate":"file:///project/{path}","name":"project"}]}` |
| `resources/read` | Клиент читает ресурс по URI, в том числе полученному как `resource_link` | `{"method":"resources/read","params":{"uri":"file:///project/readme.md"}}` | `{"resultType":"complete","contents":[{"uri":"file:///project/readme.md","text":"Текст"}]}` |
| `prompts/list` | Клиент получает список шаблонов prompt. Нужна capability `prompts` | `{"method":"prompts/list"}` | `{"resultType":"complete","prompts":[{"name":"review","description":"Ревью кода"}]}` |
| `prompts/get` | Клиент получает текст конкретного prompt | `{"method":"prompts/get","params":{"name":"review","arguments":{"code":"print(1)"}}}` | `{"resultType":"complete","messages":[{"role":"user","content":{"type":"text","text":"Проверь код"}}]}` |
| `completion/complete` | Клиент запрашивает автодополнение аргумента. Нужна capability `completions` | `{"method":"completion/complete","params":{"ref":{"type":"ref/prompt","name":"review"},"argument":{"name":"language","value":"py"}}}` | `{"resultType":"complete","completion":{"values":["python","pytorch"]}}` |
| `subscriptions/listen` | Клиент открывает долгий POST для изменений списков и ресурсов | `{"method":"subscriptions/listen","params":{"notifications":{"toolsListChanged":true}}}` | Поток SSE. Сначала `notifications/subscriptions/acknowledged`, затем уведомления об изменениях |
| `elicitation/create` | Сервер просит данные или согласие открыть URL. Приходит только внутри `inputRequests`; нужна capability `elicitation` | `{"method":"elicitation/create","params":{"mode":"form","message":"Подтвердите город","requestedSchema":{"type":"object"}}}` | Отдельного HTTP-ответа нет. Клиент возвращает `{"action":"accept","content":{"city":"Warsaw"}}` в `inputResponses` |
| `sampling/createMessage` | Сервер просит клиентскую модель сгенерировать сообщение. Только внутри `inputRequests`; нужна capability `sampling` | `{"method":"sampling/createMessage","params":{"messages":[{"role":"user","content":{"type":"text","text":"Столица Франции?"}}],"maxTokens":100}}` | В `inputResponses`: `{"role":"assistant","content":{"type":"text","text":"Париж"},"model":"model","stopReason":"endTurn"}` |
| `roots/list` | Сервер просит список каталогов клиента. Только внутри `inputRequests`; нужна capability `roots`. Механизм устарел | `{"method":"roots/list"}` | В `inputResponses`: `{"roots":[{"uri":"file:///workspace/project","name":"project"}]}` |
| `notifications/progress` | Сервер сообщает ход выполнения `tools/call`, если клиент передал `progressToken` | В SSE: `{"method":"notifications/progress","params":{"progressToken":"progress-18","progress":40}}` | Ответа нет |
| `notifications/cancelled` | Клиент или сервер сообщает, что запрос с указанным `requestId` больше не нужен | `{"method":"notifications/cancelled","params":{"requestId":18}}` | Ответа нет |
| `notifications/message` | Сервер пишет журнал клиенту. Нужна устаревшая capability `logging` | В SSE: `{"method":"notifications/message","params":{"level":"info","data":"Готово"}}` | Ответа нет |
| `notifications/tools/list_changed` | Сервер сообщает, что каталог tools изменился. Нужны `tools.listChanged` и открытый `subscriptions/listen` | `{"method":"notifications/tools/list_changed"}` | Ответа нет. Клиент сам вызывает `tools/list` |
| `notifications/resources/list_changed` | Сервер сообщает, что список ресурсов изменился | `{"method":"notifications/resources/list_changed"}` | Ответа нет. Клиент сам вызывает `resources/list` |
| `notifications/resources/updated` | Сервер сообщает, что изменился ресурс из подписки | `{"method":"notifications/resources/updated","params":{"uri":"file:///project/readme.md"}}` | Ответа нет. Клиент сам вызывает `resources/read` |
| `notifications/prompts/list_changed` | Сервер сообщает, что список prompt изменился | `{"method":"notifications/prompts/list_changed"}` | Ответа нет. Клиент сам вызывает `prompts/list` |
| `notifications/subscriptions/acknowledged` | Сервер подтверждает, какую подписку принял | `{"method":"notifications/subscriptions/acknowledged","params":{"subscriptions":{"toolsListChanged":true}}}` | Ответа нет |

В `2026-07-28` из базового протокола убраны `initialize`, `notifications/initialized`, `ping`, `logging/setLevel`, `resources/subscribe`, `resources/unsubscribe` и `notifications/roots/list_changed`. Подписки заменяет `subscriptions/listen`, а уровень журнала передаётся полем `_meta["io.modelcontextprotocol/logLevel"]`.

## Что можно разрешить позже

Сейчас закрыты все методы, кроме `server/discover`, `tools/call` и `notifications/progress`. Для будущего решения этого недостаточно: часть методов включается capability, часть — только разрешением метода, а часть capability не отключает.

| Метод | Будущее решение | Как включить | Как продолжать запрещать |
| --- | --- | --- | --- |
| `server/discover`, `tools/call`, `notifications/progress` | Оставить разрешёнными | Уже разрешены | Не требуется |
| `tools/list` | Можно, если каталог должен приходить от сервера, а не из конфигуратора | Разрешить метод в policy и схеме SOWA. Сервер объявляет `capabilities.tools: {}` | Отклонять `Mcp-Method` и `method`, равные `tools/list` |
| `elicitation/create` в режиме form | Можно для отдельных инструментов, которым нужно уточнение | Клиент объявляет `elicitation: {"form": {}}`. Сервис 2 пропускает `input_required`, только если каждый `inputRequests.method` равен `elicitation/create`, а `mode` равен `form` или отсутствует. Повторный POST разрешает `inputResponses` | Не объявлять capability и отклонять JSON-ответ с `resultType`, отличным от `complete` |
| `input_required` только с `requestState` | Можно, если нужно продолжать долгий вызов новым POST | Это не capability. В схеме ответа разрешить `resultType: input_required` без `inputRequests` и требовать строку `requestState`. Клиент повторяет вызов | Отклонять любой `resultType`, кроме `complete` |
| `notifications/cancelled` | Можно, чтобы явно отменять вызов | Разрешить уведомление отдельной схемой: есть `method`, нет `id` | Отклонять этот `method` |
| `prompts/list`, `prompts/get` | Можно, только если Brain действительно использует prompt-шаблоны | Сервер объявляет `capabilities.prompts: {}`, методы добавляются в allowlist и получают свои схемы | Не объявлять capability и отклонять методы |
| `completion/complete` | Можно только вместе с prompts | Сервер объявляет `capabilities.completions: {}`, метод получает отдельную схему | Не объявлять capability и отклонять метод |
| `resources/list`, `resources/templates/list`, `resources/read` | Только с allowlist URI для каждого инструмента. Иначе сервер сможет отдать произвольный ресурс | Сервер объявляет `capabilities.resources: {}`. Сервис 2 проверяет `uri` по списку. В `content` отдельно разрешается `resource_link` | Не объявлять capability, запрещать методы и типы `resource_link` и `resource` в ответе |
| `subscriptions/listen` и уведомления `list_changed`, `resources/updated`, `subscriptions/acknowledged` | Не включать без отдельного проекта таймаутов. Это долгий POST, который прокси закроет | Сервер ставит `listChanged` или `subscribe: true`, клиент вызывает `subscriptions/listen` | Запрещать метод и флаги capabilities. Уведомления без этого канала не доставляются |
| `elicitation/create` в режиме `url` | Не включать: секрет вводится вне MCP, а результат сервер определяет по `requestState` | Клиент объявляет `elicitation.url: {}` | Не объявлять `url` и отклонять `inputRequests`, у которых `mode` равен `url` |
| `sampling/createMessage` | Не включать. Механизм устарел и передаёт запрос сервера в модель клиента | Клиент объявляет `sampling: {}` | Не объявлять capability и отклонять `method` внутри `inputRequests` |
| `roots/list` | Не включать. Механизм устарел и раскрывает каталоги клиента | Клиент объявляет `roots: {}` | Не объявлять capability и отклонять `method` внутри `inputRequests` |
| `notifications/message` | Не включать. Журнальный канал устарел и не имеет строгой схемы данных | Сервер объявляет `logging: {}` | Не объявлять capability и отклонять это уведомление |
| `experimental`, `extensions`, tasks | Не включать до отдельного согласования конкретного расширения | Явный ключ в `experimental` или `extensions` | Любой неизвестный ключ capability отклоняется |

Одного объявления capability недостаточно. Для включения нужны все применимые звенья: capability у клиента или сервера, разрешение метода на сервисе 2, схема SOWA и реализация на обеих сторонах. Для `requestState` capability нет, поэтому его можно запретить или разрешить только схемой ответа.
