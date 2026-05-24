import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import OnboardingPage from "@/pages/OnboardingPage";
import DashboardPage from "@/pages/DashboardPage";
import SubjectsPage from "@/pages/SubjectsPage";
import SubjectDetailPage from "@/pages/SubjectDetailPage";
import ChapterDetailPage from "@/pages/ChapterDetailPage";
import TopicDetailPage from "@/pages/TopicDetailPage";
import ExamPage from "@/pages/ExamPage";
import ExamResultPage from "@/pages/ExamResultPage";
import NotesPage from "@/pages/NotesPage";
import PomodoroPage from "@/pages/PomodoroPage";
import TasksPage from "@/pages/TasksPage";
import TrackerPage from "@/pages/TrackerPage";
import ProfilePage from "@/pages/ProfilePage";
import AdminPage from "@/pages/admin/AdminPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminSubjectsPage from "@/pages/admin/AdminSubjectsPage";
import AdminAnalyticsPage from "@/pages/admin/AdminAnalyticsPage";
import AdminQuizzesPage from "@/pages/admin/AdminQuizzesPage";
import AdminGatePage from "@/pages/admin/AdminGatePage";
import AdminRateLimitsPage from "@/pages/admin/AdminRateLimitsPage";
import NotFound from "@/pages/not-found";
import { SentryErrorBoundary } from "@/components/SentryErrorBoundary";

const queryClient = new QueryClient();

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
    <Switch>
      <Route path="/" component={RootRoute} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <SentryErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </SentryErrorBoundary>
  );
}

export default App;
