import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter, setCsrfTokenGetter } from "@workspace/api-client-react";
import { supabase } from "./lib/supabase";
import { initSentry } from "./lib/sentry";
import { getCsrfToken, clearCsrfToken } from "./lib/csrf";

initSentry();

setAuthTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

// Register the CSRF token getter for all orval-generated hooks
setCsrfTokenGetter(getCsrfToken);

// Clear the cached CSRF token on auth state changes so the next mutation
// re-fetches a token tied to the new session identifier
supabase.auth.onAuthStateChange(() => {
  clearCsrfToken();
});

createRoot(document.getElementById("root")!).render(<App />);
