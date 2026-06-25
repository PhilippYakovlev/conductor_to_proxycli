# Каталог Wiki SmartProxy

Этот файл содержит список всех страниц Wiki проекта SmartProxy с их кратким описанием и ссылками для быстрого перехода.

## 📌 Системные файлы Wiki
* [schema.md](schema.md) — Схема структуры, форматы страниц и правила работы с Wiki (Ingest, Query, Lint).
* [log.md](log.md) — Хронологический журнал изменений проекта и самой базы знаний.

## 📁 Разделы Wiki

### 1. Архитектура и компоненты
* [architecture.md](architecture.md) — Описание архитектуры всего стека (Conductor -> Wrapper -> Proxy API -> Providers).
* [models.md](models.md) — Маппинг моделей, перехват `/v1/responses` и логика проксирования.

### 2. Запуск и интеграция
* [setup.md](setup.md) — Пошаговое руководство по развертыванию Docker-стека и устранению конфликтов портов/имен.
* [conductor.md](conductor.md) — Интеграция с редактором Conductor, скрипт `codex_wrapper.sh` и обход подписи macOS.
