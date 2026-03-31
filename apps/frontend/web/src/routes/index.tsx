import { Link, createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@yourcompany/web/components/base/card";
import { Button } from "@yourcompany/web/components/base/button";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 md:py-12">
      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-2xl">Chess you can see.</CardTitle>
          <CardDescription className="text-base">
            Stop memorizing moves. Start understanding why positions are strong. Every piece is a node,
            every attack and defence a live edge — see the structure of the game as it happens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/train">
            <Button size="lg">Play Now — It's Free</Button>
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Live graph overlay</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Attack and defence relationships render as directed edges on the board in real time.
              See control flow the moment you move a piece.
            </CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Piece communities</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Graph community detection clusters your pieces into coalitions. Watch alliances
              form, break, and reform as the game evolves.
            </CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Position influence</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Centrality metrics reveal which pieces dominate the position — not by material
              value, but by structural influence.
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6 flex flex-wrap gap-2">
          <Link to="/train">
            <Button>Open the Board</Button>
          </Link>
          <Link to="/auth">
            <Button variant="secondary">Sign Up — Save Progress</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
