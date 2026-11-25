# =====================================================
# Lead Generation System Backup Script v2.0
# Author: Muhammad Fahad
# =====================================================

Clear-Host

# -----------------------------
# CONFIGURATION
# -----------------------------

$ProjectPath = "C:\Users\hp\lead-gen-system"

$GoogleDrivePath = "G:\My Drive\LeadGen Backups"

$PostgresContainer = "postgres_db"
$N8NContainer = "n8n"

$DatabaseUser = "n8n_user"
$DatabaseName = "lead_db"

$BackupRoot = Join-Path $ProjectPath "backups"
$TempFolder = Join-Path $BackupRoot "temp"
$ZipFolder = Join-Path $BackupRoot "zips"
$LogFolder = Join-Path $BackupRoot "logs"

$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

$CurrentBackup = Join-Path $TempFolder $Timestamp

$ZipFile = Join-Path $ZipFolder "LeadGen_Backup_$Timestamp.zip"

$LogFile = Join-Path $LogFolder "Backup_$Timestamp.log"

# -----------------------------
# CREATE FOLDERS
# -----------------------------

New-Item -ItemType Directory -Force -Path $TempFolder | Out-Null
New-Item -ItemType Directory -Force -Path $ZipFolder | Out-Null
New-Item -ItemType Directory -Force -Path $LogFolder | Out-Null
New-Item -ItemType Directory -Force -Path $CurrentBackup | Out-Null

function Log {

    param($Message)

    $time = Get-Date -Format "HH:mm:ss"

    Write-Host $Message

    Add-Content $LogFile "[$time] $Message"

}

Log ""
Log "==========================================="
Log "Lead Generation Backup Started"
Log "==========================================="
Log ""

# =====================================================
# CHECK DOCKER
# =====================================================

docker info *> $null

if ($LASTEXITCODE -ne 0){

    Log "ERROR : Docker Desktop is not running."

    exit

}

Log "Docker Desktop Running"

# =====================================================
# CHECK CONTAINERS
# =====================================================

$postgresRunning = docker inspect -f "{{.State.Running}}" $PostgresContainer

if($postgresRunning.Trim() -ne "true"){

    Log "ERROR : PostgreSQL container is not running."

    exit

}

Log "PostgreSQL Container Running"

$n8nRunning = docker inspect -f "{{.State.Running}}" $N8NContainer

if($n8nRunning.Trim() -ne "true"){

    Log "ERROR : n8n container is not running."

    exit

}

Log "n8n Container Running"

# =====================================================
# BACKUP DATABASE
# =====================================================

Log ""
Log "Backing up PostgreSQL..."

docker exec $PostgresContainer pg_dump `
-U $DatabaseUser `
-d $DatabaseName `
-f /tmp/lead_db_backup.sql

if($LASTEXITCODE -ne 0){

    Log "ERROR : Database backup failed."

    exit

}

docker cp "$PostgresContainer`:/tmp/lead_db_backup.sql" "$CurrentBackup\lead_db_backup.sql"

Log "Database Backup Completed"

# =====================================================
# BACKUP N8N CONFIG
# =====================================================

Log ""
Log "Backing up n8n configuration..."

docker cp "$N8NContainer`:/home/node/.n8n" "$CurrentBackup\n8n_config"

Log "n8n Configuration Copied"

# =====================================================
# COPY PROJECT FILES
# =====================================================

Log ""
Log "Copying Project Files..."

$Files = @(
".env",
".env.example",
"docker-compose.yml",
"README.md"
)

foreach($file in $Files){

    $Source = Join-Path $ProjectPath $file

    if(Test-Path $Source){

        Copy-Item $Source $CurrentBackup -Force

    }

}

$Folders = @(
"documentation",
"workflows"
)

foreach($folder in $Folders){

    $Source = Join-Path $ProjectPath $folder

    if(Test-Path $Source){

        Copy-Item $Source `
        "$CurrentBackup\$folder" `
        -Recurse `
        -Force

    }

}

Log "Project Files Copied"

# =====================================================
# CREATE ZIP
# =====================================================

Log ""
Log "Creating ZIP..."

Compress-Archive `
-Path "$CurrentBackup\*" `
-DestinationPath $ZipFile `
-Force

if(!(Test-Path $ZipFile)){

    Log "ERROR : ZIP Creation Failed."

    exit

}

Log "ZIP Created Successfully"

# =====================================================
# COPY TO GOOGLE DRIVE
# =====================================================

Log ""
Log "Copying ZIP to Google Drive..."

Copy-Item `
$ZipFile `
$GoogleDrivePath `
-Force

$CloudZip = Join-Path `
$GoogleDrivePath `
(Split-Path $ZipFile -Leaf)

if(Test-Path $CloudZip){

    Log "Google Drive Copy Verified"

}
else{

    Log "ERROR : ZIP not copied to Google Drive."

}

# =====================================================
# CLEAN TEMP
# =====================================================

Log ""
Log "Cleaning Temporary Files..."

Remove-Item `
$CurrentBackup `
-Recurse `
-Force

Log "Temporary Folder Removed"

# =====================================================
# KEEP LAST 10 ZIPS
# =====================================================

Log ""
Log "Cleaning Old Local Backups..."

Get-ChildItem `
$ZipFolder `
-Filter "*.zip" |

Sort-Object LastWriteTime -Descending |

Select-Object -Skip 10 |

Remove-Item -Force

Log "Cleanup Complete"

# =====================================================
# FINISHED
# =====================================================

Log ""
Log "==========================================="
Log "BACKUP COMPLETED SUCCESSFULLY"
Log "==========================================="
Log ""

Write-Host ""
Write-Host "--------------------------------------------" -ForegroundColor Green
Write-Host "Backup Completed Successfully" -ForegroundColor Green
Write-Host "--------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "Local Backup:"
Write-Host $ZipFile
Write-Host ""
Write-Host "Google Drive:"
Write-Host $GoogleDrivePath
Write-Host ""