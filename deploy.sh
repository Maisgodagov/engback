#!/bin/bash

# Скрипт автоматического развертывания для English Backend
# Запускается при пуше в ветку prod

set -e  # Остановить выполнение при ошибке

echo "🚀 Начинаем развертывание English Backend..."

# Переходим в директорию проекта
cd /var/www/english-backend

# Получаем последние изменения из репозитория
echo "📥 Получаем последние изменения..."
git fetch origin
git reset --hard origin/prod

# Устанавливаем зависимости
echo "📦 Устанавливаем зависимости..."
npm ci --only=production

# Генерируем Prisma клиент
echo "🔧 Генерируем Prisma клиент..."
npx prisma generate

# Применяем миграции базы данных
echo "🗄️ Применяем миграции базы данных..."
npx prisma migrate deploy

# Собираем проект
echo "🏗️ Собираем проект..."
npm run build

# Создаем директорию для логов если её нет
mkdir -p logs

# Перезапускаем приложение через PM2
echo "🔄 Перезапускаем приложение..."
pm2 reload english-backend || pm2 start ecosystem.config.js --env production

# Показываем статус
echo "✅ Развертывание завершено!"
pm2 status english-backend

echo "🎉 English Backend успешно развернут!"
