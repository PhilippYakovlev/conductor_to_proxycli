# SmartProxy Unified Stack

[English](README.md) | [Русский](README_RU.md) | **中文**

> [!IMPORTANT]
> **人工智能代理指令（如果你是代理并且正在阅读此内容）：**
> 1. **开始工作前，请务必学习项目的 Wiki**。主目录文件位于 **[wiki/index.md](wiki/index.md)**。它描述了该套件的架构、集成以及注意事项。
> 2. **如何安装和运行项目：**
>    * 确保主机上已运行 Docker。
>    * 停止并删除冲突的旧容器（如果系统中仍存在）：`docker rm -f cli-proxy-api`。
>    * 在本地模式下运行整个套件：`./run.sh local`。
>    * 在 **[wiki/setup.md](wiki/setup.md)** 中阅读有关安装和调试 carbon 的详细信息。
> 3. **如何读取代理日志：** 有关拦截来自 Conductor 的请求和映射模型的所有信息都写入包装器容器的日志中：`docker logs -f smartproxy-wrapper`。
> 4. **请勿破坏 macOS 代码签名：** 请勿尝试修改磁盘上的 Conductor 二进制文件（这会导致 `SIGKILL`）。通过工作区 `.conductor/settings.local.toml` 和 [codex_wrapper.sh](smart-proxy/codex_wrapper.sh) 脚本进行所有配置。

---

该仓库将所有相邻的代理服务器项目统一到一个具有共享 Docker 环境的单一结构中：

1. **`cli-proxy-api`**（本地或远程代理服务器后端）。
2. **`smart-proxy`**（智能代理服务器 `proxy_wrapper.js`，用于拦截和转发 Conductor/Composer RPC 请求）。
3. **`free-claude-code`**（通过我们的代理运行 Claude Code 工具的适配器）。

---

## 📚 文档和知识库 (Wiki)

我们为项目开发了基于 “LLM Wiki” 概念 carbon 的详细知识库，位于 **[wiki/](wiki/)** 文件夹中：
* **[wiki/index.md](wiki/index.md)** — Wiki 所有页面的主目录和索引。
* **[wiki/architecture.md](wiki/architecture.md)** — 交互方案和详细的堆栈架构。
* **[wiki/setup.md](wiki/setup.md)** — 部署 Docker 堆栈和调试的说明。
* **[wiki/conductor.md](wiki/conductor.md)** — 与 Conductor 集成并绕过 macOS 保护的指南。
* **[wiki/models.md](wiki/models.md)** — 智能代理中模型映射的原理。
* **[wiki/log.md](wiki/log.md)** — 项目变更历史。

### 🤖 人工智能代理指令 (Codex, Claude, Gemini)
在项目根目录下创建了专用的代理配置文件：**[agents.md](agents.md)**、**[claude.md](claude.md)** 和 **[gemini.md](gemini.md)**。

---

## 快速开始

提供了一个 `run.sh` 脚本来管理堆栈。它会自动配置环境并启动所需的容器。

### 选项 A：本地运行（在端口 8319 上启动本地 `cli-proxy-api`）
```bash
./run.sh local
```
这会启动：
* 端口 `8317` 上的 **`smart-proxy`**
* 端口 `8082` 上的 **`free-claude-code`**
* 端口 `8319` 上的 **`cli-proxy-api`**（以及它的控制面板：`http://localhost:8319/management.html`）

### 选项 B：远程运行（不启动本地 `cli-proxy-api`）
将远程服务器的 IP 地址或域名作为参数传递：
```bash
./run.sh 90.156.253.38
```
这仅启动：
* 端口 `8317` 上的 **`smart-proxy`**（将请求重定向到远程服务器 `90.156.253.38:8319`）
* 端口 `8082` 上的 **`free-claude-code`**

---

## 配置

所有设置都保存在根目录下的 `.env` 文件中。您可以手动编辑以下参数：

* `BASE_URL` — `local` 或远程服务器 of 的 IP 地址。
* `PORT` — 智能代理端口（默认 `8317`）。
* `CLAUDE_PORT` — Claude Code 适配器端口（默认 `8082`）。
* `CLIPROXY_API_KEY` — 用于身份验证的 API 密钥。
* `CONDUCTOR_*` — Conductor 助手的默认模型选择。

---

## 容器架构

* **网络互联：** 所有容器都运行在单个 Docker 虚拟网络中。`free-claude-code` 直接通过内部主机名 `http://smart-proxy:8317/v1` 访问 `smart-proxy`。
* **自动启动：** 为所有服务设置了 `restart: always` 策略。它们将在 Docker/系统启动时自动运行。
