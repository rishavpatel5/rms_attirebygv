import { Search } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { ThemeToggle } from "@/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MobileNavTrigger } from "@/components/layout/app-sidebar";
import { clearStoredTokens } from "@/lib/api-client";

export function TopBar({ title }: { title: string }) {
  const navigate = useNavigate();

  function signOut() {
    clearStoredTokens();
    navigate("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-6">
      <MobileNavTrigger />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold tracking-tight sm:text-base">
          {title}
        </h1>
      </div>
      <div className="hidden max-w-xs flex-1 md:block lg:max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search…"
            className="h-9 rounded-full border-border/80 bg-muted/40 pl-9 transition-colors focus-visible:bg-background"
            aria-label="Global search"
          />
        </div>
      </div>
      <NotificationsMenu />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden rounded-full border-border/80 sm:inline-flex"
          >
            Store
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Workspace</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/dashboard">Dashboard</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/dashboard/inventory">Inventory</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/billing">Billing</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
