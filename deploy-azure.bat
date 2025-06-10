@echo off
REM Azure Deployment Batch File
REM This makes it easier to run the PowerShell script

echo.
echo ========================================
echo   GitHub OAuth Proxy - Azure Deploy
echo ========================================
echo.

REM Check if PowerShell is available
powershell -Command "Get-Host" >nul 2>&1
if errorlevel 1 (
    echo ERROR: PowerShell not found
    echo Please install PowerShell and try again
    pause
    exit /b 1
)

REM Run the deployment script
powershell -ExecutionPolicy Bypass -File "deploy-azure.ps1" %*

echo.
echo Deployment script finished.
pause
