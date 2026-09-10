import cron from "node-cron";
import { postToDiscord } from "@/lib/discord";
import { isImprovement, runScan } from "@/lib/scan";
import { latestReport, loadSettings, saveReport } from "@/lib/store";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  const settings = loadSettings();
  const weekly = settings.weeklyCron || "0 7 * * 1";

  if (cron.validate(weekly)) {
    cron.schedule(
      weekly,
      async () => {
        try {
          await runScan({ notify: true, reason: "wöchentlicher Bericht" });
        } catch (error) {
          console.error("Wöchentlicher Scan fehlgeschlagen", error);
        }
      },
      { timezone: "Europe/Berlin" },
    );
  } else {
    console.warn("Ungültiger REPORT_CRON:", weekly);
  }

  cron.schedule(
    "15 7 * * 0,2-6",
    async () => {
      try {
        const previous = latestReport();
        const report = await runScan({ notify: false, reason: "täglicher Zwischenstand" });
        if (isImprovement(report, previous)) {
          report.discord = await postToDiscord(report);
          saveReport(report);
        }
      } catch (error) {
        console.error("Täglicher Scan fehlgeschlagen", error);
      }
    },
    { timezone: "Europe/Berlin" },
  );

  console.log(`Stromtarif-Agent Scheduler aktiv (wöchentlich ${weekly} Europe/Berlin, täglich 07:15).`);
}
