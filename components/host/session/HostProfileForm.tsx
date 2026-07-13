"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Zap } from "lucide-react";
import { updateHostProfileAction } from "@/actions/host.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Database } from "@/types/database.types";

type Host = Database["public"]["Tables"]["hosts"]["Row"];

interface HostProfileFormProps {
  host: Host;
}

export function HostProfileForm({ host }: HostProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clubName, setClubName] = useState(host.club_name ?? "");
  const [preview, setPreview]   = useState<string | null>(host.avatar_url);
  const [isSaving, setIsSaving] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const formData = new FormData(e.currentTarget);
      const result = await updateHostProfileAction(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Profile updated.");
      router.refresh();
    } catch {
      toast.error("Could not save your profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Club Profile</CardTitle>
        <CardDescription>Your club name and logo — shown across the admin area and every session dashboard.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Club Logo</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Club logo" className="h-full w-full object-cover" />
                ) : (
                  <Zap className="h-7 w-7 text-primary" />
                )}
              </div>
              <div className="space-y-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload logo
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP · up to 2MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="club_name">Club Name</Label>
            <Input
              id="club_name"
              name="club_name"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              minLength={2}
              maxLength={80}
              required
            />
          </div>
        </CardContent>
        <div className="flex justify-end px-6 pb-6">
          <Button type="submit" loading={isSaving}>Save Changes</Button>
        </div>
      </form>
    </Card>
  );
}
