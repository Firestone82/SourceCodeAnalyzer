# Source Code Analyzer

**Author:** Pavel Mikula

A FastAPI + Angular application for submitting source archives, running LLM-based code analysis jobs, and rating the
reported issues. The backend stores results in SQLite (or another SQLAlchemy-supported database, such as Postgres) and
offloads analysis to an RQ worker backed by Redis.

## 🚀 Features

- **Source Archive Uploads** with prompt selection for analysis
- **OpenAI-Compatible Analyzer** with JSON responses for issue extraction
- **Asynchronous Job Processing** via Redis + RQ workers
- **Rater Authentication & Reviews** for issue scoring
- **Angular Frontend** for browsing submissions and ratings

## 🧰 Prerequisites

### Services

- Redis 7+ (used by RQ for background jobs)

### Software

- Python 3.11+
- Node.js 20+ (for the Angular frontend)
- npm or pnpm

### APIs

- OpenAI-compatible API endpoint (or local model server) with a JSON-mode capable chat completion endpoint

## 🐳 Docker

### Docker Compose (full stack)

1. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` (see [Configuration](#configuration) below). Both the backend and frontend read from this file.
2. **Build and run**
   ```bash
   docker compose up --build
   ```
3. **Open the app**
   - API: `http://localhost:4100`
   - Frontend: `http://localhost:4200` (served by Nginx in the container)
   - When running the frontend in Docker with `API_BASE_URL` pointing at `localhost`, the container rewrites it to
     `host.docker.internal` so it can still reach the backend.

> Data is persisted to local folders (for SQLite) and Docker volumes (for Redis/Postgres).

### Separate containers (Docker run)

1. **Create a network**
   ```bash
   docker network create analyzer-net
   ```
2. **Start Redis**
   ```bash
   docker run -d --name analyzer-redis --network analyzer-net -p 6379:6379 redis:7-alpine \
     -v "$(pwd)/redis-data:/data" \
     redis-server --appendonly yes
   ```
3. **Build the backend/worker image**
   ```bash
   docker build -t analyzer-backend .
   ```
4. **Run the API**
   ```bash
   docker run -d --name analyzer-api --network analyzer-net -p 4100:4100 \
     --env-file .env \
     -e PORT=4100 \
     -e DATABASE_URL=sqlite:///./data/dev.db \
     -e REDIS_URL=redis://analyzer-redis:6379/0 \
     -v "$(pwd)/data:/app/data" \
     analyzer-backend
   ```
5. **Run the worker**
   ```bash
   docker run -d --name analyzer-worker --network analyzer-net \
     --env-file .env \
     -e PORT=4100 \
     -e DATABASE_URL=sqlite:///./data/dev.db \
     -e REDIS_URL=redis://analyzer-redis:6379/0 \
     -v "$(pwd)/data:/app/data" \
     analyzer-backend python worker.py
   ```
6. **Build and run the frontend**
   ```bash
   docker build -t analyzer-frontend ./frontend
   docker run -d --name analyzer-frontend --network analyzer-net -p 4200:80 \
     --env-file .env \
     --add-host host.docker.internal:host-gateway \
     analyzer-frontend
   ```
7. **Open the app**
   - API: `http://localhost:4100`
   - Frontend: `http://localhost:4200`

### Redis-only (optional)

If you want to run Redis in Docker but everything else locally, use:
```bash
docker compose -f docker-compose.redis.yml up -d
```

### Postgres (optional)

Postgres is available behind an opt-in profile so it does not start by default:
```bash
docker compose --profile postgres up -d postgres
```

## 🛠 Local Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <YOUR_REPO_URL>
   cd SourceCodeAnalyzer
   ```
2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` (see [Configuration](#configuration) below). The frontend reads `API_BASE_URL` from this file.
3. **Start Redis**
   ```bash
   docker compose -f docker-compose.redis.yml up -d
   ```
4. **Create a virtual environment**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
5. **Run the backend API**
   ```bash
   uvicorn app.main:app --reload --port 4100
   ```
6. **Run the RQ worker**
   ```bash
   python worker.py
   ```
7. **Run the frontend**
   ```bash
   cd frontend
   ../scripts/generate-frontend-env.sh ../.env
   npm install
   ng serve
   ```
   Then open `http://localhost:4200`.

## ⚙️ Configuration

Edit `.env` or set corresponding environment variables.

```bash
## Backend configuration
APP_NAME=analyzer-backend
APP_ENV=dev
LOG_LEVEL=INFO
BACKEND_PORT=4100
API_BASE_URL=http://localhost:4100
CORS_ORIGINS=http://localhost:4200,http://127.0.0.1:4200

# Storage
DATA_DIR=data

# Database
DATABASE_URL=sqlite:///./dev.db
# DATABASE_URL=postgresql+psycopg2://analyzer:analyzer@localhost:5432/analyzer

# Queue
REDIS_URL=redis://localhost:6379/0
RQ_QUEUE_NAME=analysis

# Analyzer (OpenAI-compatible)
ANALYZER_BASE_URL=http://localhost:11434/v1
ANALYZER_API_KEY=

## Frontend configuration
FRONTEND_PORT=4200
```

For local frontend development, regenerate `frontend/public/env.js` when you change `API_BASE_URL`:
```bash
./scripts/generate-frontend-env.sh .env
```

`CORS_ORIGINS` is a comma-separated list of allowed browser origins for the API (for example,
`http://localhost:4200,http://127.0.0.1:4200`). Update it in `.env` if your frontend runs on a different host.

### Using Postgres instead of SQLite

1. Start Postgres (included in the default `docker-compose.yml` behind the `postgres` profile).
2. Set `DATABASE_URL` in your `.env`:
   ```bash
   DATABASE_URL=postgresql+psycopg2://analyzer:analyzer@localhost:5432/analyzer
   ```
3. Restart the API/worker containers or processes.

## 📜 Logs

The backend logs to stdout with timestamped log entries. Adjust `LOG_LEVEL` in the environment configuration to control
verbosity.

## License & Disclaimer

This project is provided "as-is" for personal use. No warranty is offered. Adapt for your needs, but please do not
redistribute without permission.
