@echo off
chcp 65001 >nul
cls
echo.
echo ╔══════════════════════════════════════════╗
echo ║   English Backend - Быстрый старт        ║
echo ╚══════════════════════════════════════════╝
echo.
echo 📋 Пошаговые инструкции:
echo.
echo ┌─ Шаг 1: Создайте .env файл ─────────────┐
echo │                                          │
echo │ DATABASE_URL="mysql://root:password@localhost:3306/english_db"
echo │ PORT=3001                                │
echo │ NODE_ENV=development                     │
echo │                                          │
echo │ (Замените root и password на свои)      │
echo └──────────────────────────────────────────┘
echo.
echo.
echo ┌─ Шаг 2: Выполните команды ──────────────┐
echo.
echo   1️⃣  npm install
echo   2️⃣  npm run prisma:generate
echo   3️⃣  npm run prisma:migrate
echo   4️⃣  npm run prisma:seed
echo   5️⃣  npm run dev
echo.
echo └──────────────────────────────────────────┘
echo.
echo.
echo 👤 Тестовые пользователи будут созданы:
echo   • student@test.com / password123
echo   • teacher@test.com / teacher123
echo   • admin@test.com / admin123
echo.
echo.
echo Нажмите любую клавишу для автоматического запуска команд 1-2
echo (или закройте окно и выполните команды вручную)
pause >nul

echo.
echo ═══════════════════════════════════════════
echo 🔄 Начинаем установку...
echo ═══════════════════════════════════════════
echo.

echo [1/2] 📦 Установка зависимостей...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ❌ Ошибка! Проверьте, установлен ли Node.js
    pause
    exit /b 1
)
echo ✅ Зависимости установлены
echo.

echo [2/2] 🔨 Генерация Prisma клиента...
call npm run prisma:generate
if %errorlevel% neq 0 (
    echo.
    echo ❌ Ошибка при генерации Prisma клиента
    pause
    exit /b 1
)
echo ✅ Prisma клиент готов
echo.
echo.
echo ═══════════════════════════════════════════
echo 🎉 Автоматическая установка завершена!
echo ═══════════════════════════════════════════
echo.
echo ⚠️  Теперь выполните вручную:
echo.
echo   1. Создайте файл .env (см. выше)
echo   2. npm run prisma:migrate
echo   3. npm run prisma:seed
echo   4. npm run dev
echo.
echo 💡 Или откройте новое окно терминала и выполните команды там
echo.
pause

