const fs = require('fs');
const path = require('path');
const Module = require('module');
const http = require('http');
const https = require('https');

// Буфер логов для веб-интерфейса
const logsBuffer = [];
function logToBuffer(message) {
  const time = new Date().toTimeString().split(' ')[0];
  logsBuffer.push({ time, message });
  if (logsBuffer.length > 500) {
    logsBuffer.shift();
  }
}

// Перехватываем вывод в консоль
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logToBuffer(msg);
};

console.error = function(...args) {
  originalConsoleError.apply(console, args);
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  logToBuffer(`[Error] ${msg}`);
};

// Настройки из переменных окружения (дефолтные)
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8317;

let TARGET_HOST = '127.0.0.1';
let TARGET_PORT = 8319;
let CLIPROXY_API_KEY = '';
let GEMINI_MODEL = '';
let CLAUDE_MODEL = '';
let CODEX_MODEL = '';

const CONFIG_FILE = path.join(__dirname, 'proxy_config.json');

let activeConfig = {
  targetHost: process.env.TARGET_HOST || 'host.docker.internal',
  targetPort: process.env.TARGET_PORT ? parseInt(process.env.TARGET_PORT) : 8319,
  cliproxyApiKey: process.env.CLIPROXY_API_KEY || 'sk-2v5P7lkMzyqoKfprLsk-WYRCtlilAEudjFXZn',
  mappings: {
    composer: process.env.CONDUCTOR_GEMINI_MODEL || 'gemini-3.5-flash-low',
    opus_4_8: 'claude-opus-4-8',
    opus_4_7: 'claude-opus-4-7',
    opus_4_6: 'claude-opus-4-6',
    sonnet_4_6_1m: 'claude-sonnet-4-6',
    sonnet_4_6: 'claude-sonnet-4-6',
    haiku_4_5: 'claude-haiku-4-5-20251001',
    codex: process.env.CONDUCTOR_CODEX_MODEL || 'cliproxy/fast-edit',
    gpt_5_5: 'gpt-5.5',
    gpt_5_4: 'gpt-5.4'
  }
};

function applyConfig(config) {
  TARGET_HOST = config.targetHost;
  TARGET_PORT = config.targetPort;
  CLIPROXY_API_KEY = config.cliproxyApiKey;
  GEMINI_MODEL = config.mappings.composer || 'gemini-3.5-flash-low';
  CLAUDE_MODEL = config.mappings.sonnet_4_6 || 'claude-sonnet-4-6';
  CODEX_MODEL = config.mappings.codex || 'cliproxy/fast-edit';
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const json = JSON.parse(data);
      activeConfig = {
        targetHost: json.targetHost || activeConfig.targetHost,
        targetPort: json.targetPort || activeConfig.targetPort,
        cliproxyApiKey: json.cliproxyApiKey !== undefined ? json.cliproxyApiKey : activeConfig.cliproxyApiKey,
        mappings: {
          ...activeConfig.mappings,
          ...(json.mappings || {})
        }
      };
      console.log('[Proxy Wrapper] Loaded configuration from proxy_config.json');
    } else {
      saveConfig(activeConfig);
    }
  } catch (e) {
    console.error('[Proxy Wrapper] Failed to load configuration:', e.message);
  }
  applyConfig(activeConfig);
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    activeConfig = config;
    applyConfig(activeConfig);
    console.log('[Proxy Wrapper] Configuration saved to proxy_config.json and applied');
  } catch (e) {
    console.error('[Proxy Wrapper] Failed to save configuration:', e.message);
  }
}

// Загружаем при старте
loadConfig();

console.log('[Proxy Wrapper] Starting Conductor Smart Proxy with settings:');
console.log(`  PORT: ${PORT}`);
console.log(`  TARGET_HOST: ${TARGET_HOST}`);
console.log(`  TARGET_PORT: ${TARGET_PORT}`);
console.log(`  GEMINI_MODEL: ${GEMINI_MODEL}`);
console.log(`  CLAUDE_MODEL: ${CLAUDE_MODEL}`);
console.log(`  CODEX_MODEL: ${CODEX_MODEL}`);
console.log(`  CLIPROXY_API_KEY: ${CLIPROXY_API_KEY.substring(0, 10)}...`);

