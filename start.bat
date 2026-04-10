@echo off
echo 🚀 Starting Lead Generation System...

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

echo 📦 Starting containers...
docker-compose up -d

echo ⏳ Waiting for services...
timeout /t 10 /nobreak >nul

echo ✅ System is ready!
echo 🌐 n8n: http://localhost:5678
echo 🗄️  PostgreSQL: localhost:5432
echo.
echo 📋 To view logs: docker-compose logs -f
echo 🛑 To stop: docker-compose down
pause