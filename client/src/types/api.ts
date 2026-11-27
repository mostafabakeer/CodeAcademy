/**
 * Types موحدة لـ API responses
 * مصدر واحد للحقيقة لجميع أنواع الاستجابات
 */

// ===== Base Types (from backend) =====

export interface Course {
  id: number;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  image: string;
  grade: string;
  order: number;
  createdAt: number;
}

export interface Lesson {
  id: number;
  courseId: number;
  title: string;
  titleEn: string;
  videoType: 'youtube' | 'upload';
  videoUrl: string;
  duration: number;
  description: string;
  descriptionEn: string;
  grade: string;
  order: number;
  createdAt: number;
}

export interface Exam {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  timeLimit: number | null;
  passingScore: number;
  grade: string;
  allowRetake: boolean;
  order: number;
  createdAt: number;
  isHidden?: boolean;
  publishedAt?: string | null;
}

export interface Note {
  id: number;
  courseId: number | null;
  title: string;
  titleEn: string;
  body: string;
  bodyEn: string;
  image: string;
  pdf: string;
  grade: string;
  order: number;
  createdAt: number;
}

export interface Question {
  id: number;
  examId: number;
  type: 'mcq' | 'essay';
  points: number;
  text: string;
  textEn: string;
  options: { text: string; textEn: string }[];
  correctIndex: number;
  image: string;
  explanation: string;
  explanationEn: string;
  order: number;
}

export interface SafeUser {
  id: number;
  fullName: string;
  username?: string;
  phone: string;
  grade: string;
  role: 'student' | 'admin';
  subscription: boolean;
  blocked: boolean;
  createdAt: number;
}

export interface Tier {
  min: number;
  key: string;
  name: string;
  nameEn: string;
}

// ===== Base Response Types =====

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  detail?: string;
  code?: string;
  ok?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export interface CountsResponse {
  all: number;
  subscribed: number;
  unsubscribed: number;
  blocked: number;
}

// ===== Auth Types =====

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  phone: string;
  grade: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: SafeUser;
}

export interface MeResponse {
  user: SafeUser;
  levels: Tier[];
  examResults: ExamResultSummary[];
  pendingExamIds?: number[];
  token?: string;
}

export interface ExamResultSummary {
  examId: number;
  best: number;
  score: number;
  correct: number;
  total: number;
  attempts: number;
}

export interface ForgotPasswordRequest {
  phone: string;
}

export interface ForgotPasswordStatusResponse {
  status: 'none' | 'pending' | 'approved' | 'completed' | 'rejected';
  codeRequired?: boolean;
  codeExpiresAt?: number | null;
}

export interface ForgotPasswordCompleteRequest {
  phone: string;
  password: string;
  code: string;
}

// ===== Content Types =====

export interface CourseWithProgress extends Course {
  lessonCount: number;
  completedLessons: number;
  duration: number;
  watchedSeconds: number;
  progress: number;
}

export interface LessonWithProgress extends Lesson {
  watchedSeconds: number;
  completed: boolean;
  progressPct: number;
}

export interface ExamWithDetails extends Exam {
  questions: ExamQuestion[];
  lastResult?: ExamResultSummary | null;
  pendingSubmission?: { id: number; status: 'pending_review'; submittedAt: number } | null;
  lastSubmission?: ExamSubmission | null;
}

export interface ExamQuestion {
  id: number;
  type: 'mcq' | 'essay';
  points: number;
  text: string;
  textEn: string;
  options: { text: string; textEn: string }[];
  correctIndex?: number;
  explanation?: string;
  explanationEn?: string;
  hasImage?: boolean;
  image?: string;
  order?: number;
}

export interface ExamSubmission {
  id: number;
  status: 'graded';
  attemptNumber: number;
  submittedAt: number;
  score: number | null;
  mcqScore: number;
  mcqTotal: number;
  earnedPoints: number;
  maximumPoints: number;
  essayQuestions: { id: number; text: string; textEn: string; points: number }[];
  essayAnswers: Record<string, string>;
  essayGrades: Record<string, { score: number; comment: string }>;
}

export interface NoteWithCourse extends Note {
  courseTitle?: string;
  courseTitleEn?: string;
}

// ===== Admin Types =====

