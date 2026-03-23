import { Navigate, Outlet, useLocation } from "react-router-dom";
import { NavBar } from "@/components/nav";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/auth-context";
import type { ReactNode } from "react";
import type { Role } from "~types/db";

export function RequireAuth({
  children,
  immersive = false,
  role,
}: {
  children?: ReactNode;
  immersive?: boolean;
  role?: Role;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <PageLoader />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  const content = children ?? <Outlet />;

  if (immersive) {
    return (
      <div className="flex flex-1 flex-col">
        {content}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <NavBar role={user.role} login={user.login} />
      <div className="safe-area-x mx-auto w-full max-w-6xl flex-1 py-6 sm:py-8 motion-safe:animate-fade-in">
        {content}
      </div>
    </div>
  );
}
