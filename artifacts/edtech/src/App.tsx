import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SentryErrorBoundary } from "@/components/SentryErrorBoundary";
import { Loader2 } from "lucide-react";

import OnboardingPage from "@/pages/OnboardingPage";
import NotFound from "@/pages/not-found";

const LoginPage              = lazy(() => import("@/pages/LoginPage"));
const RegisterPage           = lazy(() => import("@/pages/RegisterPage"));
const ForgotPasswordPage     = lazy(() => import("@/pages/ForgotPasswordPage"));
const ResetPasswordPage      = lazy(() => import("@/pages/ResetPasswordPage"));
const PendingApprovalPage    = lazy(() => import("@/pages/PendingApprovalPage"));
const DashboardPage          = lazy(() => import("@/pages/DashboardPage"));
const SubjectsPage           = lazy(() => import("@/pages/SubjectsPage"));
const SubjectDetailPage      = lazy(() => import("@/pages/SubjectDetailPage"));
const ChapterDetailPage      = lazy(() => import("@/pages/ChapterDetailPage"));
const TopicDetailPage        = lazy(() => import("@/pages/TopicDetailPage"));
const ExamPage               = lazy(() => import("@/pages/ExamPage"));
const ExamResultPage         = lazy(() => import("@/pages/ExamResultPage"));
const NotesPage              = lazy(() => import("@/pages/NotesPage"));
const PomodoroPage           = lazy(() => import("@/pages/PomodoroPage"));
const TasksPage              = lazy(() => import("@/pages/TasksPage"));
const TrackerPage            = lazy(() => import("@/pages/TrackerPage"));
const ProfilePage            = lazy(() => import("@/pages/ProfilePage"));
const TestsPage              = lazy(() => import("@/pages/TestsPage"));
const AdminPage              = lazy(() => import("@/pages/admin/AdminPage"));
const AdminUsersPage         = lazy(() => import("@/pages/admin/AdminUsersPage"));
const AdminSubjectsPage      = lazy(() => import("@/pages/admin/AdminSubjectsPage"));
const AdminAnalyticsPage     = lazy(() => import("@/pages/admin/AdminAnalyticsPage"));
const AdminQuizzesPage       = lazy(() => import("@/pages/admin/AdminQuizzesPage"));
const AdminGatePage          = lazy(() => import("@/pages/admin/AdminGatePage"));
const AdminRateLimitsPage    = lazy(() => import("@/pages/admin/AdminRateLimitsPage"));
const AdminContentAccessPage = lazy(() => import("@/pages/admin/AdminContentAccessPage"));
const AdminAnnouncementsPage = lazy(() => import("@/pages/admin/AdminAnnouncementsPage"));
const AdminTestManagementPage = lazy(() => import("@/pages/admin/AdminTestManagementPage"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function RootRoute() {
  const { session, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && session) {
      setLocation("/dashboard");
    }
  }, [loading, session, setLocation]);

  if (loading || session) return null;

  return <OnboardingPage />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={RootRoute} />
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/pending-approval" component={PendingApprovalPage} />

        <Route path="/dashboard"><ProtectedRoute><DashboardPage /></ProtectedRoute></Route>
        <Route path="/subjects"><ProtectedRoute><SubjectsPage /></ProtectedRoute></Route>
        <Route path="/subjects/:subjectId"><ProtectedRoute><SubjectDetailPage /></ProtectedRoute></Route>
        <Route path="/chapters/:chapterId"><ProtectedRoute><ChapterDetailPage /></ProtectedRoute></Route>
        <Route path="/topics/:topicId"><ProtectedRoute><TopicDetailPage /></ProtectedRoute></Route>
        <Route path="/exam/:quizId"><ProtectedRoute><ExamPage /></ProtectedRoute></Route>
        <Route path="/exam/results/:resultId"><ProtectedRoute><ExamResultPage /></ProtectedRoute></Route>
        <Route path="/notes"><ProtectedRoute><NotesPage /></ProtectedRoute></Route>
        <Route path="/pomodoro"><ProtectedRoute><PomodoroPage /></ProtectedRoute></Route>
        <Route path="/tasks"><ProtectedRoute><TasksPage /></ProtectedRoute></Route>
        <Route path="/tracker"><ProtectedRoute><TrackerPage /></ProtectedRoute></Route>
        <Route path="/profile"><ProtectedRoute><ProfilePage /></ProtectedRoute></Route>

        <Route path="/admin"><ProtectedRoute requireAdmin><AdminPage /></ProtectedRoute></Route>
        <Route path="/admin/users"><ProtectedRoute requireAdmin><AdminUsersPage /></ProtectedRoute></Route>
        <Route path="/admin/subjects"><ProtectedRoute requireAdmin><AdminSubjectsPage /></ProtectedRoute></Route>
        <Route path="/admin/quizzes"><ProtectedRoute requireAdmin><AdminQuizzesPage /></ProtectedRoute></Route>
        <Route path="/admin/analytics"><ProtectedRoute requireAdmin><AdminAnalyticsPage /></ProtectedRoute></Route>
        <Route path="/admin/gate"><ProtectedRoute requireAdmin><AdminGatePage /></ProtectedRoute></Route>
        <Route path="/admin/rate-limits"><ProtectedRoute requireAdmin><AdminRateLimitsPage /></ProtectedRoute></Route>
        <Route path="/admin/content-access"><ProtectedRoute requireAdmin><AdminContentAccessPage /></ProtectedRoute></Route>
        <Route path="/admin/announcements"><ProtectedRoute requireAdmin><AdminAnnouncementsPage /></ProtectedRoute></Route>
        <Route path="/admin/test-management"><ProtectedRoute requireAdmin><AdminTestManagementPage /></ProtectedRoute></Route>
        <Route path="/tests"><ProtectedRoute><TestsPage /></ProtectedRoute></Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <SentryErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SentryErrorBoundary>
  );
}

export default App;
