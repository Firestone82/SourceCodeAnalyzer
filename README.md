# Source Code Analyzer
**Author:** Pavel Mikula

A FastAPI + Angular application for submitting source archives, running LLM-based code analysis jobs, and rating the reported issues. The backend stores results in SQLite (or another SQLAlchemy-supported database) and offloads analysis to an RQ worker backed by Redis.

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

## 🛠 Installation & Setup
1. **Clone the repository**
   ```bash
   git clone <YOUR_REPO_URL>
   cd SourceCodeAnalyzer
   ```
2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` (see [Configuration](#configuration) below).
3. **Start Redis**
   ```bash
   docker compose up -d
   ```
4. **Create a virtual environment**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
5. **Run the backend API**
   ```bash
   uvicorn app.main:app --reload
   ```
6. **Run the RQ worker**
   ```bash
   python worker.py
   ```
7. **Run the frontend**
   ```bash
   cd frontend
   npm install
   ng serve
   ```
   Then open `http://localhost:4200`.

## ⚙️ Configuration
Edit `.env` or set corresponding environment variables.
```bash
# API
APP_NAME=analyzer-backend
APP_ENV=dev
LOG_LEVEL=INFO

# Storage
DATA_DIR=data

# Database
DATABASE_URL=sqlite:///./dev.db

# Queue
REDIS_URL=redis://localhost:6379/0
RQ_QUEUE_NAME=analysis

# Analyzer (OpenAI-compatible)
ANALYZER_BASE_URL=http://localhost:11434/v1
ANALYZER_API_KEY=
```

## 📜 Logs
The backend logs to stdout with timestamped log entries. Adjust `LOG_LEVEL` in the environment configuration to control verbosity.

## License & Disclaimer
This project is provided "as-is" for personal use. No warranty is offered. Adapt for your needs, but please do not redistribute without permission.
