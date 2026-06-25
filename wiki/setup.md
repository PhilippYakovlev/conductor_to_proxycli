---
title: "Запуск и Устранение неполадок"
category: "инструкции"
last_updated: 2026-06-25
sources:
  - "/run.sh"
  - "/docker-compose.yml"
---

# Развертывание стека и устранение неполадок

Стек SmartProxy разворачивается локально с использованием Docker Compose. Для управления запуском разработан скрипт `run.sh`.

## 🚀 Быстрый запуск

Для инициализации и запуска всех сервисов выполните следующую команду в корневой папке проекта `SmartProxy`:

```bash
./run.sh local
```

Этот скрипт:
1. Создаст/обновит конфигурационный файл `.env` на основе переданного аргумента `local`.
2. Запустит локальный инстанс `cli-proxy-api`.
3. Пересоберет Docker-образы и запустит контейнеры в фоновом режиме (`-d`).

После успешного завершения будут доступны следующие порты:
* **Smart Proxy (Conductor wrapper)**: `http://localhost:8317`
* **Панель управления SmartProxy**: `http://localhost:8317/admin`
* **Local CLI Proxy API**: `http://localhost:8319`
* **Admin Panel (CLI Proxy)**: `http://localhost:8319/management.html`
* **Claude Proxy (free-claude-code)**: `http://localhost:8082`

---

## 🛠️ Устранение неполадок

### Ошибка: "Conflict. The container name \"/cli-proxy-api\" is already in use"
При запуске `./run.sh` или `docker compose up` может возникнуть ошибка конфликта имен из-за контейнера `cli-proxy-api`, запущенного вне текущей сборки (например, из старой сессии или другого проекта).

**Решение**:
Остановите и удалите старый контейнер перед перезапуском:
```bash
docker rm -f cli-proxy-api
```
После этого повторно запустите:
```bash
./run.sh local
```

### Просмотр статуса и логов контейнеров

Проверить статус всех контейнеров стека:
```bash
docker compose ps
```

Посмотреть логи конкретного сервиса:
```bash
# Логи обертки-прокси (где отображается маппинг моделей)
docker logs -f smartproxy-wrapper

# Логи маршрутизатора API
docker logs -f cli-proxy-api

# Логи Claude прокси
docker logs -f free-claude-code
```
