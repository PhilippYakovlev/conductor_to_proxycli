# Conductor to proxycli — Инструкции для ИИ-агента

Этот репозиторий содержит умный прокси-сервер (`proxy_wrapper.js`), который позволяет перенаправлять запросы ассистента Conductor на локальный или удаленный `cli-proxy-api` (proxycli).

Если перед вами стоит задача отладки, модификации или поддержки этого прокси, обязательно ознакомьтесь с ключевыми архитектурными особенностями ниже.

## 1. Настройка окружения Conductor

Чтобы Conductor перенаправлял свои запросы на прокси, воркеру необходимы соответствующие переменные окружения. Поскольку macOS при запуске приложений через GUI (Finder/Dock) не передает пользовательские переменные, Conductor необходимо запускать из терминала с переданными переменными.

Для этого в репозитории подготовлены скрипты:
* **Запуск:** `./run_conductor.sh` (или `npm run conductor`) — автоматически соберет и запустит Docker-контейнер с прокси на порту 8317, а затем запустит Conductor с правильным окружением в фоне (логи перенаправляются в `/tmp/conductor_live.log`).
* **Остановка:** `./stop_conductor.sh` (или `npm run stop`) — корректно остановит Docker-контейнер и закроет Conductor.

Если вы настраиваете окружение вручную:
1. Обновите переменные окружения в SQLite базе данных Conductor на Mac.
Путь к базе: `/Users/<username>/Library/Application Support/com.conductor.app/conductor.db`.

Выполните следующие SQL-запросы:
```sql
UPDATE env_vars SET value = 'http://127.0.0.1:8317' WHERE key = 'CURSOR_BACKEND_URL';
UPDATE env_vars SET value = 'http://127.0.0.1:8317/v1' WHERE key = 'CURSOR_API_BASE_URL';
UPDATE env_vars SET value = 'http://127.0.0.1:8317' WHERE key = 'CURSOR_WEBSITE_URL';
UPDATE env_vars SET value = 'http://127.0.0.1:8317/v1' WHERE key = 'OPENAI_BASE_URL';
```

2. Запустите Conductor из терминала:
```bash
CURSOR_API_BASE_URL="http://127.0.0.1:8317/v1" \
CURSOR_BACKEND_URL="http://127.0.0.1:8317" \
CURSOR_WEBSITE_URL="http://127.0.0.1:8317" \
OPENAI_BASE_URL="http://127.0.0.1:8317/v1" \
/Applications/Conductor.app/Contents/MacOS/conductor
```

---

## 2. Ключевые архитектурные правила прокси (`proxy_wrapper.js`)

При работе с протоколом Connect RPC (используемым в Conductor/Cursor) помните о следующих граблях и решениях:

### А. Устранение дедлоков в Connect-стримах (метод `Run`)
* **Проблема:** Метод `/agent.v1.AgentService/Run` использует двусторонний Connect-стриминг. Если прокси-сервер будет ждать события завершения стрима запроса от воркера (`req.on('end')`), возникнет взаимная блокировка (deadlock): воркер не закрывает стрим запроса до получения первого кадра ответа, а прокси не отвечает до закрытия запроса.
* **Решение:** Прокси должен начинать отвечать (`startStreamingResponse`) **немедленно** при получении первого кадра `runRequest`, не дожидаясь события окончания запроса `end`.

### Б. Строгая проверка `Content-Type: application/proto`
* **Проблема:** Воркер Conductor использует библиотеку `@connectrpc/connect` (версии `1.7.0`+), которая строго требует, чтобы ответы на унарные gRPC/Connect запросы (с заголовком `content-type: application/proto`) возвращались с тем же типом `Content-Type: application/proto`. Если вернуть JSON (`application/json`), воркер упадет с ошибкой `ConnectError: [internal] unsupported content type application/json`.
* **Решение:** Все перехваченные служебные методы должны отвечать через вспомогательную функцию `sendUnaryResponse`, которая проверяет заголовок и сериализует Protobuf-ответ (или отдает пустой буфер `Buffer.alloc(0)` для пустых сообщений).

### В. Динамическое патчение SDK в памяти
* **Проблема:** Прокси-серверу необходимы классы Protobuf для разбора и сборки Connect RPC сообщений. Но они зашиты внутри обфусцированного вебпак-бандла `@cursor/sdk`.
* **Решение:** Прокси при запуске считывает JS-код SDK (`sdk/dist/cjs/index.js`), патчит его в памяти для экспорта статических классов Protobuf и webpack-загрузчика `__webpack_require__` в `globalThis`, а затем динамически загружает их.

### Г. Обработка служебных методов (Mocks)
Чтобы воркер не падал с ошибкой `ConnectError: [unimplemented] HTTP 404`, прокси заглушает следующие Connect RPC методы на порту `8317`:
* `/aiserver.v1.DashboardService/GetUserPrivacyMode` (возвращает `mWk` класс)
* `/aiserver.v1.DashboardService/GetTeamAdminSettingsOrEmptyIfNotInTeam` (возвращает `V5U` класс)
* `/aiserver.v1.DashboardService/GetTeamReposOrEmptyIfNotInTeam` (возвращает `k1F` класс)
* `/aiserver.v1.AnalyticsService/TrackEvents` (возвращает пустой Protobuf-буфер)
* `/aiserver.v1.AnalyticsService/BootstrapStatsig` (возвращает JSON-конфиг)

Если в логах воркера Conductor появится ошибка `exited with code 1` или `HTTP 404`, проверьте, не добавил ли Conductor новые служебные Connect RPC вызовы. Добавьте для них аналогичные перехватчики в `proxy_wrapper.js`.
