import { ScreenPlaceholder } from "@/components/ScreenPlaceholder";
import { DevSeedPanel } from "@/components/DevSeedPanel";

export default function AdminPage() {
  return (
    <div className="space-y-4">
      <ScreenPlaceholder
        title="Admin"
        blurb="Settle / override / void, run the maker draws per stage, manage the roster and stakes, and read the audit log. Admins only."
        comingIn="Prompt 9"
      />
      {process.env.NODE_ENV !== "production" && <DevSeedPanel />}
    </div>
  );
}
