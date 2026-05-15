import { ChevronLeft, ChevronRight, Loader2, PackagePlus, Palette, Plus, Rows3, Ruler, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  apiGetJsonAuthed,
  apiGetJsonAuthedWithMeta,
  apiPatchJsonAuthed,
  apiPostJsonAuthed,
  getStoredAccessToken,
} from "@/lib/api-client";
import { fetchAllPaginated } from "@/lib/fetch-paginated";
import { kindLabel, splitByProductKind } from "@/lib/product-kind";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; slug: string };
type Color = { id: string; name: string };
type Size = { id: string; label: string; code: string };

const KINDS = ["APPAREL", "ACCESSORY"] as const;
const GENDERS = ["MENS", "WOMENS", "UNISEX", "KIDS", "NOT_APPLICABLE"] as const;

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function AuthGate() {
  return (
    <div className="mx-auto max-w-lg py-12 text-center text-sm text-muted-foreground">
      <Link to="/login?redirect=/dashboard/catalog" className="underline">
        Sign in
      </Link>{" "}
      to manage the catalog.
    </div>
  );
}

type MatrixRow = { colorId: string; sizeId: string; sku: string; barcode: string; key: string };

type CatalogProductRow = {
  id: string;
  name: string;
  brand: string | null;
  kind: string;
  category: { name: string };
  _count?: { variants: number; images: number };
};

const BLUEPRINT_STEPS = [
  { n: 1, title: "Identity", sub: "Classification & story" },
  { n: 2, title: "Variants", sub: "Colours, sizes & SKUs" },
  { n: 3, title: "Pricing & tax", sub: "Shelf economics" },
  { n: 4, title: "Visual", sub: "Hero image" },
  { n: 5, title: "Complete", sub: "Ready for stock" },
] as const;

