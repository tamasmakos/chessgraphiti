import type * as React from "react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  // Auth temporarily disabled: always render children without redirects
  return <>{children}</>;
}
