"use client";

import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function SignInButton() {
  const handleSignIn = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <button className="auth-button" type="button" onClick={handleSignIn}>
      Sign in with Google
    </button>
  );
}
