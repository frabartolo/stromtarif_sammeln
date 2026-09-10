export async function register() {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  if (process.env["DISABLE_CRON"] === "1") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
