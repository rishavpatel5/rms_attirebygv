import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Store preferences, tax profile, and integrations.</p>
      </div>
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Coming next</CardTitle>
          <CardDescription>
            GST registration, intra-state defaults, Cloudinary keys, and staff roles will live here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use environment-backed configuration for the API today; this screen will expose safe toggles in a later
          iteration.
        </CardContent>
      </Card>
    </div>
  );
}
