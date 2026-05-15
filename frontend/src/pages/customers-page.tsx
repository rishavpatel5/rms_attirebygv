import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  apiGetJsonAuthedWithMeta,
  apiPostJsonAuthed,
  getStoredAccessToken,
} from "@/lib/api-client";

type Customer = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  _count?: { orders: number };
};

export function CustomersPage() {
  const navigate = useNavigate();
  const authed = Boolean(getStoredAccessToken());
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const { data } = await apiGetJsonAuthedWithMeta<Customer[]>("/api/v1/customers?limit=100");
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await apiPostJsonAuthed("/api/v1/customers", {
        fullName: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
      });
      setName("");
      setPhone("");
      setEmail("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!authed) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link to="/login?redirect=/dashboard/customers" className="underline">
          Sign in
        </Link>{" "}
        to view customers.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Customers</h2>
        <p className="text-sm text-muted-foreground">CRM list — used at POS checkout.</p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Add customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="button" disabled={busy} onClick={() => void create()} className="sm:col-span-3 w-fit rounded-xl">
            Save
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Directory</CardTitle>
          <CardDescription>Click a name to view purchase history and invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => navigate(`/dashboard/customers/${c.id}`)}
                  >
                    <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                      {c.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{c._count?.orders ?? 0}</TableCell>
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
