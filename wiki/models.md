---
title: "Маппинг моделей и Проксирование"
category: "логика"
last_updated: 2026-06-25
sources:
  - "/smart-proxy/proxy_wrapper.js"
  - "/.env"
---

# Маппинг моделей и Проксирование запросов

Для корректной работы Conductor с альтернативными моделями (например, GPT-5.5 / GPT-5.4) прокси-сервер `smart-proxy` (`proxy_wrapper.js`) перехватывает запросы и сопоставляет модели с внутренними эндпоинтами.

## ⚙️ Настройка моделей в `.env`
Переменные окружения задают маппинг моделей, используемых Conductor:
```env
CONDUCTOR_GEMINI_MODEL=gemini-3.5-flash-low
CONDUCTOR_HAIKU_MODEL=cliproxy/claude-haiku-4-5-20251001
CONDUCTOR_CLAUDE_MODEL=cliproxy/claude-sonnet-4-6
CONDUCTOR_OPUS_MODEL=cliproxy/claude-opus-4-8
CONDUCTOR_SONNET_MODEL=cliproxy/claude-sonnet-4-6
CONDUCTOR_CODEX_MODEL=cliproxy/gpt-5.4
```

---

## 🔍 Логика перехвата эндпоинтов

`proxy_wrapper.js` слушает порт `8317` и перехватывает два основных типа запросов от Codex:

### 1. Чат-запросы (`/v1/chat/completions`)
Стандартный эндпоинт генерации ответов. Прокси считывает поле `model` из JSON-тела запроса и логирует его соответствие.

### 2. Запросы Codex Responses API (`/v1/responses`)
Эндпоинт, специфичный для Codex Runtime. Ранее запросы на этот эндпоинт пролетали сквозь прокси без логов маппинга. 
* **Фикс**: Мы добавили обработку эндпоинта `/v1/responses` в `proxy_wrapper.js`.
* **Как это работает**: Прокси парсит тело запроса, декодирует структуру (включая `agent_pb` и `turn`), извлекает название модели и выводит лог соответствия (например, `GPT-5.5` -> `cliproxy/gpt-5.4`) в консоль контейнера `smartproxy-wrapper`.

---

## 🪵 Формат логов в консоли SmartProxy
При прохождении запроса через прокси в логах контейнера `smartproxy-wrapper` отображается подробный маппинг:

```text
[Proxy Wrapper] Incoming POST request on /v1/responses
[Proxy Wrapper] Session model mapping: Codex -> cliproxy/gpt-5.4
[Proxy Wrapper] Sending request to backend http://cli-proxy-api:8319/v1/responses...
[Proxy Wrapper] Response status: 200 OK
```

Это позволяет оперативно отслеживать, какая именно модель была запрошена редактором Conductor и куда был направлен запрос.
