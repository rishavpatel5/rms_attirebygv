import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  _count?: { purchaseOrders: number };
};

export function SuppliersPage() {
  const authed = Boolean(getStoredAccessToken());
  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    try {
      const { data } = await apiGetJsonAuthedWithMeta<Supplier[]>("/api/v1/suppliers?limit=100");
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
      await apiPostJsonAuthed("/api/v1/suppliers", {
        name: name.trim(),
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
        <Link to="/login?redirect=/dashboard/suppliers" className="underline">
          Sign in
        </Link>{" "}
        to manage suppliers.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Suppliers</h2>
        <p className="text-sm text-muted-foreground">Vendors for purchase invoices.</p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Add supplier</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Name</Label>
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
          <CardDescription>Suppliers available on purchase entry.</CardDescription>
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
                  <TableHead className="text-right">POs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">{s.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.email ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s._count?.purchaseOrders ?? 0}</TableCell>
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
