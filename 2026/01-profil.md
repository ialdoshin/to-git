# Профиль MCP 2026-07-28

[Оглавление](README.md)

## Отличие от V1 и V2

Архитектура остаётся прежней:

```text
Сервис 1 → Сервис 2 → SOWA → Сервис 4
```

- **Сервис 1** — MCP-клиент.
- **Сервис 2** — policy-прокси.
- **SOWA** — JSON Schema gateway.
- **Сервис 4** — MCP-сервер версии `2026-07-28`.

В этой версии протокол больше не имеет рукопожатия и протокольной сессии. Каждый POST самодостаточен.

Отличия от `2025-11-25`:

- нет `initialize` и `notifications/initialized`;
- нет `MCP-Session-Id`;
- нет `GET /mcp`, `DELETE /mcp` и `Last-Event-ID`;
- версия, `clientInfo` и `clientCapabilities` передаются в каждом запросе;
- заголовки `Mcp-Method` и `Mcp-Name` обязательны для вызова инструмента;
- ответ содержит `resultType`;
- оборванный SSE нельзя восстановить: результат становится `MCP_RESULT_UNKNOWN`.

`server/discover` не является инициализацией. Это необязательный запрос, которым клиент заранее узнаёт версии и capabilities сервера.

## Разрешённый профиль

Разрешены:

- `server/discover`;
- `tools/call`;
- `notifications/progress` внутри SSE-ответа того же POST;
- финальный результат `resultType: "complete"`;
- JSON-RPC `error`.

Клиент передаёт пустые capabilities:

```json
"io.modelcontextprotocol/clientCapabilities": {}
```

Пустой объект не выключает `resultType: "input_required"`. Он запрещает только вложенные `inputRequests`: без объявленной capability сервер не имеет права поместить внутрь `elicitation/create`, `sampling/createMessage` или `roots/list`. Ответ, в котором есть только `requestState`, остаётся допустимым по стандарту. Полный запрет `input_required` обеспечивает проверка JSON-ответа, а не capabilities.

В `result.content` разрешён только `type: "text"`. Запрещены `image`, `audio`, `resource_link` и встроенный `resource`.

Запрещены также:

- `tools/list` и `notifications/tools/list_changed`;
- `resources`, `prompts`, `logging`, `completions`;
- `subscriptions/listen`;
- tasks и прочие extensions;
- JSON-RPC batch;
- `GET`, `DELETE`, `PUT`, `PATCH`.

Маршрут выбирает MCP-сервер, а не отдельную тулу. Допустим путь `/mcp/{dzo}/{server}`. Новая тула существующего сервера не создаёт новый сетевой маршрут.
