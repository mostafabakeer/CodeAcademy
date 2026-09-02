import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import SubscriberGate from './components/SubscriberGate';
import { useLang } from './i18n';
import { useAuth } from './contexts/AuthContext';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Home = lazy(() => import('./pages/Home'));
const TopStudents = lazy(() => import('./pages/TopStudents'));
const TopStudentCertificate = lazy(() => import('./pages/TopStudentCertificate'));
const Courses = lazy(() => import('./pages/Courses'));
const CourseDetail = lazy(() => import('./pages/CourseDetail'));
const LessonPlayer = lazy(() => import('./pages/LessonPlayer'));
const Exams = lazy(() => import('./pages/Exams'));
const ExamTake = lazy(() => import('./pages/ExamTake'));
const Notes = lazy(() => import('./pages/Notes'));
const CodeLab = lazy(() => import('./pages/CodeLab'));
const Profile = lazy(() => import('./pages/Profile'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminCourses = lazy(() => import('./pages/admin/CoursesAdmin'));
const AdminLessons = lazy(() => import('./pages/admin/LessonsAdmin'));
const AdminExams = lazy(() => import('./pages/admin/ExamsAdmin'));
const AdminNotes = lazy(() => import('./pages/admin/NotesAdmin'));
const AdminStudents = lazy(() => import('./pages/admin/StudentsAdmin'));
const AdminTopStudents = lazy(() => import('./pages/admin/TopStudentsAdmin'));
const AdminLeaderboard = lazy(() => import('./pages/admin/LeaderboardAdmin'));
const AdminSettings = lazy(() => import('./pages/admin/SettingsAdmin'));

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-fire-500/25 border-t-fire-500" />
        <div className="absolute inset-0 m-auto h-7 w-7 animate-flame rounded-full bg-gradient-to-br from-fire-500 to-ember-500" />
      </div>
      <p className="text-sm text-gray-400">DR Code</p>
    </div>
  );
}

function Shell() {
  const { user } = useAuth();
  const { t } = useLang();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <AnimatedRoutes />
      </main>
      <footer className="border-t border-fire-900/20 py-6 text-center text-sm text-gray-500 print:hidden">
        ⚡ DR Code — {t('footer.rights')} © {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        <Routes location={location}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/top-students" element={<TopStudents />} />
          <Route path="/top-students/:id" element={<TopStudentCertificate />} />
          <Route path="/" element={<ProtectedRoute><SubscriberGate><Home /></SubscriberGate></ProtectedRoute>} />
          <Route path="/courses" element={<ProtectedRoute><SubscriberGate><Courses /></SubscriberGate></ProtectedRoute>} />
          <Route path="/courses/:id" element={<ProtectedRoute><SubscriberGate><CourseDetail /></SubscriberGate></ProtectedRoute>} />
          <Route path="/lessons/:id" element={<ProtectedRoute><SubscriberGate><LessonPlayer /></SubscriberGate></ProtectedRoute>} />
          <Route path="/exams" element={<ProtectedRoute><SubscriberGate><Exams /></SubscriberGate></ProtectedRoute>} />
          <Route path="/exams/:id" element={<ProtectedRoute><SubscriberGate><ExamTake /></SubscriberGate></ProtectedRoute>} />
          <Route path="/notes" element={<ProtectedRoute><SubscriberGate><Notes /></SubscriberGate></ProtectedRoute>} />
          <Route path="/codelab" element={<ProtectedRoute><SubscriberGate><CodeLab /></SubscriberGate></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><SubscriberGate><Profile /></SubscriberGate></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute admin><AdminLayout /></ProtectedRoute>}>
            <Route index element={<AdminDashboard />} />
            <Route path="courses" element={<AdminCourses />} />
            <Route path="lessons" element={<AdminLessons />} />
            <Route path="exams" element={<AdminExams />} />
            <Route path="notes" element={<AdminNotes />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="top-students" element={<AdminTopStudents />} />
            <Route path="leaderboard" element={<AdminLeaderboard />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Shell />
    </Suspense>
  );
}
