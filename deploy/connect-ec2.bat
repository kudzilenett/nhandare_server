@echo off
echo Connecting to Nhandare EC2 instance...
echo.

REM Check if PEM file exists
if not exist "C:\Users\KudziZvourerenexo\Downloads\nhandare.pem" (
    echo ERROR: nhandare.pem file not found!
    echo Please make sure the file is in your Downloads folder.
    pause
    exit /b 1
)

echo PEM file found. Connecting to EC2...
echo.
echo Connecting to: ubuntu@51.20.12.21
echo Using key: C:\Users\KudziZvourerenexo\Downloads\nhandare.pem
echo.

REM Connect to EC2
ssh -i "C:\Users\KudziZvourerenexo\Downloads\nhandare.pem" ubuntu@51.20.12.21

echo.
echo Disconnected from EC2.
pause
