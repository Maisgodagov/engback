@echo off
chcp 65001
echo ========================================
echo 🚀 Запуск English Backend
echo ========================================
echo.

echo [1/6] Установка зависимостей...
call npm install
if %errorlevel% neq 0 (
    echo ❌ Ошибка при установке зависимостей
    pause
    exit /b 1
)
echo ✅ Зависимости установлены
echo.

echo [2/6] Генерация Prisma клиента...
call npm run prisma:generate
if %errorlevel% neq 0 (
    echo ❌ Ошибка при генерации Prisma клиента
    pause
    exit /b 1
)
echo ✅ Prisma клиент сгенерирован
echo.

echo [3/6] Запуск миграций...
echo Пропускаем - запустите вручную: npm run prisma:migrate
echo.

echo [4/6] Заполнение базы тестовыми данными...
echo Пропускаем - запустите вручную: npm run prisma:seed
echo.

echo ========================================
echo ✅ Готово к запуску!
echo ========================================
echo.
echo Следующие шаги:
echo 1. Создайте файл .env (см. .env.example)
echo 2. Запустите: npm run prisma:migrate
echo 3. Запустите: npm run prisma:seed
echo 4. Запустите: npm run dev
echo.
pause

