# 🚀 Руководство по развертыванию English Backend

## Пошаговая инструкция настройки автоматического развертывания

### 1. Подготовка репозитория

#### 1.1 Создание ветки prod
```bash
# Создаем ветку prod
git checkout -b prod

# Пушим ветку на GitHub
git push -u origin prod
```

### 2. Настройка VPS сервера

#### 2.1 Подключение к серверу
```bash
ssh your_username@your_server_ip
```

#### 2.2 Создание директории для проекта
```bash
# Создаем директорию для проекта
sudo mkdir -p /var/www/english-backend
sudo chown $USER:$USER /var/www/english-backend
cd /var/www/english-backend/engback
```

#### 2.3 Клонирование репозитория
```bash
# Клонируем репозиторий
git clone https://github.com/your_username/your_repo_name.git engback
cd engback

# Переключаемся на ветку prod
git checkout prod
```

#### 2.4 Установка зависимостей
```bash
# Устанавливаем Node.js (если не установлен)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Устанавливаем PM2 глобально (если не установлен)
sudo npm install -g pm2

# Устанавливаем зависимости проекта
npm ci --only=production
```

#### 2.5 Настройка базы данных
```bash
# Генерируем Prisma клиент
npx prisma generate

# Применяем миграции
npx prisma migrate deploy
```

#### 2.6 Сборка проекта
```bash
# Собираем проект
npm run build
```

#### 2.7 Создание директории для логов
```bash
mkdir -p logs
```

#### 2.8 Создание .env файла
```bash
# Создаем .env файл с настройками для продакшена
nano .env
```

Добавьте в .env файл:
```env
NODE_ENV=production
PORT=3002
DATABASE_URL="your_production_database_url"
JWT_SECRET="your_jwt_secret"
```

#### 2.9 Первый запуск через PM2
```bash
# Запускаем приложение через PM2
pm2 start ecosystem.config.js --env production

# Сохраняем конфигурацию PM2
pm2 save

# Настраиваем автозапуск PM2 при перезагрузке сервера
pm2 startup
```

### 3. Настройка GitHub Actions

#### 3.1 Добавление секретов в GitHub
Перейдите в настройки репозитория GitHub:
1. Settings → Secrets and variables → Actions
2. Добавьте следующие секреты:
   - `HOST` - IP адрес вашего VPS сервера
   - `USERNAME` - имя пользователя для SSH подключения
   - `SSH_KEY` - приватный SSH ключ для подключения к серверу

#### 3.2 Создание SSH ключа (если нужно)
```bash
# На сервере создаем SSH ключ
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# Копируем публичный ключ в authorized_keys
cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys

# Копируем приватный ключ для GitHub Secrets
cat ~/.ssh/id_rsa
```

### 4. Настройка файрвола (если нужно)

```bash
# Открываем порт 3002 для приложения
sudo ufw allow 3002

# Проверяем статус файрвола
sudo ufw status
```

### 5. Настройка Nginx (опционально, для проксирования)

#### 5.1 Установка Nginx
```bash
sudo apt update
sudo apt install nginx
```

#### 5.2 Создание конфигурации
```bash
sudo nano /etc/nginx/sites-available/english-backend
```

Добавьте конфигурацию:
```nginx
server {
    listen 80;
    server_name your_domain.com;  # замените на ваш домен

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 5.3 Активация конфигурации
```bash
sudo ln -s /etc/nginx/sites-available/english-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Тестирование развертывания

#### 6.1 Проверка работы приложения
```bash
# Проверяем статус PM2
pm2 status

# Проверяем логи
pm2 logs english-backend

# Проверяем работу приложения
curl http://localhost:3002/health

# Проверяем API курсов
curl http://localhost:3002/api/courses

# Проверяем API пользователей
curl http://localhost:3002/api/users
```

#### 6.2 Тестирование автоматического развертывания
1. Внесите изменения в код
2. Сделайте коммит и пуш в ветку `prod`
3. Проверьте, что GitHub Actions запустился
4. Убедитесь, что приложение перезапустилось на сервере

### 7. Полезные команды для управления

```bash
# Просмотр статуса PM2
pm2 status

# Просмотр логов
pm2 logs english-backend

# Перезапуск приложения
pm2 restart english-backend

# Остановка приложения
pm2 stop english-backend

# Удаление приложения из PM2
pm2 delete english-backend

# Мониторинг в реальном времени
pm2 monit
```

### 8. Резервное копирование

#### 8.1 Создание скрипта резервного копирования
```bash
nano /var/www/backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/english-backend"

mkdir -p $BACKUP_DIR

# Резервная копия базы данных (если используется PostgreSQL)
pg_dump your_database_name > $BACKUP_DIR/db_backup_$DATE.sql

# Резервная копия файлов приложения
tar -czf $BACKUP_DIR/app_backup_$DATE.tar.gz /var/www/english-backend

# Удаляем старые резервные копии (старше 7 дней)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
```

#### 8.2 Настройка автоматического резервного копирования
```bash
chmod +x /var/www/backup.sh

# Добавляем в crontab (ежедневно в 2:00)
crontab -e
# Добавьте строку:
0 2 * * * /var/www/backup.sh
```

## 🔧 Устранение неполадок

### Проблемы с правами доступа
```bash
# Исправляем права доступа
sudo chown -R $USER:$USER /var/www/english-backend
chmod +x /var/www/english-backend/deploy.sh
```

### Проблемы с базой данных
```bash
# Проверяем подключение к базе данных
npx prisma db pull

# Сбрасываем базу данных (ОСТОРОЖНО!)
npx prisma migrate reset
```

### Проблемы с PM2
```bash
# Перезапускаем PM2
pm2 kill
pm2 start ecosystem.config.js --env production
pm2 save
```

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте логи PM2: `pm2 logs english-backend`
2. Проверьте логи Nginx: `sudo tail -f /var/log/nginx/error.log`
3. Проверьте статус сервисов: `sudo systemctl status nginx`

---

**Готово!** 🎉 Теперь при каждом пуше в ветку `prod` ваше приложение будет автоматически обновляться на сервере.
