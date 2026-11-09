# MCP 2026-07-28

Описание версии без сессии и `initialize`. Архитектура прежняя: сервис 1, сервис 2, SOWA и сервис 4.

## С чего читать

1. [Профиль и отличия от 2025-11-25](01-profil.md)
2. [Вызов: discover, tools/call, progress и итоговые ответы](03-vyzov.md)
3. [Требования к сервисам, ошибки и диаграммы](06-trebovaniya.md)

## Справочные разделы

- [Capabilities и контроль функций](02-capabilities.md)
- [input_required: все варианты сообщений](04-input-required.md)
- [Все методы и что можно разрешить позже](05-metody.md)
- [Заголовки запроса и ответа](07-zagolovki.md)

## Диаграммы

- [server/discover](../diagrams/2026-01-discover.puml)
- [tools/call с JSON-ответом](../diagrams/2026-02-tool-call-json.puml)
- [tools/call с SSE и progress](../diagrams/2026-03-tool-call-sse-progress.puml)
- [Отклонённый input_required](../diagrams/2026-04-input-required.puml)

## Другие версии

- [V1 — MCP 2025-11-25, GET запрещён](../README.md)
- [V2 — MCP 2025-11-25, GET и SSE resume](../V2.md)
