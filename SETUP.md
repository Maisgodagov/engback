# 🚀 Быстрый старт

## Шаг 1: Очистка проекта

Запустите скрипт для удаления старых папок:

```bash
cleanup.bat
```

## Шаг 2: Установка зависимостей

```bash
npm install
```

## Шаг 3: Создайте .env файл

Создайте файл `.env` в корне проекта со следующим содержимым:

```env
DATABASE_URL="mysql://root:password@localhost:3306/english_db"
PORT=3001
NODE_ENV=development
```

**⚠️ Замените:**
- `root` - на ваш MySQL username
- `password` - на ваш MySQL password
- `english_db` - на имя вашей базы данных (БД будет создана автоматически)

## Шаг 4: Генерация Prisma клиента

```bash
npm run prisma:generate
```

## Шаг 5: Запуск миграций

```bash
npm run prisma:migrate
```

При запросе имени миграции можете просто нажать Enter или написать что-то вроде "init".

## Шаг 6: Заполнение базы тестовыми данными

```bash
npm run prisma:seed
```

Это создаст 3 тестовых пользователя:
- **Студент:** student@test.com / password123
- **Учитель:** teacher@test.com / teacher123
- **Администратор:** admin@test.com / admin123

## Шаг 7: Запуск сервера

```bash
npm run dev
```

Сервер запустится на http://localhost:3001

## ✅ Проверка работы

### Проверка здоровья сервера:
```bash
curl http://localhost:3001/health
```

### Вход в систему:
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"student@test.com\",\"password\":\"password123\"}"
```

### Получение списка пользователей:
```bash
curl http://localhost:3001/api/users
```

### Открыть Prisma Studio (GUI для базы данных):
```bash
npm run prisma:studio
```

## 🎉 Готово!

Ваш backend работает! Теперь вы можете:
- Использовать API endpoints
- Просматривать данные через Prisma Studio
- Разрабатывать новые функции

