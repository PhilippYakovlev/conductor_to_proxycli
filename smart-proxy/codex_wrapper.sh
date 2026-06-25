#!/bin/bash
export OPENAI_BASE_URL="http://127.0.0.1:8317/v1"
exec "/Users/filippakovlev/Library/Application Support/com.conductor.app/agent-binaries/codex/0.138.0/codex" "$@"
