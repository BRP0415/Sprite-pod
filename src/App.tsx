import { useEffect } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import CollectionPage from "@/pages/collection";
import MasteryPage from "@/pages/mastery";
import ProfilePage from "@/pages/profile";
import FriendsPage from "@/pages/friends";
import FriendPage from "@/pages/friend";
import AuthPage from "@/pages/auth";
import { TabBar } from "@/components/Chrome";
import { StoreProvider, useStore } from "@/lib/store";

function Shell() {
  const { mode } = useStore();
  const [location, navigate] = useLocation();

  // Signed-out visitors land on the auth screen; guests/users get the tabbed app.
  // Driving both directions from `mode` here means the auth screen never has to
  // navigate by hand after a successful sign-in, which used to leave the app
  // signed in but stuck on the auth route.
  useEffect(() => {
    if (mode === "anon" && location !== "/auth") navigate("/auth", { replace: true });
    // Guests may sit on /auth on purpose to upgrade to an account, so only a
    // fully signed-in user gets pulled off it.
    else if (mode === "user" && location === "/auth") navigate("/", { replace: true });
  }, [mode, location, navigate]);

  const showTabs = mode !== "anon" && location !== "/auth";

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl">
      <div className={showTabs ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))]" : undefined}>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/collection" component={CollectionPage} />
          <Route path="/mastery" component={MasteryPage} />
          <Route path="/friends" component={FriendsPage} />
          <Route path="/friends/:username" component={FriendPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/auth" component={AuthPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
      {showTabs && <TabBar />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <StoreProvider>
          <Router hook={useHashLocation}>
            <Shell />
          </Router>
        </StoreProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
