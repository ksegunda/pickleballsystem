"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedUser } from "@/lib/supabase/auth";
import type { ActionResult } from "./auth.actions";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png":  "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function updateHostProfileAction(
  formData: FormData
): Promise<ActionResult<{ avatarUrl: string | null }>> {
  const user = await getVerifiedUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const clubName = (formData.get("club_name") as string | null)?.trim();
  if (!clubName || clubName.length < 2 || clubName.length > 80) {
    return { success: false, error: "Club name must be between 2 and 80 characters." };
  }

  const logoFile = formData.get("logo") as File | null;
  let avatarUrl: string | undefined;

  if (logoFile && logoFile.size > 0) {
    const ext = ALLOWED_LOGO_TYPES[logoFile.type];
    if (!ext) {
      return { success: false, error: "Logo must be a PNG, JPEG, or WebP image." };
    }
    if (logoFile.size > MAX_LOGO_BYTES) {
      return { success: false, error: "Logo must be under 2MB." };
    }

    // storage.objects has no RLS policy granting hosts write access (that's
    // another hand-pasted SQL migration, same friction as every DDL change
    // in this project) — the admin client bypasses that, safe here because
    // we've already independently verified above that `user` really is this
    // host. Fixed filename (not the original upload name) so re-uploading
    // overwrites in place rather than accumulating old logos per host.
    const path = `${user.id}/logo.${ext}`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("host-logos")
      .upload(path, logoFile, { upsert: true, contentType: logoFile.type });

    if (uploadError) {
      return { success: false, error: "Could not upload the logo. Please try again." };
    }

    const { data: publicUrlData } = admin.storage.from("host-logos").getPublicUrl(path);
    // Cache-bust — same path every time, so without this the browser/CDN
    // would keep showing the previous logo after a re-upload.
    avatarUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("hosts")
    .update({ club_name: clubName, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
    .eq("id", user.id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath("/", "layout");
  return { success: true, data: { avatarUrl: avatarUrl ?? null } };
}
