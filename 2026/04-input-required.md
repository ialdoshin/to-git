# input_required

[Оглавление](README.md)

## Если input_required разрешён

`input_required` приходит как обычный JSON-RPC-результат на тот же POST. Это HTTP `200`, а не ошибка. Вызов инструмента при этом ещё не закончен.

Клиент читает поля в таком порядке:

1. Для каждого элемента `inputRequests` выполняет действие, указанное в его `method`.
2. Если поля `inputRequests` нет, спрашивать ничего не нужно.
3. Если есть `requestState`, копирует строку в повтор без разбора.
4. Если `requestState` нет, не придумывает его.
5. Отправляет новый POST с новым JSON-RPC `id`, тем же `name` и `arguments`.

`inputResponses` добавляется только тогда, когда в исходном ответе было поле `inputRequests`. Ключи ответов совпадают с ключами запросов. Оба поля лежат в `params` рядом с `name` и `arguments`. В повторе по-прежнему обязателен `_meta`: версия, `clientInfo` и `clientCapabilities`.

Первый запрос для всех вариантов ниже одинаков по маршруту и аргументам. Меняются `clientCapabilities`, тело ответа и состав повтора.

## Общий вид повтора

Ответ сервера:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "inputRequests": {},
    "requestState": "opaque-state"
  }
}
```

Повтор клиента. `id` новый, `name` и `arguments` те же, `requestState` скопирован:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {},
    "requestState": "opaque-state",
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

Тот же результат может прийти последним событием SSE на исходном POST. Отдельного GET нет:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"jsonrpc":"2.0","id":18,"result":{"resultType":"input_required","requestState":"opaque-state"}}

```

### Вариант A. Только requestState

Этот вариант прямо приведён в спецификации как load shedding: [InputRequiredResult](https://modelcontextprotocol.io/specification/2026-07-28/schema). Правила немедленного повтора описаны в [Multi Round-Trip Requests](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr). Capability для него не нужна.

Запрос:

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
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Ответ. Поля `inputRequests` нет. Строка `requestState` взята из примера load shedding в схеме:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "requestState": "eyJwcm9ncmVzcyI6IjUwJSIsInN0YXRlIjoicHJvY2Vzc2luZyJ9"
  }
}
```

Клиент не показывает вопрос и сразу отправляет новый `tools/call`. `inputResponses` не добавляет:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "requestState": "eyJwcm9ncmVzcyI6IjUwJSIsInN0YXRlIjoicHJvY2Vzc2luZyJ9",
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

Ответ на повтор, если данных уже хватает:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
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

Сервер таким первым ответом освобождает текущий HTTP-запрос и при повторе продолжает ту же работу.

### Вариант B. Пустой inputRequests и requestState

Отдельного примера для пустой карты вопросов в спецификации нет. Показанный выше пример варианта A поле `inputRequests` просто не содержит. Пустая карта допустима синтаксически, но нового сценария не создаёт: вопросов по-прежнему нет, а продолжение работы обеспечивает тот же `requestState`.

Запрос совпадает с вариантом A. Ответ:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "inputRequests": {},
    "requestState": "eyJwcm9ncmVzcyI6IjUwJSIsInN0YXRlIjoicHJvY2Vzc2luZyJ9"
  }
}
```

Повтор. Пустая карта даёт пустой `inputResponses`:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {},
    "requestState": "eyJwcm9ncmVzcyI6IjUwJSIsInN0YXRlIjoicHJvY2Vzc2luZyJ9",
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

Ответ на повтор — такой же `complete`, как в варианте A. Ссылки те же: [схема InputRequiredResult](https://modelcontextprotocol.io/specification/2026-07-28/schema) и [правила повтора](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr).

### Вариант C. Форма

Сервер имеет право отправить этот вариант только при объявленной capability `elicitation`. Объект `elicitation: {}` разрешает только form.

Запрос:

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
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "form": {}
        }
      }
    }
  }
}
```

Ответ. Поле `mode` можно не передавать: клиент считает его формой. `requestState` сервер здесь не прислал, поэтому в повторе его нет:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "confirm_city": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "Подтвердите город",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    }
  }
}
```

Повтор, если пользователь подтвердил форму. `content` есть только при `accept`:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {
      "confirm_city": {
        "action": "accept",
        "content": {
          "city": "Warsaw"
        }
      }
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "form": {}
        }
      }
    }
  }
}
```

Ответ на подтверждение:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
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

Отказ и отмена тоже отправляются серверу: это обычный ответ на вопрос, а не обрыв соединения. Меняется только `inputResponses`.

Отказ:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {
      "confirm_city": {
        "action": "decline"
      }
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "form": {}
        }
      }
    }
  }
}
```

Ответ на отказ. Сервер сам решает, чем закончить вызов. Здесь это готовый результат инструмента:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
  "result": {
    "resultType": "complete",
    "content": [
      {
        "type": "text",
        "text": "Город не подтверждён"
      }
    ],
    "isError": false
  }
}
```

Отмена:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {
      "confirm_city": {
        "action": "cancel"
      }
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "form": {}
        }
      }
    }
  }
}
```

Ответ на отмену:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
  "result": {
    "resultType": "complete",
    "content": [
      {
        "type": "text",
        "text": "Запрос отменён"
      }
    ],
    "isError": false
  }
}
```

### Вариант D. Внешняя ссылка

Нужна capability `elicitation.url`.

Запрос:

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
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "url": {}
        }
      }
    }
  }
}
```

