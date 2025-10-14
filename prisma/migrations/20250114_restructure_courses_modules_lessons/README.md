# Миграция: Реструктуризация курсов, модулей и уроков

## Описание

Эта миграция полностью переделывает структуру обучающего контента, переходя от жестко связанной структуры `LearningPath` к гибкой системе переиспользуемых курсов, модулей и уроков.

## Изменения

### Удалено:
- `learning_path_modules` - старая таблица модулей
- `learning_path_lessons` - старая таблица уроков
- `learning_path_lesson_progress` - старая таблица прогресса
- Enum `LessonProgressStatus`

### Добавлено:

#### Новые Enums:
- `ProgressStatus` - статус прогресса (NOT_STARTED, IN_PROGRESS, COMPLETED)
- `DifficultyLevel` - уровень сложности (ZERO, A1, A2, B1, B2, C1, C2)

#### Основные таблицы:
1. **courses** - Курсы
   - `id`, `title`, `description`, `imageUrl`
   - `price` - цена курса
   - `difficultyLevels` - строка с уровнями (например "A1,A2,B1")
   - `isPublished` - опубликован ли курс

2. **modules** - Модули (переиспользуемые блоки)
   - `id`, `title`, `description`, `imageUrl`

3. **lessons** - Уроки (независимые единицы контента)
   - `id`, `title`, `description`
   - `content` - JSON структура с блоками контента
   - `xpReward` - награда за прохождение
   - `duration` - ожидаемое время прохождения

#### Связующие таблицы:
4. **course_modules** - связь многие-ко-многим между курсами и модулями
   - Позволяет добавлять один модуль в несколько курсов
   - `order` - порядок модуля в конкретном курсе

5. **module_lessons** - связь многие-ко-многим между модулями и уроками
   - Позволяет использовать один урок в нескольких модулях
   - `order` - порядок урока в конкретном модуле

#### Таблицы прогресса:
6. **user_course_progress** - прогресс пользователя по курсам
   - `status`, `progress` (0-100%), `startedAt`, `completedAt`

7. **user_module_progress** - прогресс пользователя по модулям
   - `status`, `progress` (0-100%), `startedAt`, `completedAt`

8. **user_lesson_progress** - прогресс пользователя по урокам
   - `status`, `stars` (0-3), `score`, `startedAt`, `completedAt`

## Структура JSON контента урока

Поле `content` в таблице `lessons` хранит JSON структуру следующего формата:

```json
{
  "blocks": [
    {
      "id": "block_1",
      "type": "text",
      "content": "Текстовое содержимое",
      "style": {
        "fontSize": 16,
        "fontWeight": "normal",
        "alignment": "left"
      }
    },
    {
      "id": "block_2",
      "type": "image",
      "url": "https://example.com/image.jpg",
      "caption": "Подпись к изображению",
      "width": 800,
      "height": 600
    },
    {
      "id": "block_3",
      "type": "video",
      "url": "https://example.com/video.mp4",
      "thumbnail": "https://example.com/thumb.jpg",
      "duration": 120
    },
    {
      "id": "block_4",
      "type": "audio",
      "url": "https://example.com/audio.mp3",
      "transcript": "Транскрипт аудио",
      "duration": 60
    },
    {
      "id": "block_5",
      "type": "widget",
      "widgetType": "quiz",
      "data": {
        "question": "Вопрос викторины",
        "options": ["Вариант 1", "Вариант 2"],
        "correctAnswer": 0
      }
    }
  ]
}
```

### Типы блоков:
- **text** - текстовый блок
- **image** - изображение
- **video** - видео
- **audio** - аудио с транскриптом
- **widget** - интерактивный виджет (quiz, exercise, и т.д.)

## Преимущества новой структуры

1. **Переиспользование контента**: Один модуль/урок можно использовать в разных курсах
2. **Гибкость**: Легко создавать новые курсы, комбинируя существующие модули
3. **Масштабируемость**: JSON контент позволяет добавлять новые типы блоков без изменения схемы БД
4. **Детальный прогресс**: Отслеживание на трех уровнях (курс, модуль, урок)
5. **Монетизация**: Поддержка платных курсов

## Применение миграции

Чтобы применить миграцию вручную:

```bash
# Подключиться к MySQL
mysql -h mgodag3j.beget.tech -u mgodag3j_english -p mgodag3j_english

# Выполнить SQL файл
source prisma/migrations/20250114_restructure_courses_modules_lessons/migration.sql;
```

Или через Prisma:
```bash
npx prisma migrate deploy
```

## Откат миграции

⚠️ **ВНИМАНИЕ**: Эта миграция удаляет старые таблицы! Данные будут потеряны!

Перед применением рекомендуется:
1. Создать backup базы данных
2. Убедиться, что старые данные не нужны или уже перенесены
