"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface ProfileState {
  error?: string;
  message?: string;
}

/** Update the signed-in user's display name. RLS limits the update to their own row and this one column. */
export async function updateProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = z.string().trim().max(80, "Use at most 80 characters.").safeParse(form.get("display_name") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return { error: "Your session has expired. Sign in again." };
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data || null }).eq("id", uid);
  if (error) return { error: "Your profile could not be saved." };
  revalidatePath("/settings");
  return { message: "Saved." };
}
