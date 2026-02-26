"use client";

import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

export default function SignOutButton() {
  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.assign("/");
  };

  return (
    <button className="btn btn-ghost btn-sm" type="button" onClick={handleSignOut}>
      Sign out
    </button>
  );
}
