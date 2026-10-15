/**
 * Session cookie settings. Verfy never uses the Supabase browser client, so
 * the auth cookies can be HttpOnly (page scripts cannot read the tokens) and,
 * on an https deployment, Secure. SameSite=Lax blocks cross-site POSTs.
 */
export function sessionCookieOptions(appUrl: string | undefined) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: (appUrl ?? "").startsWith("https://"),
  };
}
