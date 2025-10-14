import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Начинаем заполнение базы данных...');

  // Создаем тестового студента
  const studentPassword = await bcrypt.hash('password123', 10);
  const student = await prisma.user.upsert({
    where: { email: 'student@test.com' },
    update: {},
    create: {
      email: 'student@test.com',
      fullName: 'Иван Студент',
      role: 'student',
      passwordHash: studentPassword,
      level: 'A2',
      streakDays: 5,
      completedLessons: 12,
      avatarUrl: null,
    },
  });
  console.log('✅ Создан студент:', student.email);

  // Создаем тестового учителя
  const teacherPassword = await bcrypt.hash('teacher123', 10);
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@test.com' },
    update: {},
    create: {
      email: 'teacher@test.com',
      fullName: 'Мария Учитель',
      role: 'teacher',
      passwordHash: teacherPassword,
      level: 'C2',
      streakDays: 100,
      completedLessons: 500,
      avatarUrl: null,
    },
  });
  console.log('✅ Создан учитель:', teacher.email);

  // Создаем администратора
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      fullName: 'Администратор',
      role: 'admin',
      passwordHash: adminPassword,
      level: 'C2',
      streakDays: 365,
      completedLessons: 1000,
      avatarUrl: null,
    },
  });
  console.log('✅ Создан администратор:', admin.email);

  // Добавляем несколько слов в словарь студента
  await prisma.userWord.createMany({
    data: [
      {
        userId: student.id,
        word: 'hello',
        translation: 'привет',
        transcription: '[həˈləʊ]',
        partOfSpeech: 'interjection',
        sourceLang: 'en',
        targetLang: 'ru',
      },
      {
        userId: student.id,
        word: 'world',
        translation: 'мир',
        transcription: '[wɜːld]',
        partOfSpeech: 'noun',
        sourceLang: 'en',
        targetLang: 'ru',
      },
      {
        userId: student.id,
        word: 'learn',
        translation: 'учить',
        transcription: '[lɜːn]',
        partOfSpeech: 'verb',
        sourceLang: 'en',
        targetLang: 'ru',
      },
    ],
    skipDuplicates: true,
  });
  console.log('✅ Добавлены тестовые слова в словарь');

  console.log('\n🎉 База данных успешно заполнена!');
  console.log('\n📝 Тестовые пользователи:');
  console.log('─────────────────────────────────────────');
  console.log('Студент:       student@test.com / password123');
  console.log('Учитель:       teacher@test.com / teacher123');
  console.log('Администратор: admin@test.com / admin123');
  console.log('─────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка при заполнении базы данных:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