export interface AdminUser extends SafeUser {
  gradeName: string;
  examAvg: number;
  watchRatio: number;
  points: number;
  level: {
    min: number;
    key: string;
    name: string;
    nameEn: string;
  };
  completedLessons: number;
  totalLessons: number;
  examsTaken: number;
  totalExams: number;
  examScores: { examId: number; at: number; score: number }[];
}

export interface AdminUserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  counts: CountsResponse;
}

export interface AdminStats {
  students: number;
  admins: number;
  subscribed: number;
  courses: number;
  lessons: number;
  exams: number;
  notes: number;
  codeFiles: number;
}

export interface AdminDashboardBatchResponse {
  stats: AdminStats;
  usersCount: number;
  pendingEssays: number;
  recentStudents: { id: number; full_name: string; phone: string; grade: string; subscription: boolean; created_at: number }[];
  recentExams: { id: number; title: string; grade: string; is_hidden: boolean; created_at: number }[];
}

export interface ExamResultRow {
  userId: number;
  fullName: string;
  phone: string;
  grade: string;
  best: number;
  score: number;
  correct: number;
  total: number;
  attempts: number;
  at: number;
  rank: number;
}

export interface ExamResultsResponse {
  exam: { id: number; title: string; titleEn: string; grade: string };
  results: ExamResultRow[];
  total: number;
  page: number;
  limit: number;
}

export interface EssaySubmissionListItem {
  id: number;
  userId: number;
  examId: number;
  attemptNumber: number;
  status: 'pending_review' | 'graded';
  submittedAt: number;
  fullName: string;
  phone: string;
  examTitle: string;
  examTitleEn: string;
  mcqEarnedPoints?: number;
  mcqMaxPoints?: number;
}

export interface EssaySubmissionsResponse {
  submissions: EssaySubmissionListItem[];
  total: number;
  page: number;
}

export interface EssaySubmissionDetail {
  submission: {
    id: number;
    examId: number;
    attemptNumber: number;
    status: 'pending_review' | 'graded';
    mcqScore: number;
    mcqCorrect: number;
    mcqTotal: number;
    score: number | null;
    earnedPoints: number;
    maximumPoints: number;
    submittedAt: number;
    gradedAt: number | null;
  };
  student: { id: number; fullName: string; phone: string; grade: string };
  exam: { id: number; title: string; titleEn: string };
  questions: EssaySubmissionQuestion[];
}

export interface EssaySubmissionQuestion {
  id: number;
  text: string;
  textEn: string;
  points: number;
  answer: string;
  grade: { score: number; comment: string } | null;
}

export interface EssayGradeRequest {
  questionId: number;
  score: number;
  comment: string;
}

export interface EssayApproveRequest {
  grades: EssayGradeRequest[];
}

export interface EssayApproveResponse {
  status: 'graded';
  score: number;
  currentScore: number;
  best: number;
  earnedPoints: number;
  maximumPoints: number;
  passed: boolean;
}

export interface TopStudent {
  id: number;
  name: string;
  image: string;
  rank: number;
  grade: string;
  createdAt: number;
  gradeName?: string;
}

export interface TopStudentsResponse {
  students: TopStudent[];
}

export interface PasswordResetRequest {
  id: number;
  userId: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  createdAt: number;
  updatedAt: number;
  resetCode?: string | null;
  codeExpiresAt?: number | null;
  fullName?: string;
  phone?: string;
}

export interface PasswordResetsResponse {
  requests: PasswordResetRequest[];
}

export interface PasswordResetDiagnostics {
  total: number;
  byStatus: Record<string, number>;
  lastRequestAt: number | null;
  today: string;
  todayUnmatched: number;
}

export interface PasswordResetApproveResponse {
  ok: boolean;
  fullName: string;
  phone: string;
  code: string;
  codeExpiresAt: number;
}

export interface ContentVersionResponse {
  version: number;
  at: number;
}

// ===== Push Notification Types =====

export interface PushPublicKeyResponse {
  key: string;
  configured: boolean;
}

export interface PushStatusResponse {
  vapidConfigured: boolean;
  subscriptions: number;
}

