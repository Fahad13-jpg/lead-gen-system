# Complete Setup Guide

## Step 1: Install Docker

Download Docker Desktop for Windows:
https://www.docker.com/products/docker-desktop/

## Step 2: Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/lead-gen-system.git
cd lead-gen-system
```

## Step 3: Configure Environment

```bash
cp .env.example .env
notepad .env
```

Add your API keys (see env_template.txt for required keys)

## Step 4: Start Services

```bash
docker-compose up -d
```

Wait 30 seconds for services to start.

## Step 5: Access n8n

Open browser: http://localhost:5678

Login:
- Username: admin
- Password: (from .env file)

## Step 6: Import Workflows

For each workflow in `/workflows`:
1. Click "Workflows" → "Import from File"
2. Select workflow JSON file
3. Click "Import"
4. Save workflow

## Step 7: Initialize Database

```bash
docker exec -it postgres_db psql -U n8n_user -d lead_db -f /database/schema.sql
```

## Step 8: Test System

Run test scraping job:
```bash
curl -X POST http://localhost:5678/webhook/start-scraping \
  -H "Content-Type: application/json" \
  -d '{"source":"google_maps","query":"software companies","location":"Islamabad, Pakistan","max_results":5,"user_id":1}'
```

## Troubleshooting

See TROUBLESHOOTING.md