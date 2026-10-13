import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { useLang } from '../i18n';
import Seo from '../components/Seo';
import Sparkles from '../components/Sparkles';
import HeroSection from '../components/hero/HeroSection';
import FeatureCard from '../components/hero/FeatureCard';
import { siteGraph } from '../lib/seo/schema';
import { SITE_NAME_AR } from '../lib/seo/site';
import { BookOpen, Brain, FileText } from 'lucide-react';

const FEATURES = [
  {
    icon: BookOpen,
    titleKey: 'public.featureCourses',
    descKey: 'public.featureCoursesDesc',
    highlights: [
      'public.featureCoursesHighlight1',
      'public.featureCoursesHighlight2',
      'public.featureCoursesHighlight3',
    ],
  },
  {
    icon: Brain,
    titleKey: 'public.featureExams',
    descKey: 'public.featureExamsDesc',
    highlights: [
      'public.featureExamsHighlight1',
      'public.featureExamsHighlight2',
      'public.featureExamsHighlight3',
    ],
  },
  {
    icon: FileText,
    titleKey: 'public.featureNotes',
    descKey: 'public.featureNotesDesc',
    highlights: [
      'public.featureNotesHighlight1',
      'public.featureNotesHighlight2',
      'public.featureNotesHighlight3',
    ],
  },
] as const;

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
} as const;

export default function PublicLanding() {
  const { t } = useLang();

  const heroStats = [
    { value: t('public.statYearsValue'), label: t('public.statYearsLabel'), color: '#f43f4e' },
    { value: t('public.statStudentsValue'), label: t('public.statStudentsLabel'), color: '#f97316' },
    { value: t('public.statSuccessValue'), label: t('public.statSuccessLabel'), color: '#fb7185' },
  ];

  return (
    <div className="space-y-20">
      <Seo path="/" jsonLd={siteGraph()} />

      {/* Hero: Advanced Motion Framework */}
      <HeroSection
        baseImage="/login-hero.png"
        highlightImage="/hero-highlight.jpg"
        alt="منصة دكتور كود — منصة تعلم البرمجة لطلاب المرحلة الثانوية"
        eyebrow={t('public.heroEyebrow')}
        titleLines={[
          t('public.heroTitleLine1'),
          t('public.heroTitleLine2'),
          t('public.heroTitleLine3'),
        ]}
        description={t('public.heroDescription')}
        ctaText={t('public.heroCta')}
        ctaHref="/register"
        stats={heroStats}
      />

      {/* لماذا دكتور كود */}
      <motion.section {...fadeUp} transition={{ duration: 0.5, ease: 'easeOut' }} className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-black sm:text-3xl">{t('public.featuresTitle')}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-400 sm:text-base">{t('public.featuresSub')}</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <FeatureCard
              key={f.titleKey}
              icon={f.icon}
              title={t(f.titleKey)}
              description={t(f.descKey)}
              highlights={f.highlights.map((h) => t(h))}
              index={i}
            />
          ))}
        </div>
      </motion.section>

      {/* المؤسس */}
      <motion.section {...fadeUp} transition={{ duration: 0.5, ease: 'easeOut' }} className="card-fire grid items-center gap-8 rounded-3xl p-8 lg:grid-cols-[auto_1fr]">
        <div className="relative mx-auto">
          <div aria-hidden className="absolute -inset-2 rounded-full bg-gradient-to-br from-fire-500/40 to-ember-500/40 blur-xl" />
          <img
            src="/owner.png"
            alt={`${t('public.founderName')} — ${SITE_NAME_AR}`}
            width={200}
            height={200}
            loading="lazy"
            decoding="async"
            className="relative h-40 w-40 rounded-full object-cover shadow-xl shadow-fire-900/40"
          />
        </div>
        <div className="text-center lg:text-right">
          <h2 className="text-2xl font-black">{t('public.founderName')}</h2>
          <p className="mt-1 font-bold text-ember-300">{t('public.founderTitle')}</p>
          <p className="mt-3 leading-relaxed text-gray-400">{t('public.founderBio')}</p>
        </div>
      </motion.section>

      {/* دعوة أخيرة */}
      <motion.section
        {...fadeUp}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-3xl border border-fire-800/40 bg-gradient-to-br from-fire-950/60 via-ink-900 to-ink-950 p-10 text-center"
      >
        <Sparkles behind />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fire-500/25 blur-3xl" />
        <h2 className="relative z-10 text-2xl font-black sm:text-3xl">{t('public.ctaTitle')}</h2>
        <p className="relative z-10 mx-auto mt-2 max-w-xl text-gray-400">{t('public.ctaSub')}</p>
        <div className="relative z-10 mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/register" className="btn-fire rounded-xl px-7 py-3 text-base font-bold text-white shadow-xl shadow-fire-900/40 transition-transform hover:-translate-y-0.5">
            {t('public.register')}
          </Link>
          <Link to="/login" className="btn-ghost-fire rounded-xl px-7 py-3 text-base font-bold">
            {t('public.heroLogin')}
          </Link>
        </div>
      </motion.section>
    </div>
  );
}