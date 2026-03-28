import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { SessionProvider } from "#providers/session-provider";
import { AuthProvider } from "#providers/auth-provider";
import { ORPCProvider } from "#providers/orpc-provider";
import { ThemeProvider } from "next-themes";
import { getConfig } from "#lib/config";
import { AuthGuard } from "#components/auth/auth-guard";

const config = getConfig();

function RootComponent() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SessionProvider>
        <ORPCProvider apiUrl={config.apiUrl}>
          <AuthProvider>
            <AuthGuard>
              <div className="min-h-dvh flex flex-col">
                <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
                    <Link to="/" className="font-semibold tracking-tight text-foreground hover:opacity-90">
                      ChessGraphiti
                    </Link>
                    <nav className="flex items-center gap-3 text-sm">
                      <Link
                        to="/train"
                        className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Chess trainer
                      </Link>
                      <Link to="/auth" className="text-muted-foreground hover:text-foreground">
                        Auth
                      </Link>
                    </nav>
                  </div>
                </header>
                <main className="flex-1">
                  <Outlet />
                </main>
              </div>
            </AuthGuard>
          </AuthProvider>
        </ORPCProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
