import { AlertTriangle, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export function NotificationsMenu() {
  const { items, loading, error, needsAuth, reload, count } = useNotifications();

  return (
    <DropdownMenu onOpenChange={(open) => open && void reload()}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative size-9 rounded-full border-border/80"
          aria-label={count > 0 ? `${count} notifications` : "Notifications"}
        >
          <Bell className="size-4" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {count > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">{count} low stock</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {needsAuth ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Sign in to see inventory alerts.</p>
        ) : loading ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="px-2 py-3 text-sm text-destructive">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">No low-stock items right now.</p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.id} asChild className="cursor-pointer flex-col items-start gap-0.5 py-2">
              <Link to="/dashboard/inventory" className="flex w-full items-start gap-2">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    item.critical ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.sku} · {item.quantity} left
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard/inventory" className="w-full text-center text-sm font-medium">
            View inventory
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
