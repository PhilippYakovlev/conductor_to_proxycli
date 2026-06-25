---
title: "Интеграция с Conductor"
category: "инструкции"
last_updated: 2026-06-25
sources:
  - "/smart-proxy/codex_wrapper.sh"
  - "/Users/filippakovlev/conductor/workspaces/backend/taipei-v1/.conductor/settings.local.toml"
---

# Интеграция с редактором Conductor

Conductor использует бинарник `codex` для взаимодействия с языковыми моделями. По умолчанию он не позволяет подменять базовый URL (`OPENAI_BASE_URL`), если его не передала родительская сессия. Нам удалось обойти это ограничение без нарушения целостности приложения.

## ⚠️ Почему нельзя изменять бинарник напрямую?
Попытки пропатчить скомпилированный бинарник `conductor-runtime` или `codex` приводят к тому, что операционная система macOS немедленно завершает процесс сигналом **`SIGKILL`** из-за нарушения цифровой подписи (Code Signing).

---

## 🛠️ Решение: Использование `codex_executable_path`

Мы используем штатную возможность переопределения пути к исполняемому файлу Codex через настройки воркспейса Conductor.

### Шаг 1. Создание скрипта-обертки `codex_wrapper.sh`
Мы создали скрипт `/Users/filippakovlev/PycharmProjects/conductor_to_proxycli/codex_wrapper.sh`:
```bash
#!/bin/bash
# Переопределяем URL на локальный SmartProxy
export OPENAI_BASE_URL="http://127.0.0.1:8317/v1"
# Запускаем оригинальный бинарник Codex с сохранением всех аргументов
exec "/Users/filippakovlev/Library/Application Support/com.conductor.app/agent-binaries/codex/0.138.0/codex" "$@"
```

### Шаг 2. Конфигурация воркспейса `settings.local.toml`
Конфигурационный файл необходимо расположить в корневой папке вашего активного воркспейса Conductor (например, `/Users/filippakovlev/conductor/workspaces/backend/taipei-v1/.conductor/settings.local.toml`):

```toml
"$schema" = "https://conductor.build/schemas/settings.repo.schema.json"
codex_executable_path = "/Users/filippakovlev/PycharmProjects/conductor_to_proxycli/codex_wrapper.sh"
```

> [!IMPORTANT]
> Обратите внимание: Conductor копирует файлы проекта во внутреннюю изолированную папку воркспейса при запуске. Поэтому файл `settings.local.toml` обязательно должен присутствовать именно по пути активного воркспейса (например, `taipei-v1`), иначе настройки переопределения не вступят в силу.

---

## 🔄 Перезапуск сессии Conductor

Чтобы применить настройки, перезапустите Codex/Conductor. Это можно сделать через вызов Launch Daemon:
```bash
curl http://127.0.0.1:8318/launch
```
После этого Codex начнет использовать `codex_wrapper.sh`, и запросы пойдут через локальный порт `8317`.