Ответ:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "requestState": "opaque-state",
    "inputRequests": {
      "api_key": {
        "method": "elicitation/create",
        "params": {
          "mode": "url",
          "message": "Укажите ключ на сайте сервера",
          "url": "https://mcp.example.com/ui/set_api_key"
        }
      }
    }
  }
}
```

Клиент открывает URL и не получает введённые там секретные данные. `accept` означает только согласие открыть внешнюю страницу:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {
      "api_key": {
        "action": "accept"
      }
    },
    "requestState": "opaque-state",
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "url": {}
        }
      }
    }
  }
}
```

Результат операции сервер определяет по `requestState`. Он может вернуть `complete`:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
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

Либо ещё один `input_required`, если данных всё ещё не хватает. Пример такого ответа есть ниже, в разделе про ответ на повтор.

### Вариант E. Запрос к модели

Нужна capability `sampling`. Для собственного списка tools внутри запроса нужна ещё `sampling.tools`. В примере ниже своего списка tools нет, поэтому достаточно `sampling`.

Запрос:

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
      "io.modelcontextprotocol/clientCapabilities": {
        "sampling": {}
      }
    }
  }
}
```

Ответ:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "capital": {
        "method": "sampling/createMessage",
        "params": {
          "messages": [
            {
              "role": "user",
              "content": {
                "type": "text",
                "text": "Какая столица Франции?"
              }
            }
          ],
          "maxTokens": 100
        }
      }
    }
  }
}
```

Клиент сам выбирает модель, показывает запрос пользователю и возвращает ответ модели:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {
      "capital": {
        "role": "assistant",
        "content": {
          "type": "text",
          "text": "Париж"
        },
        "model": "model-name",
        "stopReason": "endTurn"
      }
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "sampling": {}
      }
    }
  }
}
```

Ответ на повтор:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
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

### Вариант F. Список каталогов

Нужна capability `roots`. В `2026-07-28` механизм устарел.

Запрос:

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
      "io.modelcontextprotocol/clientCapabilities": {
        "roots": {}
      }
    }
  }
}
```

Ответ:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "inputRequests": {
      "workspace": {
        "method": "roots/list"
      }
    }
  }
}
```

Повтор. Ответ содержит разрешённые клиентом адреса:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {
      "workspace": {
        "roots": [
          {
            "uri": "file:///workspace/project",
            "name": "project"
          }
        ]
      }
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "roots": {}
      }
    }
  }
}
```

Ответ на повтор:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
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

### Вариант G. Несколько вопросов сразу

В одной карте `inputRequests` могут одновременно быть form, URL, sampling и roots. Клиент выполняет все элементы и складывает ответы под теми же ключами в один `inputResponses`. Повторный POST при этом один. В первом запросе должны быть объявлены все используемые capabilities.

Запрос:

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
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "form": {},
          "url": {}
        },
        "sampling": {},
        "roots": {}
      }
    }
  }
}
```

Ответ:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 18,
  "result": {
    "resultType": "input_required",
    "requestState": "opaque-state",
    "inputRequests": {
      "confirm_city": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "Подтвердите город",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      },
      "api_key": {
        "method": "elicitation/create",
        "params": {
          "mode": "url",
          "message": "Укажите ключ на сайте сервера",
          "url": "https://mcp.example.com/ui/set_api_key"
        }
      },
      "capital": {
        "method": "sampling/createMessage",
        "params": {
          "messages": [
            {
              "role": "user",
              "content": {
                "type": "text",
                "text": "Какая столица Франции?"
              }
            }
          ],
          "maxTokens": 100
        }
      },
      "workspace": {
        "method": "roots/list"
      }
    }
  }
}
```

Повтор. Один POST содержит все четыре ответа и копию `requestState`:

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
  "id": 19,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "city": "Warsaw"
    },
    "inputResponses": {
      "confirm_city": {
        "action": "accept",
        "content": {
          "city": "Warsaw"
        }
      },
      "api_key": {
        "action": "accept"
      },
      "capital": {
        "role": "assistant",
        "content": {
          "type": "text",
          "text": "Париж"
        },
        "model": "model-name",
        "stopReason": "endTurn"
      },
      "workspace": {
        "roots": [
          {
            "uri": "file:///workspace/project",
            "name": "project"
          }
        ]
      }
    },
    "requestState": "opaque-state",
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "service-1",
        "version": "1.0.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {
        "elicitation": {
          "form": {},
          "url": {}
        },
        "sampling": {},
        "roots": {}
      }
    }
  }
}
```

Ответ на повтор:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
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

Неизвестный `method` клиент не интерпретирует. Он завершает вызов ошибкой и повторно `tools/call` не отправляет.

## Что сервер отвечает на повтор

На повторный `tools/call` сервер снова выбирает один из трёх вариантов. Ниже все три показаны как ответ на один и тот же повтор с `id` 19. Это альтернативы, а не три сообщения подряд.

Готовый результат:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
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

Ошибка. Клиент ничего не переспрашивает:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
  "error": {
    "code": -32602,
    "message": "Неверные аргументы"
  }
}
```

Ещё один `input_required`. Клиент снова собирает ответы и отправляет новый POST уже с `id` 20:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 19,
  "result": {
    "resultType": "input_required",
    "requestState": "opaque-state-2",
    "inputRequests": {
      "confirm_city": {
        "method": "elicitation/create",
        "params": {
          "mode": "form",
          "message": "Уточните город ещё раз",
          "requestedSchema": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    }
  }
}
```

Цикл заканчивается, когда приходит `complete` или `error`, либо когда клиент исчерпал свой лимит повторов.

## Ограничение текущего профиля

Пустые capabilities запрещают варианты C–G. Вариант A стандарт при этом не запрещает. Поэтому сервис 2 дополнительно отклоняет любой JSON, где `resultType` не равен `complete`. Сервис 4 в текущем профиле сразу возвращает `complete` или `error`, а сервис 1 повтор с `inputResponses` не выполняет.
