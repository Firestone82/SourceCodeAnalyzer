# SourceCodeAnalyzer

LLM-powered source code analysis platform with a FastAPI backend, Angular frontend, and Redis-backed job queue.

![Python](https://img.shields.io/badge/Python-3.11%2B-blue) ![Angular](https://img.shields.io/badge/Angular-TypeScript-red) ![Docker](https://img.shields.io/badge/Docker-Compose-blue)

## About

SourceCodeAnalyzer lets users submit source archives for automated code review using any OpenAI-compatible LLM (including local models via Ollama or LM Studio). The backend dispatches analysis jobs to RQ workers, stores results in SQLite or PostgreSQL, and exposes them through a REST API. The Angular frontend provides an interface for browsing submissions, viewing reported issues, and rating them.

## Features

- Source archive upload with selectable analysis prompts
- OpenAI-compatible analyser — works with OpenAI, Ollama, LM Studio, or any compatible server
- Asynchronous job processing via Redis and RQ workers
- Optional secondary "critiquer" model for independent issue rating
- Issue rating system with reviewer authentication
- Angular frontend for browsing submissions and scoring results
- Docker Compose setup for full-stack deployment
- SQLite by default, PostgreSQL via opt-in profile

## Requirements

- Docker and Docker Compose *(recommended)*
- Or: Python 3.11+, Node.js 20+, Redis 7+
- An OpenAI-compatible API endpoint or local model server

## Setup

### Docker (recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/Firestone82/SourceCodeAnalyzer.git
   cd SourceCodeAnalyzer
   ```

2. Copy and configure the environment file:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` — at minimum set `API_BASE_URL` and configure an OpenAI server in `data/openai_servers.json`.

3. Start all services:
   ```bash
   docker compose up --build
   ```

4. Open the app:
   - API: `http://localhost:4100`
   - Frontend: `http://localhost:4200`

### Manual (local development)

1. Start Redis only:
   ```bash
   docker compose -f docker-compose.redis.yml up -d
   ```

2. Set up and start the backend:
   ```bash
   python -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 4100
   ```

3. Start the RQ worker (new terminal):
   ```bash
   source .venv/bin/activate
   python worker.py
   ```

4. Start the frontend (new terminal):
   ```bash
   cd frontend
   ../scripts/generate-frontend-env.sh ../.env
   npm install && ng serve
   ```

## License

Provided as-is for personal use.
