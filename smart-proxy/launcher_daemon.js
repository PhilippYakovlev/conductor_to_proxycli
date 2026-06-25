const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const PORT = 8318;
const CONDUCTOR_PATH = '/Applications/Conductor.app/Contents/MacOS/conductor';
const LOG_FILE = '/tmp/conductor_live.log';

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[Daemon ${timestamp}] ${msg}`);
}

const server = http.createServer((req, res) => {
  log(`${req.method} ${req.url}`);

  if (req.url === '/launch' || req.url === '/restart') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'launching' }));

    log('Received launch request. Stopping existing Conductor...');

    // Мягко закрываем Conductor через osascript
    exec('osascript -e \'quit app "Conductor"\'', (err) => {
      // Ждем 1.5 секунды, чтобы процесс завершился, затем принудительно убиваем остатки (если есть)
      setTimeout(() => {
        exec('killall Conductor 2>/dev/null; killall conductor 2>/dev/null', () => {
          log('Updating Conductor SQLite database to point to smart proxy...');
          const dbPath = '/Users/filippakovlev/Library/Application Support/com.conductor.app/conductor.db';
          const sql = `
            UPDATE env_vars SET value = 'http://127.0.0.1:8317' WHERE key = 'CURSOR_BACKEND_URL';
            UPDATE env_vars SET value = 'http://127.0.0.1:8317/v1' WHERE key = 'CURSOR_API_BASE_URL';
            UPDATE env_vars SET value = 'http://127.0.0.1:8317' WHERE key = 'CURSOR_WEBSITE_URL';
            UPDATE env_vars SET value = 'http://127.0.0.1:8317/v1' WHERE key = 'OPENAI_BASE_URL';
            UPDATE env_vars SET value = 'http://127.0.0.1:8082' WHERE key = 'ANTHROPIC_BASE_URL';
            UPDATE env_vars SET value = 'http://127.0.0.1:8317/v1' WHERE key = 'codex_base_url';
            UPDATE env_vars SET value = 'sk-2v5P7lkMzyqoKfprLsk-WYRCtlilAEudjFXZn' WHERE key = 'codex_api_key';
          `.replace(/\s+/g, ' ').trim();
          
          exec(`sqlite3 "${dbPath}" "${sql}"`, (dbErr) => {
            if (dbErr) {
              log(`Warning: Failed to update Conductor database: ${dbErr.message}`);
            } else {
              log('Conductor SQLite database updated successfully!');
            }
            
            log('Starting Conductor with smart proxy environment variables...');

            const env = {
              ...process.env,
              CURSOR_API_BASE_URL: 'http://127.0.0.1:8317/v1',
              CURSOR_BACKEND_URL: 'http://127.0.0.1:8317',
              CURSOR_WEBSITE_URL: 'http://127.0.0.1:8317',
              OPENAI_BASE_URL: 'http://127.0.0.1:8317/v1',
              ANTHROPIC_BASE_URL: 'http://127.0.0.1:8082'
            };

            try {
              const out = fs.openSync(LOG_FILE, 'a');
              const errOut = fs.openSync(LOG_FILE, 'a');

              const child = spawn(CONDUCTOR_PATH, [], {
                env,
                detached: true,
                stdio: ['ignore', out, errOut]
              });
              child.unref();

              log('Conductor launched successfully!');
            } catch (spawnErr) {
              log(`Error spawning Conductor: ${spawnErr.message}`);
            }
          });
        });
      }, 1500);
    });
    return;
  }

  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', daemon: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  log(`Launcher Daemon listening on http://127.0.0.1:${PORT}`);
});
