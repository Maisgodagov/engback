#!/bin/bash

# Скрипт автоматического развертывания для English Backend
# Запускается при пуше в ветку prod

set -e  # Остановить выполнение при ошибке

echo "🚀 Начинаем развертывание English Backend..."

# Переходим в директорию проекта
cd /var/www/english-backend/engback

# Проверяем наличие git репозитория
if [ ! -d ".git" ]; then
    echo "❌ Git репозиторий не найден в текущей директории"
    echo "🔍 Ищем git репозиторий..."
    
    # Проверяем родительскую директорию
    cd /var/www/english-backend
    if [ -d ".git" ]; then
        echo "✅ Найден git репозиторий в /var/www/english-backend"
    elif [ -d "engback/.git" ]; then
        echo "✅ Найден git репозиторий в /var/www/english-backend/engback"
        cd engback
    else
        echo "❌ Git репозиторий не найден. Клонируем..."
        echo "❌ Необходимо вручную клонировать репозиторий"
        echo "Выполните: git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git engback"
        exit 1
    fi
fi

# Получаем последние изменения из репозитория
echo "📥 Получаем последние изменения..."
git fetch origin
git reset --hard origin/prod

# Устанавливаем зависимости (включая dev для сборки)
echo "📦 Устанавливаем зависимости..."
export NODE_OPTIONS="--max_old_space_size=1024"
export npm_config_jobs=1
export npm_config_maxsockets=1
npm ci --no-audit --no-fund --omit=optional

# Генерируем Prisma клиент
echo "🔧 Генерируем Prisma клиент..."
npx prisma generate

# Применяем миграции базы данных
echo "🗄️ Применяем миграции базы данных..."
npx prisma migrate deploy

# Собираем проект
echo "🏗️ Собираем проект..."
npm run build

# Удаляем dev зависимости после сборки для экономии места
echo "🧹 Очищаем dev зависимости..."
npm prune --production

# Создаем директорию для логов если её нет
mkdir -p logs

# Перезапускаем приложение через PM2
echo "🔄 Перезапускаем приложение..."
pm2 reload 1 || pm2 start ecosystem.config.js --env production

# Показываем статус
echo "✅ Развертывание завершено!"
pm2 status

echo "🎉 English Backend успешно развернут!"