const selectControl =
  "flex h-11 w-full cursor-pointer rounded-xl border-2 border-border/60 bg-muted/15 px-3.5 text-sm font-medium shadow-sm transition-colors hover:border-border/90 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function CatalogProductCard({ p }: { p: CatalogProductRow }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{p.name}</CardTitle>
          <Badge variant="secondary" className="shrink-0 whitespace-nowrap text-[10px] uppercase">
            Ready for stock
          </Badge>
        </div>
        <CardDescription>
          {p.category.name}
          {p.brand ? ` · ${p.brand}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        {p._count?.variants ?? 0} SKU{(p._count?.variants ?? 0) === 1 ? "" : "s"} — stock only after
        purchase receive
      </CardContent>
    </Card>
  );
}

function CatalogBrowseByKind({ rows }: { rows: CatalogProductRow[] }) {
  const { apparel, accessory } = splitByProductKind(rows);
  return (
    <div className="space-y-8">
      <CatalogKindSection title={kindLabel("APPAREL")} products={apparel} />
      <CatalogKindSection title={kindLabel("ACCESSORY")} products={accessory} />
    </div>
  );
}

function CatalogKindSection({ title, products }: { title: string; products: CatalogProductRow[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-2">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {products.length} product{products.length === 1 ? "" : "s"}
        </span>
      </div>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {title.toLowerCase()} in the catalog yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <CatalogProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </section>
  );
}

export function CatalogPage() {
  if (!getStoredAccessToken()) return <AuthGate />;

  const [view, setView] = useState<"browse" | "create">("browse");
  const [catalogRows, setCatalogRows] = useState<CatalogProductRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [colors, setColors] = useState<Color[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [pName, setPName] = useState("");
  const [pKind, setPKind] = useState<(typeof KINDS)[number]>("APPAREL");
  const [pGender, setPGender] = useState<(typeof GENDERS)[number]>("UNISEX");
  const [pBrand, setPBrand] = useState("");
  const [pCategoryId, setPCategoryId] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pFitNotes, setPFitNotes] = useState("");
  const [pHsn, setPHsn] = useState("");

  const [selColors, setSelColors] = useState<string[]>([]);
  const [selSizes, setSelSizes] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);

  const [costPrice, setCostPrice] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [gstInclusive, setGstInclusive] = useState(true);
  const [cgstPct, setCgstPct] = useState("2.5");
  const [sgstPct, setSgstPct] = useState("2.5");
  const [igstPct, setIgstPct] = useState("0");
  const [lowStockThr, setLowStockThr] = useState("5");

  const [accessoryBarcode, setAccessoryBarcode] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");

  const [productId, setProductId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sheetCatOpen, setSheetCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatSlug, setNewCatSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [sheetCatBusy, setSheetCatBusy] = useState(false);
  const [sheetCatErr, setSheetCatErr] = useState<string | null>(null);

  const [sheetColOpen, setSheetColOpen] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [sheetColBusy, setSheetColBusy] = useState(false);
  const [sheetColErr, setSheetColErr] = useState<string | null>(null);

  const [sheetSizeOpen, setSheetSizeOpen] = useState(false);
  const [newSizeLabel, setNewSizeLabel] = useState("");
  const [newSizeCode, setNewSizeCode] = useState("");
  const [sheetSizeBusy, setSheetSizeBusy] = useState(false);
  const [sheetSizeErr, setSheetSizeErr] = useState<string | null>(null);

  const loadRef = useCallback(async () => {
    setLoadingRef(true);
    setErr(null);
    try {
      const [cats, col, siz] = await Promise.all([
        apiGetJsonAuthedWithMeta<Category[]>("/api/v1/catalog/categories?limit=200"),
        apiGetJsonAuthedWithMeta<Color[]>("/api/v1/catalog/reference/colors?limit=200"),
        apiGetJsonAuthedWithMeta<Size[]>("/api/v1/catalog/reference/sizes?limit=200"),
      ]);
      setCategories(cats.data);
      setColors(col.data);
      setSizes(siz.data);
      setPCategoryId((prev) => prev || cats.data[0]?.id || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load reference data");
    } finally {
      setLoadingRef(false);
    }
  }, []);

  useEffect(() => {
    void loadRef();
  }, [loadRef]);

  useEffect(() => {
    if (view !== "browse" || loadingRef) return;
    let cancelled = false;
    void (async () => {
      setCatalogLoading(true);
      try {
        const data = await fetchAllPaginated<CatalogProductRow>(
          (page) => `/api/v1/catalog/products?limit=100&page=${page}`,
        );
        if (!cancelled) setCatalogRows(data);
      } catch {
        if (!cancelled) setCatalogRows([]);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, loadingRef]);

  const toggle = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  async function refreshCategories(): Promise<Category[]> {
    const { data } = await apiGetJsonAuthedWithMeta<Category[]>("/api/v1/catalog/categories?limit=200");
    setCategories(data);
    return data;
  }

  async function refreshColors(): Promise<Color[]> {
    const { data } = await apiGetJsonAuthedWithMeta<Color[]>("/api/v1/catalog/reference/colors?limit=200");
    setColors(data);
    return data;
  }

  async function refreshSizes(): Promise<Size[]> {
    const { data } = await apiGetJsonAuthedWithMeta<Size[]>("/api/v1/catalog/reference/sizes?limit=200");
    setSizes(data);
    return data;
  }

  function goBlueprintStep(n: number) {
    if (n === 1) {
      setStep(1);
      return;
    }
    if (!productId) return;
    if (n >= 2 && n <= 5) setStep(n);
  }

  async function submitQuickCategory() {
    setSheetCatErr(null);
    const name = newCatName.trim();
    const slug = newCatSlug.trim().toLowerCase();
    if (!name || !slug) {
      setSheetCatErr("Name and internal code (slug) are required.");
      return;
    }
    setSheetCatBusy(true);
    try {
      const created = await apiPostJsonAuthed<{ id: string }>("/api/v1/catalog/categories", {
        name,
        slug,
        description: null,
      });
      await refreshCategories();
      setPCategoryId(created.id);
      setSheetCatOpen(false);
      setNewCatName("");
      setNewCatSlug("");
    } catch (e) {
      setSheetCatErr(e instanceof Error ? e.message : "Could not create category");
    } finally {
      setSheetCatBusy(false);
    }
  }

  async function submitQuickColor() {
    setSheetColErr(null);
    const name = newColName.trim();
    if (!name) {
      setSheetColErr("Colour name is required.");
      return;
    }
    setSheetColBusy(true);
    try {
      const created = await apiPostJsonAuthed<{ id: string }>("/api/v1/catalog/reference/colors", {
        name,
        hexCode: null,
      });
      await refreshColors();
      setSelColors((prev) => [...prev, created.id]);
      setSheetColOpen(false);
      setNewColName("");
    } catch (e) {
      setSheetColErr(e instanceof Error ? e.message : "Could not add colour");
    } finally {
      setSheetColBusy(false);
    }
  }

  async function submitQuickSize() {
    setSheetSizeErr(null);
    const label = newSizeLabel.trim();
    const code = newSizeCode.trim().toUpperCase();
    if (!label || !code) {
      setSheetSizeErr("Label and code are required (code must be unique).");
      return;
    }
    setSheetSizeBusy(true);
    try {
      const created = await apiPostJsonAuthed<{ id: string }>("/api/v1/catalog/reference/sizes", {
        label,
        code,
      });
      await refreshSizes();
      setSelSizes((prev) => [...prev, created.id]);
      setSheetSizeOpen(false);
      setNewSizeLabel("");
      setNewSizeCode("");
    } catch (e) {
      setSheetSizeErr(e instanceof Error ? e.message : "Could not add size");
    } finally {
      setSheetSizeBusy(false);
    }
  }

  useEffect(() => {
    if (!sheetCatOpen) return;
    setSheetCatErr(null);
    setNewCatName("");
    setNewCatSlug("");
    setSlugTouched(false);
  }, [sheetCatOpen]);

  useEffect(() => {
    if (!sheetColOpen) return;
    setSheetColErr(null);
    setNewColName("");
  }, [sheetColOpen]);

  useEffect(() => {
    if (!sheetSizeOpen) return;
    setSheetSizeErr(null);
    setNewSizeLabel("");
    setNewSizeCode("");
  }, [sheetSizeOpen]);

  useEffect(() => {
    if (pKind !== "APPAREL" || selColors.length === 0 || selSizes.length === 0) {
      setMatrix([]);
      return;
    }
    const slug = slugify(pName || "sku");
    const rows: MatrixRow[] = [];
    for (const c of selColors) {
      for (const s of selSizes) {
        const color = colors.find((x) => x.id === c)?.name ?? "c";
        const size = sizes.find((x) => x.id === s)?.code ?? "s";
        const sku = `${slug}-${color.replace(/\s+/g, "")}-${size}`.toUpperCase().slice(0, 64);
        rows.push({ colorId: c, sizeId: s, sku, barcode: "", key: `${c}-${s}` });
      }
    }
    setMatrix(rows);
  }, [pKind, selColors, selSizes, colors, sizes, pName]);

  async function persistStep1() {
    if (!pName.trim() || !pCategoryId) {
      setErr("Name and category are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const created = await apiPostJsonAuthed<{ id: string }>("/api/v1/catalog/products", {
        name: pName.trim(),
        brand: pBrand.trim() || null,
        categoryId: pCategoryId,
        kind: pKind,
        gender: pGender,
        hsnCode: pHsn.trim() || null,
        description: pDesc.trim() || null,
        fitNotes: pFitNotes.trim() || null,
      });
      setProductId(created.id);
      setStep(2);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create product");
    } finally {
      setBusy(false);
    }
  }

  async function persistStep2() {
    if (!productId) return;
    setBusy(true);
    setErr(null);
    try {
      if (pKind === "ACCESSORY") {
        const sku = `${slugify(pName || "acc").toUpperCase()}-OS`.slice(0, 64);
        await apiPostJsonAuthed(`/api/v1/catalog/products/${productId}/variants`, {
          sku,
          barcode: accessoryBarcode.trim() || null,
          listPrice: Number(listPrice) || 0,
          colorId: selColors[0] || null,
          sizeId: null,
        });
      } else {
        for (const row of matrix) {
          await apiPostJsonAuthed(`/api/v1/catalog/products/${productId}/variants`, {
            sku: row.sku,
            barcode: row.barcode.trim() || null,
            listPrice: 0,
            colorId: row.colorId,
            sizeId: row.sizeId,
          });
        }
      }
      setCgstPct(pKind === "APPAREL" ? "2.5" : "9");
      setSgstPct(pKind === "APPAREL" ? "2.5" : "9");
      setIgstPct("0");
      setStep(3);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create variants");
    } finally {
      setBusy(false);
    }
  }

  async function persistStep3() {
    if (!productId) return;
    setBusy(true);
    setErr(null);
    try {
      const detail = await apiGetJsonAuthed<{
        variants: { id: string; sku: string }[];
      }>(`/api/v1/catalog/products/${productId}`);
      const lp = Number(listPrice) || 0;
      const cp = costPrice.trim() === "" ? null : Number(costPrice);
      const gstPricingMode = gstInclusive ? "INCLUSIVE" : "EXCLUSIVE";
      const thr =
        lowStockThr.trim() === "" ? null : Math.max(0, Math.floor(Number(lowStockThr) || 0));
      for (const v of detail.variants) {
        await apiPatchJsonAuthed(`/api/v1/catalog/variants/${v.id}`, {
          listPrice: lp,
          costPrice: cp,
          gstPricingMode,
          cgstRate: Number(cgstPct) || 0,
          sgstRate: Number(sgstPct) || 0,
          igstRate: Number(igstPct) || 0,
          lowStockThreshold: thr,
          gstEnabled: true,
        });
      }
      setStep(4);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update pricing");
    } finally {
      setBusy(false);
    }
  }

  async function persistStep4() {
    if (!productId || !imageUrl.trim()) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiPostJsonAuthed(`/api/v1/catalog/products/${productId}/images`, {
        url: imageUrl.trim(),
        altText: imageAlt.trim() || null,
        isPrimary: true,
      });
      setStep(5);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setBusy(false);
    }
  }

  if (loadingRef) {
    return (
      <div className="flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading catalog references…
      </div>
    );
  }

  return (
    <div className={cn("mx-auto space-y-8", view === "create" ? "max-w-6xl" : "max-w-5xl")}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Master catalog</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Step 1 of your retail flow: product blueprint only — no stock is created here. After you save,
            each product shows as <span className="font-medium text-foreground">Ready for stock</span> until
            you receive inventory on Purchases.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={view === "browse" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setView("browse")}
          >
            <Rows3 className="mr-1.5 size-4" />
            Records
          </Button>
          <Button
            type="button"
            size="sm"
            variant={view === "create" ? "default" : "outline"}
            className="rounded-full"
            onClick={() => setView("create")}
          >
            <PackagePlus className="mr-1.5 size-4" />
            New blueprint
          </Button>
        </div>
      </div>

      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      {view === "browse" ? (
        <div className="space-y-4">
          {catalogLoading ? (
            <div className="flex items-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Loading records…
            </div>
          ) : catalogRows.length === 0 ? (
            <Card className="border-dashed border-border/70 bg-muted/15">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No master records yet. Switch to <strong className="text-foreground">New blueprint</strong>{" "}
                to create your first product identity.
              </CardContent>
            </Card>
          ) : (
            <CatalogBrowseByKind rows={catalogRows} />
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_1fr] xl:gap-10">
            <aside className="h-fit space-y-1 rounded-2xl border border-border/70 bg-gradient-to-b from-muted/50 to-background p-2 shadow-sm lg:sticky lg:top-6">
              {BLUEPRINT_STEPS.map((s) => {
                const locked = s.n > 1 && !productId;
                const active = step === s.n;
                return (
                  <button
                    key={s.n}
                    type="button"
                    disabled={locked}
                    onClick={() => goBlueprintStep(s.n)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-all",
                      active
                        ? "bg-foreground text-background shadow-md"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                      locked && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums",
                        active ? "border-white/30 bg-white/10" : "border-border/80 bg-background/80",
                      )}
                    >
                      {s.n}
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-sm font-semibold leading-tight">{s.title}</span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px] leading-snug",
                          active ? "text-white/80" : "text-muted-foreground",
                        )}
                      >
                        {s.sub}
                      </span>
                    </span>
                  </button>
                );
              })}
            </aside>

            <div className="min-w-0 overflow-hidden rounded-2xl border-2 border-border/60 bg-gradient-to-br from-card via-card to-muted/15 shadow-[0_28px_90px_-36px_rgba(15,23,42,0.28)] ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
              <div className="border-b border-border/60 bg-muted/20 px-6 py-5 sm:px-9">
                {(() => {
                  const meta = BLUEPRINT_STEPS.find((s) => s.n === step) ?? BLUEPRINT_STEPS[0];
                  return (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                        Step {meta.n} of 5
                      </p>
                      <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{meta.title}</h3>
                      <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{meta.sub}</p>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-8 px-6 py-8 sm:px-9 sm:py-10">
      {step === 1 ? (
        <div className="space-y-10">
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Merchandising identity
            </p>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Blueprint only — no stock is created until you receive goods on Purchases. You can extend your
              taxonomy without leaving this screen.
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Product name
            </Label>
            <Input
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="e.g. Pro Training Tee"
              className="h-14 rounded-2xl border-2 border-border/70 bg-background px-4 text-lg font-semibold tracking-tight shadow-sm placeholder:font-normal placeholder:text-muted-foreground"
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Product type
              </Label>
              <div className="grid grid-cols-2 gap-2 rounded-2xl border-2 border-border/50 bg-muted/20 p-1">
                <Button
                  type="button"
                  variant={pKind === "APPAREL" ? "default" : "ghost"}
                  className="h-11 rounded-xl font-medium"
                  onClick={() => setPKind("APPAREL")}
                >
                  Clothing
                </Button>
                <Button
                  type="button"
                  variant={pKind === "ACCESSORY" ? "default" : "ghost"}
                  className="h-11 rounded-xl font-medium"
                  onClick={() => setPKind("ACCESSORY")}
                >
                  Accessory
                </Button>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Gender
              </Label>
              <select
                className={selectControl}
                value={pGender}
                onChange={(e) => setPGender(e.target.value as (typeof GENDERS)[number])}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g === "NOT_APPLICABLE" ? "Not applicable" : g.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brand</Label>
            <Input
              value={pBrand}
              onChange={(e) => setPBrand(e.target.value)}
              placeholder="House or vendor label"
              className="h-11 rounded-xl border-2 border-border/60 bg-background px-4 text-sm shadow-sm"
            />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tag className="size-4 text-muted-foreground" aria-hidden />
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Shelf category
                </Label>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-full gap-1.5 px-3 text-xs font-medium"
                onClick={() => setSheetCatOpen(true)}
              >
                <Plus className="size-3.5" />
                New category
              </Button>
            </div>
            <select
              className={selectControl}
              value={pCategoryId}
              onChange={(e) => setPCategoryId(e.target.value)}
            >
              {categories.length === 0 ? (
                <option value="">Add a category to continue</option>
              ) : (
                categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
            <p className="text-[11px] text-muted-foreground">
              Categories power reporting filters and POS search — keep the tree tight and retail-meaningful.
            </p>
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Description
            </Label>
            <textarea
              className="flex min-h-[120px] w-full rounded-2xl border-2 border-border/60 bg-background px-4 py-3 text-sm leading-relaxed shadow-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={pDesc}
              onChange={(e) => setPDesc(e.target.value)}
              placeholder="Fabric, story, care, how it fits the floor…"
            />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Fit notes (optional)
              </Label>
              <Input
                value={pFitNotes}
                onChange={(e) => setPFitNotes(e.target.value)}
                placeholder="e.g. Athletic fit, true to size"
                className="h-11 rounded-xl border-2 border-border/60 bg-background px-4 text-sm shadow-sm"
              />
            </div>
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                HSN (optional)
              </Label>
              <Input
                value={pHsn}
                onChange={(e) => setPHsn(e.target.value)}
                placeholder="GST chapter heading"
                className="h-11 rounded-xl border-2 border-border/60 bg-background px-4 font-mono text-sm shadow-sm"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-3 border-t border-border/50 pt-8">
            <Button
              type="button"
              size="lg"
              className="rounded-full px-10 font-semibold shadow-md"
              disabled={busy || !pName.trim() || !pCategoryId}
              onClick={() => void persistStep1()}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save identity & continue
                  <ChevronRight className="ml-2 size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6 rounded-2xl border border-border/50 bg-muted/5 p-6 shadow-inner sm:p-8">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {pKind === "APPAREL"
                ? "Choose colour and size chips, then refine SKU and barcode per combination."
                : "One sellable SKU — optional colour chip and POS barcode."}
            </p>
          </div>
            {pKind === "APPAREL" ? (
              <>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Palette className="size-4 text-muted-foreground" aria-hidden />
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Colours
                      </Label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 rounded-full gap-1 px-3 text-xs"
                      onClick={() => setSheetColOpen(true)}
                    >
                      <Plus className="size-3.5" />
                      New colour
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((c) => (
                      <Button
                        key={c.id}
                        type="button"
                        size="sm"
                        variant={selColors.includes(c.id) ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => toggle(c.id, selColors, setSelColors)}
                      >
                        {c.name}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Ruler className="size-4 text-muted-foreground" aria-hidden />
                      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Sizes
                      </Label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-8 rounded-full gap-1 px-3 text-xs"
                      onClick={() => setSheetSizeOpen(true)}
                    >
                      <Plus className="size-3.5" />
                      New size
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((s) => (
                      <Button
                        key={s.id}
                        type="button"
                        size="sm"
                        variant={selSizes.includes(s.id) ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => toggle(s.id, selSizes, setSelSizes)}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{matrix.length} variants will be created.</p>
                {matrix.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border border-border/60">
                    <table className="w-full min-w-[480px] text-left text-xs">
                      <thead className="border-b border-border/60 bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2 font-medium">Colour / size</th>
                          <th className="px-2 py-2 font-medium">SKU</th>
                          <th className="px-2 py-2 font-medium">Barcode</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.map((row) => {
                          const colorName = colors.find((c) => c.id === row.colorId)?.name ?? "";
                          const sizeLabel = sizes.find((s) => s.id === row.sizeId)?.label ?? "";
                          return (
                            <tr key={row.key} className="border-b border-border/40 last:border-0">
                              <td className="px-2 py-2 text-muted-foreground">
                                {colorName} · {sizeLabel}
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  className="h-8 font-mono text-xs"
                                  value={row.sku}
                                  onChange={(e) =>
                                    setMatrix((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, sku: e.target.value } : r,
                                      ),
                                    )
                                  }
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  className="h-8 font-mono text-xs"
                                  value={row.barcode}
                                  placeholder="Optional"
                                  onChange={(e) =>
                                    setMatrix((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, barcode: e.target.value } : r,
                                      ),
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Optional colour
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-8 rounded-full gap-1 px-3 text-xs"
                    onClick={() => setSheetColOpen(true)}
                  >
                    <Plus className="size-3.5" />
                    New colour
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setSelColors([])}>
                      None
                    </Button>
                    {colors.map((c) => (
                      <Button
                        key={c.id}
                        type="button"
                        size="sm"
                        variant={selColors[0] === c.id ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => setSelColors([c.id])}
                      >
                        {c.name}
                      </Button>
                    ))}
                  </div>
                <div className="space-y-2">
                  <Label>Barcode / POS code (optional)</Label>
                  <Input
                    value={accessoryBarcode}
                    onChange={(e) => setAccessoryBarcode(e.target.value)}
                    placeholder="EAN-13 or internal code"
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex flex-wrap justify-between gap-3 pt-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 size-4" /> Back
              </Button>
              <Button
                type="button"
                className="rounded-full px-8 font-semibold"
                disabled={busy || (pKind === "APPAREL" && matrix.length === 0)}
                onClick={() => void persistStep2()}
              >
                Continue <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-6 rounded-2xl border border-border/50 bg-muted/5 p-6 shadow-inner sm:p-8">
          <p className="max-w-xl text-sm text-muted-foreground">
            These defaults apply to every variant on this product. Clothing typically uses 5% (2.5+2.5 CGST/SGST);
            accessories often use 18% (9+9).
          </p>
          <div className="grid max-w-lg gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cost price (optional)
              </Label>
              <Input
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                type="number"
                min={0}
                className="h-11 rounded-xl border-2 border-border/60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Selling price (list)
              </Label>
              <Input
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                type="number"
                min={0}
                className="h-11 rounded-xl border-2 border-border/60"
              />
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/80 px-4 py-3">
              <input
                id="gst-inc"
                type="checkbox"
                className="size-4 rounded border-input"
                checked={gstInclusive}
                onChange={(e) => setGstInclusive(e.target.checked)}
              />
              <Label htmlFor="gst-inc" className="cursor-pointer text-sm font-medium">
                GST inclusive list price
              </Label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">CGST %</Label>
                <Input
                  className="h-11 rounded-xl border-2 border-border/60 tabular-nums"
                  value={cgstPct}
                  onChange={(e) => setCgstPct(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">SGST %</Label>
                <Input
                  className="h-11 rounded-xl border-2 border-border/60 tabular-nums"
                  value={sgstPct}
                  onChange={(e) => setSgstPct(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">IGST %</Label>
                <Input
                  className="h-11 rounded-xl border-2 border-border/60 tabular-nums"
                  value={igstPct}
                  onChange={(e) => setIgstPct(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Low-stock alert (units)
              </Label>
              <Input
                className="h-11 rounded-xl border-2 border-border/60 tabular-nums"
                value={lowStockThr}
                onChange={(e) => setLowStockThr(e.target.value)}
                placeholder="e.g. 5"
              />
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t border-border/40 pt-6">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-1 size-4" /> Back
              </Button>
              <Button
                type="button"
                className="rounded-full px-8 font-semibold"
                disabled={busy}
                onClick={() => void persistStep3()}
              >
                Continue <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-6 rounded-2xl border border-border/50 bg-muted/5 p-6 shadow-inner sm:p-8">
          <p className="max-w-xl text-sm text-muted-foreground">
            Paste a secure HTTPS image URL (for example from your DAM or CDN). This becomes the primary visual
            on the record.
          </p>
          <div className="grid max-w-lg gap-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Image URL
              </Label>
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://…"
                className="h-11 rounded-xl border-2 border-border/60 font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Alt text
              </Label>
              <Input
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                className="h-11 rounded-xl border-2 border-border/60"
              />
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t border-border/40 pt-6">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(3)}>
                <ChevronLeft className="mr-1 size-4" /> Back
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setStep(5)}>
                  Skip for now
                </Button>
                <Button
                  type="button"
                  className="rounded-full px-6 font-semibold"
                  disabled={busy || !imageUrl.trim()}
                  onClick={() => void persistStep4()}
                >
                  Save image
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-6 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/5 via-card to-card p-6 shadow-inner sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="text-lg font-semibold tracking-tight">Blueprint saved</h4>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Ready for stock
            </Badge>
          </div>
          <p className="max-w-xl text-sm text-muted-foreground">
            No inventory yet — receive stock from{" "}
            <Link to="/dashboard/purchases" className="font-medium text-foreground underline underline-offset-2">
              Purchases
            </Link>{" "}
            when goods arrive.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full px-6 font-semibold">
              <Link to="/dashboard/purchases">Receive stock</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setStep(1);
                setProductId(null);
                setPName("");
                setPDesc("");
                setPFitNotes("");
                setAccessoryBarcode("");
                setMatrix([]);
                setSelColors([]);
                setSelSizes([]);
                setErr(null);
              }}
            >
              Create another blueprint
            </Button>
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setView("browse")}>
              View records
            </Button>
          </div>
        </div>
      ) : null}
              </div>
            </div>
          </div>

          <Sheet open={sheetCatOpen} onOpenChange={setSheetCatOpen}>
            <SheetContent side="right" className="sm:max-w-md">
              <SheetHeader>
                <SheetTitle>New shelf category</SheetTitle>
                <SheetDescription>
                  Appears everywhere this product is classified — POS filters, reports, and merchandising views.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 grid gap-4">
                {sheetCatErr ? <p className="text-sm text-destructive">{sheetCatErr}</p> : null}
                <div className="space-y-2">
                  <Label>Display name</Label>
                  <Input
                    value={newCatName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNewCatName(v);
                      if (!slugTouched) setNewCatSlug(slugify(v));
                    }}
                    placeholder="e.g. Performance tops"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Internal code (slug)</Label>
                  <Input
                    value={newCatSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setNewCatSlug(e.target.value.toLowerCase());
                    }}
                    placeholder="performance-tops"
                    className="h-11 rounded-xl font-mono text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Lowercase letters, numbers, and hyphens only.</p>
                </div>
              </div>
              <SheetFooter className="mt-8">
                <Button type="button" variant="outline" onClick={() => setSheetCatOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={sheetCatBusy} onClick={() => void submitQuickCategory()}>
                  {sheetCatBusy ? <Loader2 className="size-4 animate-spin" /> : "Save category"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet open={sheetColOpen} onOpenChange={setSheetColOpen}>
            <SheetContent side="right" className="sm:max-w-md">
              <SheetHeader>
                <SheetTitle>New colour</SheetTitle>
                <SheetDescription>Adds to your palette and selects it for this blueprint.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 grid gap-4">
                {sheetColErr ? <p className="text-sm text-destructive">{sheetColErr}</p> : null}
                <div className="space-y-2">
                  <Label>Colour name</Label>
                  <Input
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="e.g. Midnight navy"
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
              <SheetFooter className="mt-8">
                <Button type="button" variant="outline" onClick={() => setSheetColOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={sheetColBusy} onClick={() => void submitQuickColor()}>
                  {sheetColBusy ? <Loader2 className="size-4 animate-spin" /> : "Save colour"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Sheet open={sheetSizeOpen} onOpenChange={setSheetSizeOpen}>
            <SheetContent side="right" className="sm:max-w-md">
              <SheetHeader>
                <SheetTitle>New size</SheetTitle>
                <SheetDescription>Code must be unique — used in SKU generation and exports.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 grid gap-4">
                {sheetSizeErr ? <p className="text-sm text-destructive">{sheetSizeErr}</p> : null}
                <div className="space-y-2">
                  <Label>Label (shown on bill)</Label>
                  <Input
                    value={newSizeLabel}
                    onChange={(e) => setNewSizeLabel(e.target.value)}
                    placeholder="e.g. Large"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code (unique)</Label>
                  <Input
                    value={newSizeCode}
                    onChange={(e) => setNewSizeCode(e.target.value.toUpperCase())}
                    placeholder="L"
                    className="h-11 rounded-xl font-mono text-sm uppercase"
                  />
                </div>
              </div>
              <SheetFooter className="mt-8">
                <Button type="button" variant="outline" onClick={() => setSheetSizeOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" disabled={sheetSizeBusy} onClick={() => void submitQuickSize()}>
                  {sheetSizeBusy ? <Loader2 className="size-4 animate-spin" /> : "Save size"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}