export interface PushSubscribeRequest {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushTestRequest {
  // empty
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  type?: 'lesson' | 'exam' | 'note' | 'test' | 'reset' | 'student';
  id?: number;
  icon?: string;
  badge?: string;
  tag?: string;
  sound?: string;
  vibrate?: number[];
  silent?: boolean;
  requireInteraction?: boolean;
}

// ===== Upload Types =====

export interface UploadUrlRequest {
  bucket: 'images' | 'videos' | 'notes';
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  path: string;
  publicUrl: string;
  contentType: string;
}

// ===== Bootstrap Types =====

export interface BootstrapData {
  courses: Course[];
  lessons: Lesson[];
  exams: (Exam & { questionsCount: number })[];
  notes: Note[];
  topStudents: TopStudent[];
  levels: Tier[];
  grades: Record<string, { name: string; nameEn: string }>;
}

export interface PublicCourse {
  id: number;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  image: string;
  grade: string;
  gradeName: string;
  order: number;
  lessonCount: number;
  duration: number;
}

export interface PublicCourseDetail {
  course: PublicCourse;
  lessons: { id: number; title: string; titleEn: string; duration: number; grade: string; order: number }[];
  examsCount: number;
}

export interface PublicCoursesResponse {
  courses: PublicCourse[];
}

export interface PublicCourseDetailResponse {
  course: PublicCourse;
  lessons: { id: number; title: string; titleEn: string; duration: number; grade: string; order: number }[];
  examsCount: number;
}

// ===== Exam Take Types =====

export interface ExamTakeSubmitRequest {
  answers: Record<string, number>;
  essayAnswers: Record<string, string>;
}

export interface ExamTakeSubmitResponse {
  status: 'graded' | 'pending_review';
  score?: number;
  best?: number;
  correct?: number;
  total?: number;
  passed?: boolean;
  earnedPoints?: number;
  maximumPoints?: number;
  attempts?: number;
  review?: ExamReviewItem[];
  submissionId?: number;
  submittedAt?: number;
}

export interface ExamReviewItem {
  id: number;
  text: string;
  textEn: string;
  options: { text: string; textEn: string }[];
  given?: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  explanationEn: string;
}

// ===== Progress Types =====

export interface ProgressItem {
  user_id: number;
  lesson_id: number;
  seconds_watched: number;
  completed: boolean;
  updated_at: number;
  lessonTitle?: string;
  lessonTitleEn?: string;
  lessonDuration?: number;
}

export interface ProgressSyncItem {
  lessonId: number;
  secondsWatched: number;
}

export interface ProgressSyncResponse {
  saved: number;
  progress: ProgressSyncItem[];
}

// ===== Code Lab Types =====

export interface CodeFile {
  id: number;
  name: string;
  language: string;
  code?: string;
  updatedAt: number;
  createdAt: number;
}

export interface CodeFileWithCode extends CodeFile {
  code: string;
}

export interface CodeFilesResponse {
  files: CodeFile[];
}

export interface CodeFileResponse {
  file: CodeFileWithCode;
}

export interface CodeFileCreateRequest {
  name: string;
  language: 'javascript' | 'python' | 'html' | 'css';
  code: string;
}

export interface CodeFileUpdateRequest {
  code: string;
}

export interface CodeFilePatchRequest {
  name?: string;
  language?: 'javascript' | 'python' | 'html' | 'css';
}

// ===== Reconnect Types =====

export interface ReconnectBannerProps {
  onRetry: () => void;
  onLogin: () => void;
}

// ===== Utility Types =====

export type GradeKey = 'bac1' | 'bac2' | 'cs' | 'all';
export type StudentFilter = 'all' | 'subscribed' | 'unsubscribed' | 'blocked';
export type GradeFilter = GradeKey;
export type ReviewStatus = 'pending_review' | 'graded';

export const GRADES_CONFIG = {
  bac1: { name: 'أولى باكلوريه', nameEn: 'Bac 1' },
  bac2: { name: 'تانية باكلوريه', nameEn: 'Bac 2' },
  cs: { name: 'حاسبات ومعلومات', nameEn: 'CS' },
  all: { name: 'كل المراحل', nameEn: 'All Grades' },
} as const;

export type UserRole = 'student' | 'admin';
export type VideoType = 'youtube' | 'upload';