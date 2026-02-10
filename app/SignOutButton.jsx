"use client";

import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function SignOutButton() {
  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.assign("/");
  };

  return (
    <button className="auth-button auth-button--ghost" type="button" onClick={handleSignOut}>
      Sign out
    </button>
  );
}
