# SmartProxy Unified Stack

**English** | [Русский](README_RU.md) | [中文](README_ZH.md)

> [!IMPORTANT]
> **INSTRUCTIONS FOR AI AGENTS (If you are an agent and reading this):**
> 1. **Be sure to study the project Wiki** before starting work. The main catalog file is located at **[wiki/index.md](wiki/index.md)**. It describes the architecture, integration, and nuances of the stack.
> 2. **How to install and run the project:**
>    * Make sure Docker is running on the host.
>    * Stop and remove the old conflicting container (if it remains in the system): `docker rm -f cli-proxy-api`.
>    * Run the entire stack in local mode: `./run.sh local`.
>    * Read details on installation and debugging in **[wiki/setup.md](wiki/setup.md)**.
> 3. **How to read proxy logs:** All information about intercepting requests from Conductor and mapping models is written to the logs of the wrapper container: `docker logs -f smartproxy-wrapper`.
> 4. **Do not break the macOS code signature:** Do not attempt to modify Conductor binaries on disk (this will cause a `SIGKILL`). Make all configurations via the workspace `.conductor/settings.local.toml` and the [codex_wrapper.sh](smart-proxy/codex_wrapper.sh) script.

---

## 🎯 About the Project and Goal

**Conductor IDE** is an incredibly convenient development tool, but out of the box, it does not support custom AI providers.

**SmartProxy** was created to solve this problem. The core idea is to allow developers to connect their entire stack of subscriptions and APIs (including personal proxies, custom endpoints, and alternative providers) directly to Conductor.

> [!NOTE]
> Recently, the Conductor development team released a new feature called **"OpenCode Integration"**. This is a great step forward, and we thank them for it! However, at the moment, this feature is still in beta and has some bugs in our workflow. Therefore, the local **SmartProxy** stack remains our primary stable solution for now.

### 🌟 Key Features:
* **Custom Model Mapping:** The project supports flexible mapping of Conductor's internal models (e.g., `gpt-5.5` or `gpt-5.4`) to any of your custom models from third-party providers (via `smart-proxy` and `cli-proxy-api`).
* **On-the-fly Logging & Debugging:** Intercepting and logging incoming RPC/HTTP requests (including `/v1/chat/completions` and `/v1/responses` endpoints for Codex).
* **Support for Alternative Models (Claude):** The built-in local `free-claude-code` adapter allows transparent proxying to Claude models with full support for the reasoning (`thinking`) mode.

---

This repository unites all adjacent proxy server projects into a single structure with a shared Docker environment:

1. **`cli-proxy-api`** (local or remote proxy server backend).
2. **`smart-proxy`** (smart proxy server `proxy_wrapper.js` for intercepting and translating Conductor/Composer RPC requests).
3. **`free-claude-code`** (adapter for running the Claude Code utility through our proxy).

---

## 📚 Documentation and Knowledge Base (Wiki)

A detailed knowledge base based on the "LLM Wiki" concept has been developed for the project, located in the **[wiki/](wiki/)** folder:
* **[wiki/index.md](wiki/index.md)** — Main table of contents and catalog of all Wiki pages.
* **[wiki/architecture.md](wiki/architecture.md)** — Interaction schema and detailed stack architecture.
* **[wiki/setup.md](wiki/setup.md)** — Instructions for deploying the Docker stack and debugging.
* **[wiki/conductor.md](wiki/conductor.md)** — Guide to integrating with Conductor and bypassing macOS protection.
* **[wiki/models.md](wiki/models.md)** — Principles of model mapping in the smart proxy.
* **[wiki/log.md](wiki/log.md)** — Chronology of project changes.

### 🤖 Instructions for AI Agents (Codex, Claude, Gemini)
Special agent configuration files have been created in the root of the project: **[agents.md](agents.md)**, **[claude.md](claude.md)**, and **[gemini.md](gemini.md)**.

---

## Quick Start

A `run.sh` script is provided to manage the stack. It automatically configures the environment and starts the required containers.

### Option A: Local Run (starts local `cli-proxy-api` on port 8319)
```bash
./run.sh local
```
This starts:
* **`smart-proxy`** on port `8317`
* **`free-claude-code`** on port `8082`
* **`cli-proxy-api`** on port `8319` (and its control panel: `http://localhost:8319/management.html`)

### Option B: Remote Run (local `cli-proxy-api` is not started)
Pass the IP address or domain of the remote server as an argument:
```bash
./run.sh 90.156.253.38
```
This starts only:
* **`smart-proxy`** on port `8317` (redirects requests to the remote server `90.156.253.38:8319`)
* **`free-claude-code`** on port `8082`

---

## Configuration

All settings are saved in the root `.env` file. You can manually edit the following parameters:

* `BASE_URL` — `local` or the IP address of the remote server.
* `PORT` — smart proxy port (default `8317`).
* `CLAUDE_PORT` — Claude Code adapter port (default `8082`).
* `CLIPROXY_API_KEY` — API key for authorization.
* `CONDUCTOR_*` — default model selection for Conductor assistant.

---

## Container Architecture

* **Networking:** All containers run in a single virtual Docker network. `free-claude-code` accesses `smart-proxy` directly via the internal host name `http://smart-proxy:8317/v1`.
* **Autostart:** The `restart: always` policy is set for all services. They will start automatically on Docker/system startup.
