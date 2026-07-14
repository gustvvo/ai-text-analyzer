# AI Text Analyzer

AI-powered text summarization and classification service — Full Stack AI Engineer assessment.

> Work in progress: the full README (architecture, AI design decisions, trade-offs, run instructions) lands with the final deliverable.

## Quick start (dev)

Start Postgres and the backend:

```bash
docker compose up -d --build
curl http://localhost:3000/health
```

Run the frontend separately:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```
