@echo off
echo ============================================
echo  APIFY KEY SWITCHER
echo ============================================
echo.
echo Current Apify key will be replaced.
echo.
set /p NEW_KEY="Enter new Apify API key: "

echo.
echo Updating docker-compose.yml...

REM Stop containers
docker-compose down

REM Update docker-compose.yml (using PowerShell)
powershell -Command "(Get-Content docker-compose.yml) -replace 'APIFY_API_KEY=apify_api_.*', 'APIFY_API_KEY=%NEW_KEY%' | Set-Content docker-compose.yml"

echo.
echo Starting containers with new key...
docker-compose up -d

echo.
echo Waiting 30 seconds for n8n to start...
timeout /t 30 /nobreak

echo.
echo Verifying new key...
docker exec -it n8n printenv APIFY_API_KEY

echo.
echo ============================================
echo  KEY UPDATE COMPLETE!
echo ============================================
echo.
echo IMPORTANT: Also update in database:
echo   docker exec -it postgres_db psql -U n8n_user -d lead_db
echo   UPDATE users SET apify_key = '%NEW_KEY%' WHERE id = 1;
echo.
pause