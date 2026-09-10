import { Dashboard } from "@/components/dashboard";
import { discordStatusPublic } from "@/lib/discord";
import { loadHousehold } from "@/lib/household";
import { latestReport, loadReports, loadSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Home() {
  const settings = loadSettings();
  return (
    <Dashboard
      initialStatus={{
        household: loadHousehold(),
        latest: latestReport(),
        discord: discordStatusPublic(),
        cron: settings.weeklyCron,
        timezone: "Europe/Berlin",
      }}
      initialReports={loadReports()}
    />
  );
}