// Функция сопоставления (маппинга) моделей из Conductor в модели cli-proxy-api
function mapModel(modelName) {
  if (!modelName) {
    let result = activeConfig.mappings.composer || 'gemini-3.5-flash-low';
    return result.startsWith('cliproxy/') ? result.substring(9) : result;
  }
  
  let cleanModel = modelName;
  if (cleanModel.startsWith('cliproxy/')) {
    cleanModel = cleanModel.substring(9);
  }
  if (cleanModel.startsWith('conductor:')) {
    cleanModel = cleanModel.substring(10);
  }
  
  const lower = cleanModel.toLowerCase();
  let result = cleanModel;
  
  if (lower.includes('composer') || lower.includes('gemini')) {
    result = activeConfig.mappings.composer || 'gemini-3.5-flash-low';
  } else if (lower.includes('opus')) {
    result = activeConfig.mappings.opus_4_8 || 'claude-opus-4-8';
  } else if (lower.includes('sonnet')) {
    result = activeConfig.mappings.sonnet_4_6 || 'claude-sonnet-4-6';
  } else if (lower.includes('haiku')) {
    result = activeConfig.mappings.haiku_4_5 || 'claude-haiku-4-5-20251001';
  } else if (lower.includes('gpt-5.5') || lower.includes('gpt5.5')) {
    result = activeConfig.mappings.gpt_5_5 || 'gpt-5.5';
  } else if (lower.includes('gpt-5.4') || lower.includes('gpt5.4')) {
    result = activeConfig.mappings.gpt_5_4 || 'gpt-5.4';
  } else if (lower.includes('cursor-small') || lower.includes('fast-edit') || lower.includes('gpt-4o-mini') || lower.includes('codex') || lower.includes('gpt')) {
    result = activeConfig.mappings.codex || 'cliproxy/fast-edit';
  }
  
  if (result.startsWith('cliproxy/')) {
    result = result.substring(9);
  }
  return result;
}

// --- ИНИЦИАЛИЗАЦИЯ SDK ---
const originalResolveLookupPaths = Module._resolveLookupPaths;
Module._resolveLookupPaths = function (request, parent) {
  const paths = originalResolveLookupPaths(request, parent);
  if (paths) {
    paths.push(path.join(__dirname, 'node_modules'));
  }
  return paths;
};

let agentPb = null;
try {
  const sdkPath = path.join(__dirname, 'sdk', 'dist', 'cjs', 'index.js');
  let code = fs.readFileSync(sdkPath, 'utf8');
  
  // Патчим для экспорта в globalThis через статические блоки
  code = code.replace(
    'static typeName="agent.v1.AgentClientMessage";',
    'static typeName="agent.v1.AgentClientMessage"; static { globalThis.AgentClientMessage = this; }'
  );
  code = code.replace(
    'static typeName="agent.v1.AgentServerMessage";',
    'static typeName="agent.v1.AgentServerMessage"; static { globalThis.AgentServerMessage = this; }'
  );
  
  // Патчим экспорты webpack
  const target = 'module.exports=__webpack_exports__';
  const replacement = '__webpack_exports__.__webpack_require__ = __webpack_require__; module.exports=__webpack_exports__';
  code = code.replace(target, replacement);
  
  const tempPath = path.join(__dirname, 'patched_sdk_live.js');
  fs.writeFileSync(tempPath, code);
  
  require(tempPath);
  
  const wqr = require(tempPath).__webpack_require__;
  agentPb = wqr('../proto/dist/generated/agent/v1/agent_pb.js');
  globalThis.dashboardPb = wqr('../proto/dist/generated/aiserver/v1/dashboard_pb.js');
  
  // Dynamic extraction of internal protobuf classes for tool calls
  const xu = agentPb.xu;
  const toolCallField = xu.fields.list().find(f => f.name === 'tool_call');
  globalThis.ToolCall = toolCallField.T;
  
  const mcpToolCallField = globalThis.ToolCall.fields.list().find(f => f.name === 'mcp_tool_call');
  globalThis.McpToolCall = mcpToolCallField.T;
  
  const mcpArgsField = globalThis.McpToolCall.fields.list().find(f => f.name === 'args');
  globalThis.McpArgs = mcpArgsField.T;
  
  fs.unlinkSync(tempPath);
  console.log('[Proxy Wrapper] SDK and agent_pb initialized successfully!');
} catch (e) {
  console.error('[Proxy Wrapper] Error during SDK initialization:', e);
}

// --- ХЕЛПЕРЫ ДЛЯ ТРАНСЛЯТОРА ---

// Чтение Connect-стрима (поток кадров)
function parseConnectStream(req, onMessage, onEnd) {
  let buffer = Buffer.alloc(0);
  
  req.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 5) {
      const flag = buffer.readUInt8(0);
      const length = buffer.readUInt32BE(1);
      if (buffer.length >= 5 + length) {
        const messageBytes = buffer.subarray(5, 5 + length);
        buffer = buffer.subarray(5 + length);
        try {
          if (flag === 0) { // Данные
            const msg = globalThis.AgentClientMessage.fromBinary(messageBytes);
            onMessage(msg);
          }
        } catch (e) {
          console.error('[Proxy Wrapper] Failed to decode incoming client message:', e);
        }
      } else {
        break;
      }
    }
  });
  
  req.on('end', () => {
    onEnd();
  });
}

// Отправка кадра в Connect-стрим
function sendConnectFrame(res, message) {
  const bytes = message.toBinary();
  const header = Buffer.alloc(5);
  header.writeUInt8(0, 0); // флаг данных
  header.writeUInt32BE(bytes.length, 1); // длина
  res.write(header);
  res.write(bytes);
}

// Отправка EOS (End Of Stream) кадра
function sendEosFrame(res) {
  // EOS кадр имеет флаг 0x02 и тело "{}"
  const eosHeader = Buffer.from([0x02, 0x00, 0x00, 0x00, 0x02, 0x7b, 0x7d]);
  res.write(eosHeader);
}

