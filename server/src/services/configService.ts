import { getSupabase } from '../db/supabase';
import * as courseService from './courseService';
import * as lessonService from './lessonService';
import * as examService from './examService';
import * as questionService from './questionService';
import * as noteService from './noteService';
import { DEFAULT_LEVELS, type LevelTier } from '../utils/levels';
import { logger } from '../utils/logger';

const LEVELS_KEY = 'levels';

export async function getLevels(): Promise<{ tiers: LevelTier[] }> {
  const { data } = await getSupabase().from('app_config').select('value').eq('key', LEVELS_KEY).maybeSingle();
  const tiers = (data?.value as any)?.tiers;
  return { tiers: Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_LEVELS };
}

export async function setLevels(tiers: LevelTier[]): Promise<{ tiers: LevelTier[] }> {
  const clean = tiers
    .map((t) => ({
      min: Number(t.min) || 0,
      key: String(t.key || 'level'),
      name: String(t.name || ''),
      nameEn: String(t.nameEn || ''),
    }))
    .sort((a, b) => a.min - b.min);
  await getSupabase().from('app_config').upsert({ key: LEVELS_KEY, value: { tiers: clean } }, { onConflict: 'key' });
  return { tiers: clean };
}

/**
 * بيانات تجريبية تُنشأ أول مرة فقط (SEED_ON_START=true) حتى يظهر الموقع حياً.
 * يمكن للأدمن تعديلها أو حذفها من اللوحة.
 */
export async function seedIfNeeded(): Promise<void> {
  const courses = await courseService.list();
  if (courses.length > 0) return;

  logger.info('[seed] إنشاء بيانات تجريبية أولى...');

  const course = await courseService.create({
    title: 'أساسيات JavaScript',
    titleEn: 'JavaScript Basics',
    description: 'ابدأ رحلتك مع لغة JavaScript: المتغيرات، الدوال، الحلقات والشروط.',
    descriptionEn: 'Start your JavaScript journey: variables, functions, loops and conditions.',
    image: '',
    grade: 'all',
    order: 1,
    createdAt: Date.now(),
  });

  const l1 = await lessonService.create({
    courseId: course.id,
    title: 'مقدمة إلى JavaScript',
    titleEn: 'Introduction to JavaScript',
    videoType: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=W6NZfCO5SIk',
    duration: 480,
    description: 'تعرف على لغة JavaScript وماذا يمكنك أن تفعل بها.',
    descriptionEn: 'Learn what JavaScript is and what you can do with it.',
    grade: 'all',
    order: 1,
    createdAt: Date.now(),
  });

  const l2 = await lessonService.create({
    courseId: course.id,
    title: 'المتغيرات وأنواع البيانات',
    titleEn: 'Variables and Data Types',
    videoType: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=edlFjlzxkSI',
    duration: 600,
    description: 'let و const والأنواع المختلفة من البيانات.',
    descriptionEn: 'let, const and the different data types.',
    grade: 'all',
    order: 2,
    createdAt: Date.now(),
  });

  const l3 = await lessonService.create({
    courseId: course.id,
    title: 'الشروط والحلقات',
    titleEn: 'Conditions and Loops',
    videoType: 'youtube',
    videoUrl: 'https://www.youtube.com/watch?v=IsG4Xd6LlsM',
    duration: 540,
    description: 'if و for و while للتحكم في تدفق البرنامج.',
    descriptionEn: 'if, for and while to control program flow.',
    grade: 'all',
    order: 3,
    createdAt: Date.now(),
  });

  const exam = await examService.create({
    courseId: course.id,
    title: 'امتحان JavaScript التمهيدي',
    titleEn: 'JavaScript Basics Exam',
    timeLimit: 15,
    passingScore: 50,
    grade: 'all',
    allowRetake: false,
    order: 1,
    createdAt: Date.now(),
  });

  await questionService.create({
    examId: exam.id,
    text: 'ما الكلمة الأساسية لإنشاء متغير لا يمكن تغيير قيمته؟',
    textEn: 'Which keyword declares a constant variable?',
    options: [
      { text: 'var', textEn: 'var' },
      { text: 'let', textEn: 'let' },
      { text: 'const', textEn: 'const' },
      { text: 'static', textEn: 'static' },
    ],
    correctIndex: 2,
    image: '',
    order: 1,
  });

  await questionService.create({
    examId: exam.id,
    text: 'ما ناتج `typeof 42` ؟',
    textEn: 'What is the output of `typeof 42`?',
    options: [
      { text: '"number"', textEn: '"number"' },
      { text: '"string"', textEn: '"string"' },
      { text: '"int"', textEn: '"int"' },
      { text: '42', textEn: '42' },
    ],
    correctIndex: 0,
    image: '',
    order: 2,
  });

  await questionService.create({
    examId: exam.id,
    text: 'أي حلقة تُنفَّذ مرة واحدة على الأقل؟',
    textEn: 'Which loop runs at least once?',
    options: [
      { text: 'for', textEn: 'for' },
      { text: 'while', textEn: 'while' },
      { text: 'do...while', textEn: 'do...while' },
      { text: 'forEach', textEn: 'forEach' },
    ],
    correctIndex: 2,
    image: '',
    order: 3,
  });

  await noteService.create({
    courseId: course.id,
    title: 'مذكرة أوامر JavaScript الأساسية',
    titleEn: 'JavaScript Basics Cheatsheet',
    body: '# المتغيرات\n\n```js\nlet name = "علي";\nconst age = 17;\n```\n\n# الدوال\n\n```js\nfunction greet(name) {\n  return "أهلاً " + name;\n}\n```\n\n# الشروط\n\n```js\nif (score >= 50) {\n  console.log("ناجح");\n} else {\n  console.log("راسب");\n}\n```',
    bodyEn: '# Variables\n\n```js\nlet name = "Ali";\nconst age = 17;\n```\n\n# Functions\n\n```js\nfunction greet(name) {\n  return "Hello " + name;\n}\n```\n\n# Conditionals\n\n```js\nif (score >= 50) {\n  console.log("Pass");\n} else {\n  console.log("Fail");\n}\n```',
    image: '',
    grade: 'all',
    order: 1,
    createdAt: Date.now(),
  });

  logger.info('[seed] تم إنشاء كورس + 3 دروس + امتحان 3 أسئلة + مذكرة');
}
