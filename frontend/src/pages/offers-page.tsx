import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGetJsonAuthedWithMeta, getStoredAccessToken } from "@/lib/api-client";

type Offer = {
  id: string;
  name: string;
  code: string | null;
  discountType: string;
  discountValue: unknown;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export function OffersPage() {
  const authed = Boolean(getStoredAccessToken());
  const [rows, setRows] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const { data } = await apiGetJsonAuthedWithMeta<Offer[]>("/api/v1/offers?limit=100");
        if (!cancelled) setRows(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  if (!authed) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link to="/login?redirect=/dashboard/offers" className="underline">
          Sign in
        </Link>{" "}
        to view offers.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Offers &amp; marketing</h2>
        <p className="text-sm text-muted-foreground">Active promotions (read-only list).</p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Offers</CardTitle>
          <CardDescription>Linked to POS when codes are applied at checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No offers configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell className="font-mono text-xs">{o.code ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.discountType}</TableCell>
                    <TableCell>
                      <Badge variant={o.isActive ? "default" : "secondary"}>
                        {o.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
