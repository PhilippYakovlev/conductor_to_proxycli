# Conductor to proxycli (Smart Proxy)

Проект представляет собой умный прокси-сервер для интеграции **Conductor** (AI-ассистент) с локальным **cli-proxy-api** (proxycli).

Прокси-сервер транслирует Connect RPC стримы (`Run` Composer-запросы) из Conductor в стандартные OpenAI-совместимые chat-completion запросы, перехватывает служебные Connect-запросы (`GetUserPrivacyMode`, `GetTeamAdminSettings`, и др.) и подменяет имя запрашиваемой модели на выбранную модель Gemini.

## Установка и запуск

### 1. Подготовка
Скопируйте `.env.example` в `.env` и настройте переменные:
```bash
cp .env.example .env
```

### 2. Быстрый запуск (Прокси в Docker + Conductor на Mac)
Для автоматического запуска прокси в Docker-контейнере и открытия Conductor с правильными переменными окружения используйте скрипт:
```bash
./run_conductor.sh
# или через npm:
npm run conductor
```
Это действие:
1. Запустит Docker Compose в фоне.
2. Откроет Conductor на macOS с проброшенными переменными `CURSOR_BACKEND_URL`, `CURSOR_API_BASE_URL` и др., гарантируя, что воркер Composer будет направлять запросы на локальный прокси-сервер.

Логи Conductor при этом будут писаться в `/tmp/conductor_live.log`.

Для остановки прокси и закрытия Conductor выполните:
```bash
./stop_conductor.sh
# или через npm:
npm run stop
```

---

### 3. Ручной запуск и отладка

Если вы хотите запустить только прокси-сервер в Docker:
```bash
docker compose up -d --build
```
Прокси-сервер подниется на порту `8317`.

Чтобы Conductor использовал прокси, необходимо прописать в его локальную SQLite базу данных (`/Users/<username>/Library/Application Support/com.conductor.app/conductor.db`, таблица `env_vars`) адрес `http://127.0.0.1:8317`:

```sql
UPDATE env_vars SET value = 'http://127.0.0.1:8317' WHERE key = 'CURSOR_BACKEND_URL';
UPDATE env_vars SET value = 'http://127.0.0.1:8317/v1' WHERE key = 'CURSOR_API_BASE_URL';
UPDATE env_vars SET value = 'http://127.0.0.1:8317' WHERE key = 'CURSOR_WEBSITE_URL';
UPDATE env_vars SET value = 'http://127.0.0.1:8317/v1' WHERE key = 'OPENAI_BASE_URL';
```

После этого обязательно запустите Conductor с соответствующими системными переменными окружения из терминала (иначе macOS GUI сбросит их):
```bash
CURSOR_API_BASE_URL="http://127.0.0.1:8317/v1" \
CURSOR_BACKEND_URL="http://127.0.0.1:8317" \
CURSOR_WEBSITE_URL="http://127.0.0.1:8317" \
OPENAI_BASE_URL="http://127.0.0.1:8317/v1" \
/Applications/Conductor.app/Contents/MacOS/conductor
```
