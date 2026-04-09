# AI-Powered B2B Lead Generation System

Complete automated lead generation system using n8n, PostgreSQL, AI agents (Groq), and multi-channel outreach.

## 🎯 System Overview

- **Scraping:** Google Maps, Yellow Pages US
- **Enrichment:** 3-stage AI pipeline (Groq/Llama 3.3)
- **Outreach:** Email, LinkedIn, SMS, WhatsApp
- **Intelligence:** Reply detection, AI qualification, automated follow-ups

## 📊 Workflows

1. **Workflow 1:** Connect Apify Account
2. **Workflow 2:** Scraping Orchestrator
3. **Workflow 3:** Google Maps Scraper
4. **Workflow 3B:** Yellow Pages US Scraper
5. **Workflow 4:** Data Cleaning & Validation
6. **Workflow 6A:** Basic Enrichment
7. **Workflow 6B:** AI Deep Research (with LinkedIn via web search)
8. **Workflow 6C:** Multi-Channel Outreach Strategy
9. **Workflow 7A:** Email Outreach Executor
10. **Workflow 7B:** LinkedIn Outreach Helper
11. **Workflow 7C:** SMS Outreach Executor
12. **Workflow 7D:** WhatsApp Outreach Executor
13. **Workflow 8:** Automated Follow-Up Manager
14. **Workflow 10:** Reply Detection & AI Qualification

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- API Keys: Apify, Groq, Serper, Twilio

### Setup

1. Clone repository:
```bash
git clone https://github.com/YOUR_USERNAME/lead-gen-system.git
cd lead-gen-system
```

2. Copy environment template:
```bash
cp .env.example .env
```

3. Edit `.env` and add your API keys

4. Start services:
```bash
docker-compose up -d
```

5. Import workflows:
   - Access n8n: http://localhost:5678
   - Import each workflow from `/workflows` folder

6. Initialize database:
```bash
docker exec -it postgres_db psql -U n8n_user -d lead_db -f /database/schema.sql
```

## 📚 Documentation

See `/documentation` folder for:
- System architecture
- Database schema
- API documentation
- Testing guide

## 👥 Team

- Muhammad Fahad
- [Partner Name]

## 📝 License

MIT