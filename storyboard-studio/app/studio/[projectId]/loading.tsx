import { Loader2 } from "lucide-react";

export default function StudioLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm text-gray-400">Loading studio…</p>
      </div>
    </div>
  );
}
