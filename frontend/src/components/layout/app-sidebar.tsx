import type { ComponentType } from "react";
import {
  BarChart2,
  CreditCard,
  FolderTree,
  Gift,
  LayoutDashboard,
  Menu,
  Package,
  PanelLeft,
  PanelLeftClose,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUiStore } from "@/stores/ui-store";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  step?: number;
  end?: boolean;
};

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end ?? item.to === "/dashboard"}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
          collapsed && "justify-center px-2",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
              isActive ? "bg-primary-foreground/15" : "bg-muted/80 group-hover:bg-muted",
            )}
          >
            <Icon className="size-4" />
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              {item.step != null ? (
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.step}
                </span>
              ) : null}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

const WORKFLOW: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dashboard/catalog", label: "Master catalog", icon: FolderTree, step: 1 },
  { to: "/dashboard/purchases", label: "Receive stock", icon: ShoppingCart, step: 2 },
  { to: "/dashboard/inventory", label: "Live stock", icon: Package, step: 3 },
  { to: "/billing", label: "Billing / POS", icon: CreditCard, step: 4 },
];

const MANAGE: NavItem[] = [
  { to: "/dashboard/customers", label: "Customers", icon: Users },
  { to: "/dashboard/suppliers", label: "Suppliers", icon: Truck },
  { to: "/dashboard/reports", label: "Reports", icon: BarChart2, step: 5 },
  { to: "/dashboard/offers", label: "Offers", icon: Gift },
];

export function AppSidebar({ className }: { className?: string }) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebarCollapsed);
  const closeMobile = useUiStore((s) => s.setMobileNavOpen);

  const onNavigate = () => closeMobile(false);

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-card",
        collapsed ? "w-[72px]" : "w-[260px]",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center border-b border-border px-3">
        {!collapsed ? (
          <div className="min-w-0 flex-1 pl-0.5">
            <p className="truncate text-sm font-semibold tracking-tight">Attire RMS</p>
            <p className="truncate text-[11px] text-muted-foreground">Retail management</p>
          </div>
        ) : (
          <span className="mx-auto text-xs font-bold text-muted-foreground">RMS</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-5 p-2 pb-4">
          <div>
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[11px] font-medium text-muted-foreground">
                Daily workflow
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {WORKFLOW.map((item) => (
                <NavItemLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>

          <div>
            {!collapsed && (
              <p className="mb-1.5 px-2.5 text-[11px] font-medium text-muted-foreground">
                Manage
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {MANAGE.map((item) => (
                <NavItemLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        </nav>
      </ScrollArea>

      <div className="shrink-0 border-t border-border p-2">
        {!collapsed ? (
          <Button asChild className="mb-2 w-full justify-start gap-2" size="sm">
            <NavLink to="/billing" onClick={onNavigate}>
              <CreditCard className="size-4" />
              Open POS
            </NavLink>
          </Button>
        ) : (
          <Button asChild size="icon" className="mb-2 w-full" variant="default">
            <NavLink to="/billing" onClick={onNavigate} title="Open POS">
              <CreditCard className="size-4" />
            </NavLink>
          </Button>
        )}
        <NavItemLink
          item={{ to: "/dashboard/settings", label: "Settings", icon: Settings }}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      </div>
    </aside>
  );
}

export function MobileNavTrigger() {
  const setOpen = useUiStore((s) => s.setMobileNavOpen);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="lg:hidden"
      aria-label="Open menu"
      onClick={() => setOpen(true)}
    >
      <Menu className="size-5" />
    </Button>
  );
}
