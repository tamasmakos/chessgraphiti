import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@yourcompany/web/components/base/card";
import { Button } from "@yourcompany/web/components/base/button";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 md:py-12">
      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>ChessGraphiti</CardTitle>
          <CardDescription>Play against Stockfish with live graph centrality overlays.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/train">
            <Button>Play vs Computer (/train)</Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>What you can do</CardTitle>
          <CardDescription>Play chess, visualize graph communities, and export games.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link to="/train">
            <Button variant="secondary">Play Now</Button>
          </Link>
          <Link to="/auth">
            <Button variant="secondary">Account</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