// Отправка унарного RPC ответа (поддержка Protobuf и JSON)
function sendUnaryResponse(req, res, pbClass, jsonPayload) {
  const acceptProto = req.headers['content-type'] === 'application/proto' || (req.headers['accept'] && req.headers['accept'].includes('application/proto'));
  
  if (acceptProto) {
    if (pbClass) {
      try {
        const response = new pbClass(jsonPayload);
        const bytes = response.toBinary();
        res.writeHead(200, { 'Content-Type': 'application/proto' });
        res.end(bytes);
        return;
      } catch (e) {
        console.error('[Proxy Wrapper] Failed to serialize Protobuf response:', e);
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'application/proto' });
      res.end(Buffer.alloc(0));
      return;
    }
  }
  
  // Fallback to JSON
  res.writeHead(200, { 
    'Content-Type': 'application/json',
    'connect-accept-encoding': 'gzip,deflate'
  });
  res.end(JSON.stringify(jsonPayload));
}

const conversationHistories = new Map();

// Функция парсинга turns в массив сообщений
function parseTurns(turns) {
  const messages = [];
  for (const turnBytes of turns) {
    let turnDecoded = null;
    if (turnBytes && typeof turnBytes === 'object' && !Buffer.isBuffer(turnBytes) && !(turnBytes instanceof Uint8Array)) {
      turnDecoded = turnBytes;
    } else {
      try {
        turnDecoded = agentPb.j9.fromBinary(turnBytes);
      } catch (pbErr) {
        try {
          const turnStr = Buffer.from(turnBytes).toString('utf8');
          turnDecoded = JSON.parse(turnStr);
        } catch (jsonErr) {
          console.error('[Proxy Wrapper] Failed to parse turn as Protobuf or JSON:', pbErr.message, jsonErr.message);
        }
      }
    }
    
    if (turnDecoded) {
      // Поддержка как camelCase (Connect/TS), так и snake_case (Protobuf/JSON)
      const turnObj = turnDecoded.turn || turnDecoded;
      const caseType = turnObj.case || (turnObj.turn && turnObj.turn.case);
      const turnVal = turnObj.value || (turnObj.turn && turnObj.turn.value) || turnObj;

      if (caseType === 'agentConversationTurn' || turnVal.userMessage || turnVal.user_message || turnVal.steps) {
        const userMsg = turnVal.userMessage || turnVal.user_message;
        if (userMsg && userMsg.text) {
          messages.push({ role: 'user', content: userMsg.text });
        } else if (userMsg && typeof userMsg === 'string') {
          messages.push({ role: 'user', content: userMsg });
        } else if (turnVal.userMessageText) {
          messages.push({ role: 'user', content: turnVal.userMessageText });
        }
        
        const steps = turnVal.steps;
        if (steps && Array.isArray(steps)) {
          for (const step of steps) {
            const assistantMsg = step.assistantMessage || step.assistant_message;
            if (assistantMsg && assistantMsg.text) {
              messages.push({ role: 'assistant', content: assistantMsg.text });
            } else if (step.type === 'assistantMessage' && step.message && step.message.text) {
              messages.push({ role: 'assistant', content: step.message.text });
            } else if (step.type === 'assistant' && typeof step.message === 'string') {
              messages.push({ role: 'assistant', content: step.message });
            }
            
            const toolCall = step.toolCall || step.tool_call;
            if (toolCall) {
              try {
                const tc = toolCall.mcpToolCall || toolCall.mcp_tool_call;
                if (tc && tc.args) {
                  const tcId = tc.args.toolCallId || tc.args.tool_call_id;
                  const name = tc.args.name || tc.args.toolName || 'mcp_tool';
                  const args = tc.args.args || {};
                  
                  // 1. Assistant message indicating a tool call
                  messages.push({
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                      id: tcId,
                      type: 'function',
                      function: {
                        name: name,
                        arguments: typeof args === 'string' ? args : JSON.stringify(args)
                      }
                    }]
                  });

                  // 2. Extract tool run result
                  let resultContent = 'Success';
                  if (tc.result) {
                    const res = tc.result;
                    if (res.success) {
                      const contentArray = res.success.content || [];
                      const textParts = [];
                      for (const item of contentArray) {
                        const t = item.text?.text || item.text;
                        if (t) textParts.push(t);
                      }
                      resultContent = textParts.join('\n');
                    } else if (res.error) {
                      resultContent = `Error: ${res.error.error || JSON.stringify(res.error)}`;
                    } else if (res.rejected) {
                      resultContent = `Rejected: ${res.rejected.reason || 'Rejected by user'}`;
                    } else if (res.permissionDenied || res.permission_denied) {
                      const pd = res.permissionDenied || res.permission_denied;
                      resultContent = `Permission Denied: ${pd.error || 'Access denied'}`;
                    }
                  }

                  // 3. Tool response message
                  messages.push({
                    role: 'tool',
                    tool_call_id: tcId,
                    content: resultContent
                  });
                } else {
                  // Fallback for non-MCP tools
                  const toolCallJson = toolCall.toJson ? toolCall.toJson() : toolCall;
                  messages.push({ role: 'assistant', content: `[Call Tool] ${JSON.stringify(toolCallJson)}` });
                }
              } catch (e) {
                console.error('[Proxy Wrapper] Error parsing tool call turn:', e);
                messages.push({ role: 'assistant', content: `[Call Tool] Error: ${e.message}` });
              }
            }
          }
        }
      } else if (caseType === 'shellConversationTurn' || turnVal.shellCommand || turnVal.shell_command || turnVal.shellOutput || turnVal.shell_output) {
        const shellCmd = turnVal.shellCommand || turnVal.shell_command;
        if (shellCmd && shellCmd.command) {
          messages.push({ role: 'assistant', content: `[Run command] ${shellCmd.command}` });
        }
        const shellOut = turnVal.shellOutput || turnVal.shell_output;
        if (shellOut) {
          const out = shellOut.stdout || '';
          const err = shellOut.stderr || '';
          const code = shellOut.exitCode !== undefined ? shellOut.exitCode : (shellOut.exit_code !== undefined ? shellOut.exit_code : 0);
          messages.push({ role: 'user', content: `[Command Output (exit code ${code})]\n${out}${err ? '\nError:\n' + err : ''}` });
        }
      } else {
        // Дополнительный fallback парсинга
        if (turnDecoded.userMessage && turnDecoded.userMessage.text) {
          messages.push({ role: 'user', content: turnDecoded.userMessage.text });
        } else if (turnDecoded.userMessage && typeof turnDecoded.userMessage === 'string') {
          messages.push({ role: 'user', content: turnDecoded.userMessage });
        }
        if (turnDecoded.steps && Array.isArray(turnDecoded.steps)) {
          for (const step of turnDecoded.steps) {
            const aMsg = step.assistantMessage || step.assistant_message;
            if (aMsg && aMsg.text) {
              messages.push({ role: 'assistant', content: aMsg.text });
            }
          }
        }
      }
    }
  }
  return messages;
}

