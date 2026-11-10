@echo off
chcp 65001 >nul
echo ========================================================
echo   Запуск Интерактивного Листа Персонажа D^&D 5.5e...
echo ========================================================
echo.

docker compose up -d --build
if %errorlevel% neq 0 (
    echo.
    echo [Ошибка] Не удалось запустить Docker.
    echo Убедитесь, что программа Docker Desktop установлена и запущена!
    pause
    exit /b 1
)

echo.
echo Приложение успешно запущено! Открываем http://localhost:3000 ...
timeout /t 2 >nul
start http://localhost:3000
