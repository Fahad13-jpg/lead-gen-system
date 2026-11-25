Clear-Host

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "      Lead Generation Restore Tool"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

#-------------------------------------------------------
# Project Paths
#-------------------------------------------------------

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$TempFolder = Join-Path $ProjectRoot "restore_temp"

#-------------------------------------------------------
# Check Docker
#-------------------------------------------------------

Write-Host "Checking Docker Desktop..." -ForegroundColor Yellow

try {
    docker info | Out-Null
    Write-Host "Docker Desktop is running." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: Docker Desktop is not running." -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again."
    exit
}

Write-Host ""

#-------------------------------------------------------
# Ask for Backup ZIP
#-------------------------------------------------------

$BackupZip = Read-Host "Enter the full path to your backup ZIP"

if (!(Test-Path $BackupZip))
{
    Write-Host ""
    Write-Host "Backup file not found." -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "Backup found." -ForegroundColor Green

#-------------------------------------------------------
# Clean previous temp folder
#-------------------------------------------------------

if(Test-Path $TempFolder)
{
    Remove-Item $TempFolder -Recurse -Force
}

New-Item -ItemType Directory -Path $TempFolder | Out-Null

#-------------------------------------------------------
# Extract ZIP
#-------------------------------------------------------

Write-Host ""
Write-Host "Extracting backup..."

Expand-Archive `
    -Path $BackupZip `
    -DestinationPath $TempFolder `
    -Force

Write-Host "Extraction completed." -ForegroundColor Green

#-------------------------------------------------------
# Verify Backup Files
#-------------------------------------------------------

Write-Host ""
Write-Host "Verifying backup..."

$RequiredFiles = @(
".env",
"docker-compose.yml",
"lead_db_backup.sql",
"README.md"
)

foreach($File in $RequiredFiles)
{
    if(!(Test-Path (Join-Path $TempFolder $File)))
    {
        Write-Host ""
        Write-Host "Missing file: $File" -ForegroundColor Red
        exit
    }
}

if(!(Test-Path (Join-Path $TempFolder "n8n_config")))
{
    Write-Host ""
    Write-Host "Missing folder: n8n_config" -ForegroundColor Red
    exit
}

Write-Host ""
Write-Host "Backup verification successful." -ForegroundColor Green

Write-Host ""
Write-Host "Part 1 completed successfully." -ForegroundColor Cyan
Write-Host ""
Write-Host "Ready for database restoration."