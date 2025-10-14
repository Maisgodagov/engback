export type DefaultModuleConfig = {
  order: number;
  title: string;
  description?: string;
  icon?: string;
  theme?: string;
  lessons: Array<{
    order: number;
    title: string;
    description?: string;
    icon?: string;
    xpReward?: number;
    difficulty?: number;
    skill?: string;
  }>;
};

export const DEFAULT_ROADMAP: DefaultModuleConfig[] = [
  {
    order: 1,
    title: 'Основы общения',
    description: 'Стартовый модуль для новичков — простые приветствия и базовые фразы.',
    icon: '🗣️',
    theme: 'starter',
    lessons: [
      {
        order: 1,
        title: 'Hello, world!',
        description: 'Приветствия, знакомство и вежливые фразы.',
        icon: '👋',
        xpReward: 15,
        difficulty: 1,
        skill: 'greetings',
      },
      {
        order: 2,
        title: 'Family & Friends',
        description: 'Рассказываем о себе и близких.',
        icon: '👨‍👩‍👧',
        xpReward: 20,
        difficulty: 1,
        skill: 'people',
      },
      {
        order: 3,
        title: 'Daily Routine',
        description: 'Бытовые действия и простые глаголы.',
        icon: '⏰',
        xpReward: 20,
        difficulty: 2,
        skill: 'verbs',
      },
      {
        order: 4,
        title: 'Check-point 1',
        description: 'Короткий квиз для закрепления материалов модуля.',
        icon: '⭐',
        xpReward: 25,
        difficulty: 2,
        skill: 'review',
      },
    ],
  },
  {
    order: 2,
    title: 'Путешествия',
    description: 'Ситуации из поездок: аэропорт, отель и кафе.',
    icon: '🧳',
    theme: 'travel',
    lessons: [
      {
        order: 1,
        title: 'At the Airport',
        description: 'Регистрация, посадка и вопросы безопасности.',
        icon: '✈️',
        xpReward: 20,
        difficulty: 2,
        skill: 'travel',
      },
      {
        order: 2,
        title: 'Hotel Check-in',
        description: 'Разговор с ресепшеном и брони.',
        icon: '🏨',
        xpReward: 20,
        difficulty: 2,
        skill: 'hotel',
      },
      {
        order: 3,
        title: 'Restaurant Time',
        description: 'Заказ еды, уточняем предпочтения и аллергию.',
        icon: '🍽️',
        xpReward: 25,
        difficulty: 3,
        skill: 'food',
      },
      {
        order: 4,
        title: 'City Quest',
        description: 'Практика на улице: навигация и покупки.',
        icon: '🗺️',
        xpReward: 25,
        difficulty: 3,
        skill: 'city',
      },
    ],
  },
  {
    order: 3,
    title: 'Работа и карьера',
    description: 'Переписка, встречи и презентации на работе.',
    icon: '💼',
    theme: 'career',
    lessons: [
      {
        order: 1,
        title: 'Email Etiquette',
        description: 'Пишем формальные и неформальные письма.',
        icon: '✉️',
        xpReward: 25,
        difficulty: 3,
        skill: 'writing',
      },
      {
        order: 2,
        title: 'Stand-up Meeting',
        description: 'Участвуем в созвонах и обсуждениях прогресса.',
        icon: '🗓️',
        xpReward: 25,
        difficulty: 3,
        skill: 'meetings',
      },
      {
        order: 3,
        title: 'Pitch Perfect',
        description: 'Презентации и сторителлинг для продукта.',
        icon: '🧠',
        xpReward: 30,
        difficulty: 4,
        skill: 'presentation',
      },
      {
        order: 4,
        title: 'Negotiation Lab',
        description: 'Практика переговоров и аргументации.',
        icon: '🤝',
        xpReward: 30,
        difficulty: 4,
        skill: 'negotiation',
      },
    ],
  },
];

export const seedModuleToCreateInput = (module: DefaultModuleConfig) => ({
  title: module.title,
  description: module.description,
  order: module.order,
  theme: module.theme,
  icon: module.icon,
  lessons: {
    create: module.lessons.map((lesson) => ({
      title: lesson.title,
      description: lesson.description,
      order: lesson.order,
      icon: lesson.icon,
      xpReward: lesson.xpReward ?? 15,
      difficulty: lesson.difficulty ?? 1,
      skill: lesson.skill,
    })),
  },
});
