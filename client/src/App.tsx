import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { SiteFooter } from "@/components/SiteFooter";
import { RequireAuth } from "@/RequireAuth";
import { PageLoader } from "@/components/PageLoader";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const CasesPage = lazy(() =>
  import("@/pages/CasesPage").then((m) => ({ default: m.CasesPage })),
);
const CaseNewPage = lazy(() =>
  import("@/pages/CaseNewPage").then((m) => ({ default: m.CaseNewPage })),
);
const CaseEditPage = lazy(() =>
  import("@/pages/CaseEditPage").then((m) => ({ default: m.CaseEditPage })),
);
const SessionsPage = lazy(() =>
  import("@/pages/SessionsPage").then((m) => ({ default: m.SessionsPage })),
);
const SessionNewPage = lazy(() =>
  import("@/pages/SessionNewPage").then((m) => ({ default: m.SessionNewPage })),
);
const SessionDetailPage = lazy(() =>
  import("@/pages/SessionDetailPage").then((m) => ({
    default: m.SessionDetailPage,
  })),
);
const AdminPage = lazy(() =>
  import("@/pages/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const AdminUsersPage = lazy(() =>
  import("@/pages/AdminUsersPage").then((m) => ({
    default: m.AdminUsersPage,
  })),
);
const AdminReferencesPage = lazy(() =>
  import("@/pages/AdminReferencesPage").then((m) => ({
    default: m.AdminReferencesPage,
  })),
);
const DepartmentAnalyticsPage = lazy(() =>
  import("@/pages/DepartmentAnalyticsPage").then((m) => ({
    default: m.DepartmentAnalyticsPage,
  })),
);

function SessionDetailFooterHidden(pathname: string) {
  const m = pathname.match(/^\/sessions\/([^/]+)$/);
  return Boolean(m && m[1] !== "new");
}

function LazyFallback() {
  return <PageLoader />;
}

function AppRoutes() {
  const { pathname } = useLocation();
  const hideFooter = SessionDetailFooterHidden(pathname);

  return (
    <>
      <div className="flex min-h-[100dvh] flex-1 flex-col">
        <Suspense fallback={<LazyFallback />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* Authenticated routes (standard layout) */}
            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/cases/new" element={<CaseNewPage />} />
              <Route path="/cases/:caseId/edit" element={<CaseEditPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/sessions/new" element={<SessionNewPage />} />
              <Route path="/analytics" element={<DepartmentAnalyticsPage />} />
            </Route>

            {/* Immersive session (no nav) */}
            <Route element={<RequireAuth immersive />}>
              <Route
                path="/sessions/:sessionId"
                element={<SessionDetailPage />}
              />
            </Route>

            {/* Admin-only routes */}
            <Route element={<RequireAuth role="ADMIN" />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route
                path="/admin/references"
                element={<AdminReferencesPage />}
              />
            </Route>

            {/* 404 fallback */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
      {hideFooter ? null : <SiteFooter />}
    </>
  );
}

export default function App() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-mesh">
      <AppRoutes />
    </div>
  );
}
