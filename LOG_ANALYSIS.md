# 🔍 Анализ логов упражнений

## Что добавлено в логи:

### 1. Controller (exercises.controller.ts)
```
[CONTROLLER] 📨 getExercises request from userId: {userId}
[CONTROLLER] 📦 Request params: wordIds.length=X, wordLimit=Y, exerciseLimit=Z
[CONTROLLER] ✅ Sending N exercises to client
```

### 2. Service (exercises.service.ts)
```
[EXERCISES] 📥 Received request for userId: {userId}
[EXERCISES] 📥 Total wordIds: X
[EXERCISES] 📥 First 20 wordIds: [1234, 5678, ...]
[EXERCISES] 🔢 Unique wordIds: Y
[EXERCISES] 🎯 Limited to Z words (limit: N)
[EXERCISES] 🔍 After filtering known/ignored: M candidates
[EXERCISES] 🔍 Candidate IDs (first 20): [...]
[EXERCISES] 📖 Found K words in mueller_dictionary
[EXERCISES] 📖 First 5 words: [{id, word}, ...]
[EXERCISES] ✅ Returning L exercises
[EXERCISES] ✅ First 3 exercises: [{wordId, word, direction, prompt}, ...]
```

---

## 🎯 Что проверить в логах:

### ✅ Все работает правильно - если:

1. **Frontend отправляет правильные ID:**
   ```
   [EXERCISES] 📥 First 20 wordIds: [16794, 22608, 23436, 43500, ...]
   ```
   Эти ID должны быть из Mueller словаря (большие числа ~1000-46000)

2. **Backend находит слова в mueller_dictionary:**
   ```
   [EXERCISES] 📖 Found 50 words in mueller_dictionary
   [EXERCISES] 📖 First 5 words: [{id: 16794, word: 'give'}, {id: 22608, word: 'like'}, ...]
   ```

3. **Слова из субтитров видео:**
   Слова в `[EXERCISES] 📖 First 5 words` должны быть из видео, а не по алфавиту (a, b, c...)

---

### ❌ Проблемы - если:

#### 1. Frontend отправляет старые ID (маленькие числа ~1-7581):
```
[EXERCISES] 📥 First 20 wordIds: [1, 2, 3, 4, 5, ...]
```
**Причина:** Frontend использует старую `forms_index.db`
**Решение:** Пересобрать frontend приложение с новой `forms_index.db`

#### 2. Backend не находит слова:
```
[EXERCISES] 📖 Found 0 words in mueller_dictionary
[EXERCISES] ⚠️ No words found in mueller_dictionary for given IDs!
```
**Причина:** ID из frontend не существуют в `mueller_dictionary`
**Решение:** Проверить что на продакшн БД есть таблица `mueller_dictionary` с данными

#### 3. Слова по алфавиту вместо из видео:
```
[EXERCISES] 📖 First 5 words: [
  {id: 1247, word: 'a-'},
  {id: 1248, word: 'a-going'},
  {id: 1249, word: 'a-smoke'},
  ...
]
```
**Причина:** Frontend отправляет не те ID (первые из словаря)
**Решение:** Проверить `wordIdsFromSubtitles` - правильно ли извлекаются слова

---

## 📝 Пример правильных логов:

```
[CONTROLLER] 📨 getExercises request from userId: clxxx123456
[CONTROLLER] 📦 Request params: wordIds.length=127, wordLimit=undefined, exerciseLimit=40

[EXERCISES] 📥 Received request for userId: clxxx123456
[EXERCISES] 📥 Total wordIds: 127
[EXERCISES] 📥 First 20 wordIds: [16794, 22608, 23436, 43500, 18364, 25730, ...]
[EXERCISES] 🔢 Unique wordIds: 127
[EXERCISES] 🎯 Limited to 100 words (limit: 100)
[EXERCISES] 🔍 After filtering known/ignored: 98 candidates
[EXERCISES] 🔍 Candidate IDs (first 20): [16794, 22608, 23436, ...]
[EXERCISES] 📖 Found 98 words in mueller_dictionary
[EXERCISES] 📖 First 5 words: [
  { id: 16794, word: 'give' },
  { id: 22608, word: 'like' },
  { id: 23436, word: 'make' },
  { id: 43500, word: 'world' },
  { id: 18364, word: 'hello girl' }
]
[EXERCISES] ✅ Returning 40 exercises
[EXERCISES] ✅ First 3 exercises: [
  { wordId: 16794, word: 'give', direction: 'en-ru', prompt: 'give' },
  { wordId: 22608, word: 'like', direction: 'ru-en', prompt: 'нравиться' },
  { wordId: 23436, word: 'make', direction: 'en-ru', prompt: 'make' }
]

[CONTROLLER] ✅ Sending 40 exercises to client
```

---

## 🚀 Следующие шаги:

1. **Задеплой backend с логами** на `api.slothary.ru`
2. **Открой видео в приложении**
3. **Скопируй логи** из backend сервера
4. **Отправь мне логи** - я посмотрю что не так
