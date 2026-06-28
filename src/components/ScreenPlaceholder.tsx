import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function ScreenPlaceholder({
  title,
  blurb,
  comingIn,
}: {
  title: string;
  blurb: string;
  comingIn: string;
}) {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{blurb}</p>
          <p className="text-xs">
            Built in <span className="font-mono text-foreground">{comingIn}</span>.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