// Функция сборки сообщений для OpenAI
function buildOpenAiMessages(runRequest) {
  const messages = [];
  const state = runRequest.conversationState;
  
  // 1. Добавляем системные напоминания/промпты
  if (runRequest.customSystemPrompt) {
    messages.push({ role: 'system', content: runRequest.customSystemPrompt });
  }
  
  // 2. Парсим root_prompt_messages_json
  if (state && state.rootPromptMessagesJson) {
    for (const msgBytes of state.rootPromptMessagesJson) {
      try {
        const msgStr = Buffer.from(msgBytes).toString('utf8');
        const msg = JSON.parse(msgStr);
        if (msg.role && msg.content) {
          messages.push({ role: 'system', content: msg.content });
        }
      } catch (e) {
        console.error('[Proxy Wrapper] Error parsing root prompt message:', e);
      }
    }
  }
  
  // 3. Добавляем историю
  let historyMessages = [];
  const hasTurns = state && state.turns && state.turns.length > 0;
  
  if (hasTurns) {
    console.log('[Proxy Wrapper] Using history from request turns');
    historyMessages = parseTurns(state.turns);
    // Сохраняем/обновляем историю
    if (runRequest.conversationId) {
      conversationHistories.set(runRequest.conversationId, historyMessages);
    }
  } else if (runRequest.conversationId && conversationHistories.has(runRequest.conversationId)) {
    console.log(`[Proxy Wrapper] Using saved history for conversationId: ${runRequest.conversationId}`);
    historyMessages = conversationHistories.get(runRequest.conversationId);
  } else {
    console.log('[Proxy Wrapper] No history available (first request or empty)');
  }
  
  console.log('[Proxy Wrapper] Conversation state structure:', state ? {
    rootPromptMessagesJsonCount: state.rootPromptMessagesJson ? state.rootPromptMessagesJson.length : 0,
    turnsCount: state.turns ? state.turns.length : 0,
    usedHistoryCount: historyMessages.length
  } : 'no state');

  messages.push(...historyMessages);
  
  // 4. Добавляем текущее действие (новое сообщение пользователя)
  const action = runRequest.action;
  if (action && action.action && action.action.case === 'userMessageAction') {
    const userMsg = action.action.value.userMessage;
    if (userMsg && userMsg.text) {
      messages.push({ role: 'user', content: userMsg.text });
    }
  }
  
  return messages;
}

// --- АДМИНИСТРАТИВНЫЙ ИНТЕРФЕЙС И API ---

function handleAdminRequests(req, res) {
  const pathname = req.url.split('?')[0];

  if (pathname === '/admin' || pathname === '/config-ui') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const htmlPath = path.join(__dirname, 'admin.html');
    if (fs.existsSync(htmlPath)) {
      res.end(fs.readFileSync(htmlPath));
    } else {
      res.end('<h1>admin.html not found</h1>');
    }
    return true;
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(activeConfig));
    return true;
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const newConfig = JSON.parse(body);
        saveConfig(newConfig);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: e.message }));
      }
    });
    return true;
  }

  if (pathname === '/api/logs' && req.method === 'GET') {
    const parts = req.url.split('?');
    const queryStr = parts[1] || '';
    const sinceMatch = queryStr.match(/since=(\d+)/);
    const since = sinceMatch ? parseInt(sinceMatch[1]) : 0;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      logs: logsBuffer.slice(since),
      lastIndex: logsBuffer.length
    }));
    return true;
  }

  if (pathname === '/api/logs/clear' && req.method === 'POST') {
    logsBuffer.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return true;
  }

  return false;
}

