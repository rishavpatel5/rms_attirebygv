import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/theme-store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    const apply = () => {
      const t = useThemeStore.getState().theme;
      document.documentElement.classList.toggle("dark", t === "dark");
    };
    if (useThemeStore.persist.hasHydrated()) apply();
    const unsub = useThemeStore.persist.onFinishHydration(apply);
    return unsub;
  }, []);

  return <>{children}</>;
}

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  return (
    <Button
      variant="outline"
      size="icon"
      type="button"
      onClick={toggleTheme}
      className="rounded-full border-border/80 bg-background/60 shadow-sm transition-all duration-200 hover:bg-accent"
    >
      <span className="sr-only">Toggle theme</span>
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
