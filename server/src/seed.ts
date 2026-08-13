import type { AppStore } from './db/store';

/**
 * بيانات تجريبية تُنشأ أول مرة فقط حتى يظهر الموقع حياً
 * ويمكن للأدمن تعديلها أو حذفها من اللوحة
 */
export async function seed(store: AppStore): Promise<void> {
  const hasCourse = (await store.keys('course:')).length > 0;
  if (hasCourse) return;

  console.log('[seed] إنشاء بيانات تجريبية أولى...');

  const courseId = await store.nextId();
  await store.set(`course:${courseId}`, {
    id: courseId,
    title: 'أساسيات JavaScript',
    titleEn: 'JavaScript Basics',
    description: 'ابدأ رحلتك مع لغة JavaScript: المتغيرات، الدوال، الحلقات والشروط.',
    descriptionEn: 'Start your JavaScript journey: variables, functions, loops and conditions.',
    image: '',
    grade: 'all',
    order: 1,
    createdAt: Date.now(),
  });

  const l1 = await store.nextId();
  await store.set(`lesson:${l1}`, {
    id: l1,
    courseId,
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

  const l2 = await store.nextId();
  await store.set(`lesson:${l2}`, {
    id: l2,
    courseId,
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

  const l3 = await store.nextId();
  await store.set(`lesson:${l3}`, {
    id: l3,
    courseId,
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

  const examId = await store.nextId();
  await store.set(`exam:${examId}`, {
    id: examId,
    courseId,
    title: 'امتحان JavaScript التمهيدي',
    titleEn: 'JavaScript Basics Exam',
    timeLimit: 15,
    passingScore: 50,
    grade: 'all',
    allowRetake: false,
    order: 1,
    createdAt: Date.now(),
  });

  const q1 = await store.nextId();
  await store.set(`question:${q1}`, {
    id: q1,
    examId,
    text: 'ما الكلمة الأساسية لإنشاء متغير لا يمكن تغيير قيمته؟',
    textEn: 'Which keyword declares a constant variable?',
    options: [
      { text: 'var', textEn: 'var' },
      { text: 'let', textEn: 'let' },
      { text: 'const', textEn: 'const' },
      { text: 'static', textEn: 'static' },
    ],
    correctIndex: 2,
    order: 1,
  });

  const q2 = await store.nextId();
  await store.set(`question:${q2}`, {
    id: q2,
    examId,
    text: 'ما ناتج `typeof 42` ؟',
    textEn: 'What is the output of `typeof 42`?',
    options: [
      { text: '"number"', textEn: '"number"' },
      { text: '"string"', textEn: '"string"' },
      { text: '"int"', textEn: '"int"' },
      { text: '42', textEn: '42' },
    ],
    correctIndex: 0,
    order: 2,
  });

  const q3 = await store.nextId();
  await store.set(`question:${q3}`, {
    id: q3,
    examId,
    text: 'أي حلقة تُنفَّذ مرة واحدة على الأقل؟',
    textEn: 'Which loop runs at least once?',
    options: [
      { text: 'for', textEn: 'for' },
      { text: 'while', textEn: 'while' },
      { text: 'do...while', textEn: 'do...while' },
      { text: 'forEach', textEn: 'forEach' },
    ],
    correctIndex: 2,
    order: 3,
  });

  const noteId = await store.nextId();
  await store.set(`note:${noteId}`, {
    id: noteId,
    courseId,
    title: 'مذكرة أوامر JavaScript الأساسية',
    titleEn: 'JavaScript Basics Cheatsheet',
    body: '# المتغيرات\n\n```js\nlet name = "علي";\nconst age = 17;\n```\n\n# الدوال\n\n```js\nfunction greet(name) {\n  return "أهلاً " + name;\n}\n```\n\n# الشروط\n\n```js\nif (score >= 50) {\n  console.log("ناجح");\n} else {\n  console.log("راسب");\n}\n```',
    bodyEn: '# Variables\n\n```js\nlet name = "Ali";\nconst age = 17;\n```\n\n# Functions\n\n```js\nfunction greet(name) {\n  return "Hello " + name;\n}\n```\n\n# Conditionals\n\n```js\nif (score >= 50) {\n  console.log("Pass");\n} else {\n  console.log("Fail");\n}\n```',
    image: '',
    grade: 'all',
    order: 1,
    createdAt: Date.now(),
  });

  console.log('[seed] تم إنشاء كورس + 3 دروس + امتحان 3 أسئلة + مذكرة');
}
