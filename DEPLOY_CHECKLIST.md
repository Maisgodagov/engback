# 🚀 Checklist для деплоя Mueller словаря

## ✅ Что уже сделано (локально):

### Backend:
- [x] Создана таблица `mueller_dictionary` (46,595 слов)
- [x] Импортированы данные из `mueller_base_clean_semicolon_final4.csv`
- [x] Обновлен `exercises.service.ts` для работы с `mueller_dictionary`
- [x] Создан модуль `/api/mueller` (lookup, getById, batch)
- [x] Обновлена Prisma схема
- [x] Протестировано локально ✅

### Frontend:
- [x] Сгенерирована новая `forms_index.db` с Mueller ID (2.3 MB)
- [x] Обновлены типы (`lemma` → `word`, `pos` → `partOfSpeech`)
- [x] Обновлен `WordLookupProvider` на Mueller API
- [x] Обновлен `exerciseAdapter.ts`

---

## 📋 План деплоя:

### 1. Деплой Backend на api.slothary.ru

**Нужно:**
1. Закоммитить и запушить изменения в EnglishBackend
2. Подключиться к серверу где hosted `api.slothary.ru`
3. Сделать `git pull` на сервере
4. Запустить `npx prisma generate` (обновить Prisma client)
5. Перезапустить backend сервис
6. Проверить что таблица `mueller_dictionary` уже есть в БД (мы её создали скриптом)

**Важно:** Таблица `mueller_dictionary` с данными уже есть в продакшн БД! Мы импортировали её через скрипт `import-mueller-dictionary.js`

### 2. Пересборка Frontend приложения

**Нужно:**
1. Убедиться что `assets/forms_index.db` обновлена (уже сделано)
2. Пересобрать приложение: `eas build --platform android --profile preview`
3. Установить новый APK на устройство
4. Проверить что упражнения показывают слова из субтитров видео

### 3. Тестирование

**Проверить:**
- [ ] Открыть любое видео
- [ ] Проверить что упражнения содержат слова которые есть в субтитрах
- [ ] Lookup слова через tap - должен показать перевод из Mueller
- [ ] Добавить слово в словарь - должно работать
- [ ] Отметить "Знаю слово" - должно работать

### 4. Cleanup (после успешного теста)

**После того как всё работает:**
- [ ] Удалить старые таблицы:
  ```sql
  DROP TABLE dict_word_forms;
  DROP TABLE dict_translations;
  DROP TABLE dict_words;
  ```

---

## 🔧 Команды для деплоя Backend:

```bash
# На локальной машине
cd C:/dev/EnglishBackend
git add .
git commit -m "feat: migrate to Mueller dictionary (46K words)"
git push origin main

# На сервере (ssh в api.slothary.ru)
cd /path/to/EnglishBackend
git pull origin main
npm install
npx prisma generate
pm2 restart english-backend  # или как там называется процесс
```

## 🔧 Команды для деплоя Frontend:

```bash
cd C:/dev/EnglishPlatform
# Проверить что forms_index.db обновлена
ls -lh assets/forms_index.db  # должно быть 2.3 MB

# Собрать APK
eas build --platform android --profile preview

# После сборки - скачать и установить
```

---

## 📊 Ожидаемые результаты:

**До деплоя (сейчас):**
- Упражнения показывают случайные слова по алфавиту (a-z)
- Потому что frontend отправляет новые Mueller ID, а backend ищет в старых таблицах

**После деплоя:**
- ✅ Упражнения показывают только слова из субтитров видео
- ✅ 46,595 слов вместо 7,581
- ✅ Lookup работает быстрее (локальная БД вместо Yandex API)
- ✅ Больше не нужны таблицы с формами слов

---

## ⚠️ Важно:

- **НЕ удалять старые таблицы до тестирования!**
- Убедиться что `mueller_dictionary` с данными есть на продакшн БД
- Если что-то пойдет не так - можно откатиться к старому коду