// --- СОЗДАНИЕ СЕРВЕРА ---

const server = http.createServer((req, res) => {
  // 0. Перехватываем административные запросы
  if (handleAdminRequests(req, res)) return;

  console.log(`[Proxy Wrapper] ${req.method} ${req.url}`);

  // 1. Перехватываем роут обмена API ключей Cursor
  if (req.url === '/auth/exchange_user_api_key' && req.method === 'POST') {
    console.log('[Proxy Wrapper] Intercepted exchange_user_api_key, returning mock token');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      accessToken: 'mock-access-token-for-conductor'
    }));
    return;
  }

  // 2. Перехватываем проверку GetUserPrivacyMode
  if (req.url === '/aiserver.v1.DashboardService/GetUserPrivacyMode' && req.method === 'POST') {
    console.log('[Proxy Wrapper] Intercepted GetUserPrivacyMode, returning inferred privacy mode');
    sendUnaryResponse(req, res, globalThis.dashboardPb?.mWk, {
      privacyMode: 1,
      isEnforcedByTeam: false,
      hoursRemainingInGracePeriod: 0
    });
    return;
  }

  // 3. Перехватываем инициализацию Statsig (Analytics Service)
  if (req.url === '/aiserver.v1.AnalyticsService/BootstrapStatsig' && req.method === 'POST') {
    console.log('[Proxy Wrapper] Intercepted BootstrapStatsig, returning empty config');
    sendUnaryResponse(req, res, null, {
      config: "{}",
      generatedAtMs: "0"
    });
    return;
  }

  // 3a. Перехватываем GetTeamAdminSettingsOrEmptyIfNotInTeam
  if (req.url === '/aiserver.v1.DashboardService/GetTeamAdminSettingsOrEmptyIfNotInTeam' && req.method === 'POST') {
    console.log('[Proxy Wrapper] Intercepted GetTeamAdminSettingsOrEmptyIfNotInTeam, returning empty settings');
    sendUnaryResponse(req, res, globalThis.dashboardPb?.V5U, {});
    return;
  }

  // 3b. Перехватываем GetTeamReposOrEmptyIfNotInTeam
  if (req.url === '/aiserver.v1.DashboardService/GetTeamReposOrEmptyIfNotInTeam' && req.method === 'POST') {
    console.log('[Proxy Wrapper] Intercepted GetTeamReposOrEmptyIfNotInTeam, returning empty repos');
    sendUnaryResponse(req, res, globalThis.dashboardPb?.k1F, { repos: [] });
    return;
  }

  // 3c. Перехватываем TrackEvents (Analytics Service)
  if (req.url === '/aiserver.v1.AnalyticsService/TrackEvents' && req.method === 'POST') {
    console.log('[Proxy Wrapper] Intercepted TrackEvents, returning empty response');
    sendUnaryResponse(req, res, null, {});
    return;
  }

  // 4. ТРАНСЛЯЦИЯ Connect RPC стрима Run для Composer
  if (req.url === '/agent.v1.AgentService/Run' && req.method === 'POST') {
    console.log('[Proxy Wrapper] Handling Connect Run Request');
    
    const dumpPath = path.join(__dirname, 'last_run_request.bin');
    const dumpStream = fs.createWriteStream(dumpPath);
    req.on('data', (chunk) => {
      dumpStream.write(chunk);
    });
    req.on('end', () => {
      dumpStream.end();
      console.log('[Proxy Wrapper] Wrote binary run request dump to:', dumpPath);
    });
    
    let runRequest = null;
    let started = false;
    
    parseConnectStream(req, (msg) => {
      if (msg.message && msg.message.case === 'runRequest') {
        runRequest = msg.message.value;
        console.log('[Proxy Wrapper] Received runRequest, conversationId:', runRequest.conversationId);
        try {
          console.log('[Proxy Wrapper] RunRequest structure keys:', Object.keys(runRequest));
          if (runRequest.conversationState) {
            console.log('[Proxy Wrapper] ConversationState keys:', Object.keys(runRequest.conversationState));
            console.log('[Proxy Wrapper] ConversationState turns:', runRequest.conversationState.turns);
          }
          console.log('[Proxy Wrapper] RunRequest JSON:', JSON.stringify(runRequest.toJson ? runRequest.toJson() : runRequest, (key, value) => {
            if (typeof value === 'string' && value.length > 300) return value.substring(0, 100) + '...';
            if (value && value.type === 'Buffer') return `<Buffer ${value.data.length}>`;
            if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Uint8Array') return `<Uint8Array ${value.length}>`;
            return value;
          }, 2));
        } catch (logErr) {
          console.error('[Proxy Wrapper] Failed to log runRequest:', logErr);
        }
        
        if (!started) {
          started = true;
          // Начинаем стриминг ответа клиенту немедленно, не дожидаясь окончания стрима запроса
          res.writeHead(200, {
            'Content-Type': 'application/connect+proto',
            'x-content-type-options': 'nosniff'
          });
          
          const stepId = BigInt(Math.floor(Math.random() * 1000000000) + 1);
          console.log('[Proxy Wrapper] Starting step:', stepId.toString());
          
          // Отправляем stepStarted кадр
          const stepStarted = new agentPb.dw({ stepId: stepId });
          const interactionUpdateStarted = new agentPb.Uq({
            message: {
              case: 'stepStarted',
              value: stepStarted
            }
          });
          const serverMessageStarted = new globalThis.AgentServerMessage({
            message: {
              case: 'interactionUpdate',
              value: interactionUpdateStarted
            }
          });
          sendConnectFrame(res, serverMessageStarted);
          
          const messages = buildOpenAiMessages(runRequest);
          let modelName = runRequest.requestedModel?.modelId || runRequest.devRawModelSlug || 'cursor:composer-2.5';
          const originalModel = modelName;
          
          modelName = mapModel(modelName);
          
          if (modelName.toLowerCase().includes('gemini')) {
            messages.push({
              role: 'system',
              content: 'IMPORTANT: You must respond ONLY with direct text. Do NOT make any tool calls. Do NOT suggest tool calls. Do NOT use tool_calls format. You do not have access to any external tools. Answer the user prompt directly using text only.'
            });
          }
          
          console.log(`[Proxy Wrapper] Mapped model from "${originalModel}" to "${modelName}" for Run Request, messages count: ${messages.length}`);
          
          const payload = JSON.stringify({
            model: modelName,
            messages: messages,
            stream: true
          });
          
          const proxyReq = http.request({
            host: TARGET_HOST,
            port: TARGET_PORT,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${CLIPROXY_API_KEY}`
            }
          }, (proxyRes) => {
            console.log(`[Proxy Wrapper] cli-proxy-api response status: ${proxyRes.statusCode}`);
            
            let responseText = '';
            let sseBuffer = '';
            const activeToolCalls = [];
            
            proxyRes.on('data', (chunk) => {
              const chunkStr = chunk.toString('utf8');
              console.log('[Proxy Wrapper] cli-proxy-api raw chunk:', chunkStr);
              sseBuffer += chunkStr;
              const lines = sseBuffer.split('\n');
              sseBuffer = lines.pop(); // оставляем неоконченную строку в буфере
              
              for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith('data: ')) {
                  const dataStr = cleanLine.substring(6).trim();
                  if (dataStr === '[DONE]') continue;
                  try {
                    const json = JSON.parse(dataStr);
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) {
                      responseText += content;
                      // Отправляем textDelta кадр
                      const textDelta = new agentPb.Pt({ text: content });
                      const interactionUpdate = new agentPb.Uq({
                        message: {
                          case: 'textDelta',
                          value: textDelta
                        }
                      });
                      const serverMessage = new globalThis.AgentServerMessage({
                        message: {
                          case: 'interactionUpdate',
                          value: interactionUpdate
                        }
                      });
                      sendConnectFrame(res, serverMessage);
                    }
                    
                    const deltaToolCalls = json.choices?.[0]?.delta?.tool_calls;
                    if (deltaToolCalls) {
                      for (const tc of deltaToolCalls) {
                        const idx = tc.index ?? 0;
                        if (!activeToolCalls[idx]) {
                          activeToolCalls[idx] = {
                            id: tc.id || `call_${Math.random().toString(36).substring(2, 9)}`,
                            name: tc.function?.name || '',
                            arguments: tc.function?.arguments || ''
                          };
                        } else {
                          if (tc.id) activeToolCalls[idx].id = tc.id;
                          if (tc.function?.name) activeToolCalls[idx].name = tc.function.name;
                          if (tc.function?.arguments) activeToolCalls[idx].arguments += tc.function.arguments;
                        }
                      }
                    }
                  } catch (e) {
                    console.error('[Proxy Wrapper] Error parsing SSE line JSON:', dataStr, e.message);
                  }
                }
              }
            });
            
            proxyRes.on('end', () => {
              console.log('[Proxy Wrapper] cli-proxy-api stream ended, completing step:', stepId.toString());
              
              // Сохраняем ход в историю диалога
              if (runRequest && runRequest.conversationId) {
                let userMessageText = '';
                const action = runRequest.action;
                if (action && action.action && action.action.case === 'userMessageAction') {
                  const userMsg = action.action.value.userMessage;
                  if (userMsg && userMsg.text) {
                    userMessageText = userMsg.text;
                  }
                }
                
                const currentHistory = conversationHistories.get(runRequest.conversationId) || [];
                if (userMessageText) {
                  currentHistory.push({ role: 'user', content: userMessageText });
                }
                if (responseText) {
                  currentHistory.push({ role: 'assistant', content: responseText });
                }
                conversationHistories.set(runRequest.conversationId, currentHistory);
                console.log(`[Proxy Wrapper] Saved history for ${runRequest.conversationId}, total messages: ${currentHistory.length}`);
              }
              
              if (activeToolCalls.length > 0) {
                console.log(`[Proxy Wrapper] Sending ${activeToolCalls.length} tool calls to Conductor`);
                for (const tc of activeToolCalls) {
                  if (!tc) continue;
                  let parsedArgs = {};
                  try {
                    parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
                  } catch (e) {
                    console.error('[Proxy Wrapper] Failed to parse tool arguments JSON:', tc.arguments, e.message);
                  }

                  const mcpArgs = new globalThis.McpArgs({
                    name: tc.name,
                    args: parsedArgs,
                    toolCallId: tc.id,
                    providerIdentifier: "",
                    toolName: tc.name
                  });

                  const mcpToolCall = new globalThis.McpToolCall({
                    args: mcpArgs
                  });

                  const toolCallObj = new globalThis.ToolCall({
                    mcpToolCall: mcpToolCall
                  });

                  const toolCallStarted = new agentPb.xu({
                    callId: tc.id,
                    toolCall: toolCallObj,
                    modelCallId: tc.id
                  });

                  const interactionUpdateStarted = new agentPb.Uq({
                    message: {
                      case: 'toolCallStarted',
                      value: toolCallStarted
                    }
                  });
                  
                  const serverMessageStarted = new globalThis.AgentServerMessage({
                    message: {
                      case: 'interactionUpdate',
                      value: interactionUpdateStarted
                    }
                  });
                  sendConnectFrame(res, serverMessageStarted);

                  const toolCallCompleted = new agentPb.LL({
                    callId: tc.id,
                    toolCall: toolCallObj,
                    modelCallId: tc.id
                  });

                  const interactionUpdateCompleted = new agentPb.Uq({
                    message: {
                      case: 'toolCallCompleted',
                      value: toolCallCompleted
                    }
                  });

                  const serverMessageCompleted = new globalThis.AgentServerMessage({
                    message: {
                      case: 'interactionUpdate',
                      value: interactionUpdateCompleted
                    }
                  });
                  sendConnectFrame(res, serverMessageCompleted);
                }
              }
              
              // Отправляем stepCompleted кадр
              const stepCompleted = new agentPb.Lr({
                stepId: stepId,
                stepDurationMs: 0n
              });
              const interactionUpdateCompleted = new agentPb.Uq({
                message: {
                  case: 'stepCompleted',
                  value: stepCompleted
                }
              });
              const serverMessageCompleted = new globalThis.AgentServerMessage({
                message: {
                  case: 'interactionUpdate',
                  value: interactionUpdateCompleted
                }
              });
              sendConnectFrame(res, serverMessageCompleted);
              
              // Отправляем turnEnded кадр
              const turnEnded = new agentPb.lJ({
                inputTokens: 0n,
                outputTokens: 0n
              });
              const interactionUpdate = new agentPb.Uq({
                message: {
                  case: 'turnEnded',
                  value: turnEnded
                }
              });
              const serverMessage = new globalThis.AgentServerMessage({
                message: {
                  case: 'interactionUpdate',
                  value: interactionUpdate
                }
              });
              sendConnectFrame(res, serverMessage);
              
              // Закрываем стрим
              sendEosFrame(res);
              res.end();
            });
          });
          
          proxyReq.on('error', (err) => {
            console.error('[Proxy Wrapper] cli-proxy-api request error:', err);
            res.end();
          });
          
          proxyReq.write(payload);
          proxyReq.end();
        }
      }
    }, () => {
      console.log('[Proxy Wrapper] Connect request stream ended');
    });
    return;
  }

  // 5. Если запрос идет к OIDC/OAuth спецификациям (например, .well-known), проксируем на официальный api2.cursor.sh
  if (req.url.includes('/.well-known/')) {
    console.log('[Proxy Wrapper] Forwarding OIDC request to api2.cursor.sh');
    const secureReq = https.request({
      host: 'api2.cursor.sh',
      port: 443,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: 'api2.cursor.sh' // Перезаписываем host заголовок для https
      }
    }, (secureRes) => {
      res.writeHead(secureRes.statusCode, secureRes.headers);
      secureRes.pipe(res);
    });

    secureReq.on('error', (err) => {
      console.error('[Proxy Wrapper] HTTPS connection error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_gateway', message: err.message }));
    });

    req.pipe(secureReq);
    return;
  }

  // 6. Все остальные запросы (инференс /v1/chat/completions и т.д.) проксируем в локальный cli-proxy-api
  const isModelsRequest = req.url.includes('/v1/models');
  const isCompletionOrMessagesRequest = req.method === 'POST' && (req.url.includes('/v1/chat/completions') || req.url.includes('/v1/messages') || req.url.includes('/v1/responses'));

  // Убираем accept-encoding, чтобы cli-proxy-api не сжимал ответы
  const cleanHeaders = { ...req.headers };
  delete cleanHeaders['accept-encoding'];
  
  // Всегда используем CLIPROXY_API_KEY для авторизации на удаленном бэкенде
  cleanHeaders['authorization'] = `Bearer ${CLIPROXY_API_KEY}`;
  cleanHeaders['x-api-key'] = CLIPROXY_API_KEY;

  const handleProxyResponse = (proxyRes) => {
    if (isModelsRequest && proxyRes.statusCode === 200) {
      let body = '';
      proxyRes.on('data', (chunk) => { body += chunk; });
      proxyRes.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json && json.data) {
            console.log(`[Proxy Wrapper] Modifying /v1/models response to duplicate data into models and items fields`);
            
            const composerModel = json.data.find(m => m.id === 'cursor:composer-2.5') 
              || json.data.find(m => m.id === GEMINI_MODEL)
              || json.data[0];
            if (composerModel && !json.data.some(m => m.id === 'composer-2.5')) {
              json.data.push({ ...composerModel, id: 'composer-2.5' });
            }
            
            json.models = json.data;
            json.items = json.data;
            body = JSON.stringify(json);
            
            const responseHeaders = { ...proxyRes.headers };
            delete responseHeaders['transfer-encoding'];
            delete responseHeaders['content-encoding'];
            responseHeaders['content-length'] = Buffer.byteLength(body);
            
            res.writeHead(proxyRes.statusCode, responseHeaders);
            res.end(body);
            return;
          }
        } catch (e) {
          console.error('[Proxy Wrapper] Failed to parse/modify models response:', e);
        }
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(body);
      });
    } else {
      // Для всех остальных запросов проксируем заголовки и стримим тело
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  };

  if (isCompletionOrMessagesRequest) {
    let bodyData = '';
    req.on('data', (chunk) => {
      bodyData += chunk;
    });
    req.on('end', () => {
      let modifiedBody = bodyData;
      console.log(`[Proxy Wrapper] Incoming completions request size: ${Buffer.byteLength(bodyData)} bytes`);
      try {
        if (bodyData) {
          fs.writeFileSync(path.join(__dirname, 'last_completion_request.json'), bodyData);
          const json = JSON.parse(bodyData);
          if (json && json.model) {
            const originalModel = json.model;
            json.model = mapModel(json.model);
            console.log(`[Proxy Wrapper] Mapped API model from "${originalModel}" to "${json.model}"`);
            if (json.model !== originalModel) {
              modifiedBody = JSON.stringify(json);
            }
          }
        }
      } catch (e) {
        console.error('[Proxy Wrapper] Failed to parse/modify request body:', e.message);
      }

      const modifiedHeaders = { ...cleanHeaders };
      modifiedHeaders['content-length'] = Buffer.byteLength(modifiedBody);

      const proxyReq = http.request({
        host: TARGET_HOST,
        port: TARGET_PORT,
        path: req.url,
        method: req.method,
        headers: modifiedHeaders
      }, handleProxyResponse);

      proxyReq.on('error', (err) => {
        console.error('[Proxy Wrapper] Target connection error:', err);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad_gateway', message: err.message }));
      });

      proxyReq.write(modifiedBody);
      proxyReq.end();
    });
  } else {
    const proxyReq = http.request({
      host: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: cleanHeaders
    }, handleProxyResponse);

    proxyReq.on('error', (err) => {
      console.error('[Proxy Wrapper] Target connection error:', err);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_gateway', message: err.message }));
    });

    req.pipe(proxyReq);
  }
});

// Функция триггера запуска Conductor на хосте
function triggerHostConductor() {
  console.log('[Proxy Wrapper] Attempting to trigger Conductor launch on host (http://host.docker.internal:8318/launch)...');
  
  const req = http.request({
    host: 'host.docker.internal',
    port: 8318,
    path: '/launch',
    method: 'GET',
    timeout: 5000
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('[Proxy Wrapper] Host launcher daemon response:', body);
    });
  });
  
  req.on('error', (err) => {
    console.log('[Proxy Wrapper] Host launcher daemon not reachable (ignore if running proxy manually):', err.message);
  });
  
  req.on('timeout', () => {
    console.log('[Proxy Wrapper] Host launcher daemon request timed out');
    req.destroy();
  });
  
  req.end();
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Proxy Wrapper] Smart Proxy listening on 0.0.0.0:${PORT}`);
  triggerHostConductor();
});

// Запускаем веб-панель управления на случайном порту
const adminServer = http.createServer((req, res) => {
  if (handleAdminRequests(req, res)) return;
  
  // По умолчанию отдаем админку
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const htmlPath = path.join(__dirname, 'admin.html');
  if (fs.existsSync(htmlPath)) {
    res.end(fs.readFileSync(htmlPath));
  } else {
    res.end('<h1>admin.html not found</h1>');
  }
});

adminServer.listen(0, '0.0.0.0', () => {
  const adminPort = adminServer.address().port;
  console.log(`[Proxy Wrapper] Control Center UI available locally on random port: http://localhost:${adminPort}`);
  console.log(`[Proxy Wrapper] Control Center UI also available through main proxy: http://localhost:${PORT}/admin`);
});
