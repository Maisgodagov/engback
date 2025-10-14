@echo off
chcp 65001
echo ========================================
echo 🔌 Настройка подключения к Beget MySQL
echo ========================================
echo.

echo Создаем файл .env...
copy .env.beget .env

echo.
echo ✅ Файл .env создан с настройками Beget
echo.
echo 📋 Данные подключения:
echo    Сервер: mgodag3j.beget.tech:3306
echo    БД: mgodag3j_english
echo    Пользователь: mgodag3j_english
echo.
echo Теперь выполните:
echo   1. npm run prisma:generate
echo   2. npm run prisma:migrate
echo   3. npm run prisma:seed
echo   4. npm run dev
echo.
pause

