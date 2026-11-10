@echo off
chcp 65001 >nul
echo Остановка контейнера D^&D 5.5e...
docker compose down
echo Готово!
timeout /t 2 >nul
