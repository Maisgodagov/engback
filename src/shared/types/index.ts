export enum UserRole {
  Student = "student",
  Teacher = "teacher",
  Admin = "admin",
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserProfileDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  streakDays: number;
  completedLessons: number;
  level: string;
  xpPoints: number;
}

export interface LessonDto {
  id: string;
  title: string;
  durationMinutes: number;
  order: number;
  contentPreview?: string;
}

export type LessonBlockText = {
  id: string;
  type: "text";
  text: string;
  format?: "paragraph" | "heading1" | "heading2" | "quote";
  align?: "left" | "center" | "right";
};

export type LessonBlockMedia = {
  id: string;
  type: "media";
  mediaType: "image" | "video" | "audio";
  url: string;
  caption?: string;
  autoplay?: boolean;
  loop?: boolean;
};

export type LessonBlockQuiz = {
  id: string;
  type: "quiz";
  question: string;
  options: string[];
  correctOption: number;
  explanation?: string;
  shuffleOptions?: boolean;
};

export type LessonBlockCallout = {
  id: string;
  type: "callout";
  title?: string;
  body: string;
  variant?: "info" | "success" | "warning" | "danger";
  icon?: string;
};

export type LessonBlockList = {
  id: string;
  type: "list";
  ordered?: boolean;
  items: string[];
};

export type LessonBlockEmbed = {
  id: string;
  type: "embed";
  url: string;
  caption?: string;
  provider?: string;
};

export type LessonContentBlock =
  | LessonBlockText
  | LessonBlockMedia
  | LessonBlockQuiz
  | LessonBlockCallout
  | LessonBlockList
  | LessonBlockEmbed;

export interface LessonContent {
  version: string;
  blocks: LessonContentBlock[];
  metadata?: Record<string, unknown>;
}

export interface LessonSummaryDto {
  id: string;
  title: string;
  description?: string;
  xpReward: number;
  durationMinutes?: number | null;
  updatedAt: string;
}

export interface LessonDetailDto extends LessonSummaryDto {
  content: LessonContent;
  createdAt: string;
}

export interface CourseDto {
  id: string;
  title: string;
  description: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  lessons: LessonDto[];
  progress: number;
}

export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: unknown;
}

export type RoleGuard = {
  role: UserRole;
  allowedRoutes: string[];
};

export interface AdminCourseModuleDto {
  id: string;
  title: string;
  description?: string;
  order: number;
  lessonCount: number;
}

export interface AdminCourseDto {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  price: string;
  difficultyLevels: string[];
  isPublished: boolean;
  modules: AdminCourseModuleDto[];
  updatedAt: string;
}

export interface AdminModuleLessonDto {
  id: string;
  title: string;
  order: number;
  xpReward: number;
}

export interface AdminModuleCourseRefDto {
  id: string;
  title: string;
  order: number;
}

export interface AdminModuleDto {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  lessons: AdminModuleLessonDto[];
  courses: AdminModuleCourseRefDto[];
  updatedAt: string;
}

export interface AdminCatalogDto {
  courses: AdminCourseDto[];
  modules: AdminModuleDto[];
  lessons: LessonSummaryDto[];
}
