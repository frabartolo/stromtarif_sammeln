"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCw,
  SunMedium,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { daysUntilContractEnd, switchByHint } from "@/lib/contract";
import { formatCt, formatEur, formatKwh } from "@/lib/money";
import type { Household, ScanReport, TariffOffer } from "@/lib/types";

type StatusResponse = {
  household: Household;
  latest: ScanReport | null;
  discord: {
    configured: boolean;
    masked: string;
    weeklyCron: string;
    envLocked: boolean;
    mode?: "bot" | "webhook" | "none";
    target?: string;
    allowedUserCount?: number;
    hasBotToken?: boolean;
  };
  cron: string;
  timezone: string;
};

function kindLabel(kind: TariffOffer["kind"]) {
  switch (kind) {
    case "grundversorgung":
      return "Grundversorgung";
    case "dynamic":
      return "Dynamisch";
    case "local":
      return "Stadtwerke";
    case "current":
      return "Aktueller Vertrag";
    default:
      return "Festpreis";
  }
}

function when(iso: string) {
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
}

export function Dashboard({
  initialStatus,
  initialReports,
}: {
  initialStatus: StatusResponse;
  initialReports: ScanReport[];
}) {
  const [status, setStatus] = useState<StatusResponse>(initialStatus);
  const [report, setReport] = useState<ScanReport | null>(initialStatus.latest);
  const [reports, setReports] = useState<ScanReport[]>(initialReports);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhook, setWebhook] = useState("");
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [provider, setProvider] = useState(initialStatus.household.currentProvider ?? "");
  const [workingPrice, setWorkingPrice] = useState(
    initialStatus.household.currentWorkingPriceCt?.toString().replace(".", ",") ?? "",
  );
  const [basePrice, setBasePrice] = useState(
    initialStatus.household.currentBasePriceYear?.toString().replace(".", ",") ?? "",
  );
  const [savingHouse, setSavingHouse] = useState(false);
  const [tab, setTab] = useState("tarife");

  const load = useCallback(async () => {
    setError(null);
    const [statusRes, reportsRes] = await Promise.all([
      fetch("/api/status", { cache: "no-store" }),
      fetch("/api/reports", { cache: "no-store" }),
    ]);
    if (!statusRes.ok) throw new Error("Status konnte nicht geladen werden.");
    const statusJson = (await statusRes.json()) as StatusResponse;
    const reportsJson = (await reportsRes.json()) as { reports: ScanReport[] };
    setStatus(statusJson);
    setReports(reportsJson.reports ?? []);
    setReport(statusJson.latest);
    setProvider(statusJson.household.currentProvider ?? "");
    setWorkingPrice(
      statusJson.household.currentWorkingPriceCt?.toString().replace(".", ",") ?? "",
    );
    setBasePrice(
      statusJson.household.currentBasePriceYear?.toString().replace(".", ",") ?? "",
    );
  }, []);

  const ranked = useMemo(() => {
    if (!report) return [];
    return [...report.offers].sort((a, b) => a.recurringYearCost - b.recurringYearCost);
  }, [report]);

  const recommended = ranked.find((o) => o.id === report?.recommendation.offerId);
  const grundversorgung = ranked.find((o) => o.kind === "grundversorgung");

  async function scan(notify: boolean) {
    setScanning(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify }),
      });
      if (!res.ok) throw new Error("Scan fehlgeschlagen.");
      const json = (await res.json()) as ScanReport;
      setReport(json);
      await load();
      setFlash(
        json.discord.posted
          ? "Scan fertig und nach Discord geschickt."
          : json.discord.skippedReason ?? "Scan fertig.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  async function saveWebhook() {
    setSavingWebhook(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordWebhookUrl: webhook }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Speichern fehlgeschlagen.");
      setWebhook("");
      setFlash("Discord-Webhook gespeichert.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingWebhook(false);
    }
  }

  async function testDiscord() {
    setTestingDiscord(true);
    setError(null);
    try {
      const res = await fetch("/api/discord-test", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Discord-Test fehlgeschlagen.");
      setFlash("Testnachricht an Discord gesendet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingDiscord(false);
    }
  }

  async function saveCurrentTariff() {
    setSavingHouse(true);
    setError(null);
    try {
      const wp = workingPrice.trim()
        ? Number(workingPrice.replace(",", "."))
        : null;
      const bp = basePrice.trim() ? Number(basePrice.replace(",", ".")) : null;
      const res = await fetch("/api/household", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentProvider: provider.trim() || null,
          currentWorkingPriceCt: wp,
          currentBasePriceYear: bp,
        }),
      });
      if (!res.ok) throw new Error("Haushalt konnte nicht gespeichert werden.");
      setFlash("Aktueller Tarif gespeichert. Als Nächstes einen neuen Scan starten.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingHouse(false);
    }
  }

  const household = status.household;
  const daysLeft = daysUntilContractEnd(household);
  const switchBy = switchByHint(household);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Zap className="size-5" />
            <span className="text-xs font-medium tracking-[0.2em] uppercase">
              Hermes / Kiara
            </span>
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Stromtarif-Agent
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
            Sucht regelmäßig den günstigsten Stromtarif für Ippesheimer Weg 24,
            55545 Bad Kreuznach, und berichtet nach Discord. Vergleichsbasis ist
            der Netzbezug von {formatKwh(household?.purchasedKwh ?? 14500)}, nicht
            die 22.000 kWh Gesamtverbrauch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => scan(true)} disabled={scanning} size="lg">
            {scanning ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Jetzt prüfen und melden
          </Button>
          <Button variant="outline" onClick={() => scan(false)} disabled={scanning} size="lg">
            Nur scannen
          </Button>
        </div>
      </header>

      {daysLeft != null ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>enercity-Vertrag endet am 31.12.2026</AlertTitle>
          <AlertDescription>
            Noch {daysLeft} Tage. Lieferbeginn 1.1.2027 heißt: Wechsel bis etwa {switchBy}{" "}
            anstoßen. Wärmepumpe, zwei E-Autos und Haushalt sitzen ohne Smart Meter auf
            einem Tarif – für 2027 zuerst ein 12-Monats-Festpreis, dynamisch erst nach
            iMSys.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {flash ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Hinweis</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Empfehlung</CardTitle>
            <CardDescription>
              {report ? `Letzter Scan ${when(report.createdAt)}` : "Noch kein Scan"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!report ? (
              <p className="text-muted-foreground">
                Noch keine Daten. Startet den ersten Scan, dann erscheinen hier
                Grundversorgung und Festpreisangebote. Dynamische Tarife bleiben
                ohne iMSys ausgeblendet.
              </p>
            ) : (
              <>
                <p className="text-xl font-medium leading-snug">
                  {report.recommendation.headline}
                </p>
                <p className="text-sm text-muted-foreground">{report.recommendation.body}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric
                    label="Folgekosten / Jahr"
                    value={
                      recommended ? formatEur(recommended.recurringYearCost, 0) : "–"
                    }
                  />
                  <Metric
                    label="vs. Grundversorgung"
                    value={
                      report.recommendation.savingsVsGrundversorgung != null
                        ? formatEur(report.recommendation.savingsVsGrundversorgung, 0)
                        : "–"
                    }
                    hint={grundversorgung ? formatEur(grundversorgung.recurringYearCost, 0) : undefined}
                  />
                  {report.spot?.days90AvgCt != null ? (
                    <Metric
                      label="Börse 90 Tage"
                      value={formatCt(report.spot.days90AvgCt)}
                      hint="ohne Netzentgelte"
                    />
                  ) : (
                    <Metric
                      label="Dynamische Tarife"
                      value="ausgeblendet"
                      hint="kein iMSys / Smart Meter"
                    />
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlugZap className="size-4" />
              Haushalt
            </CardTitle>
            <CardDescription>
              {household?.street}
              <br />
              {household?.zip} {household?.city}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Gesamtverbrauch" value={formatKwh(household?.totalKwh ?? 0)} />
            <Row
              label="Netzbezug"
              value={`${formatKwh(household?.purchasedKwhMin ?? 0)}–${formatKwh(household?.purchasedKwhMax ?? 0)}`}
            />
            <Row label="Rechenwert" value={formatKwh(household?.purchasedKwh ?? 0)} />
            <Row label="Lieferant" value={household?.currentProvider ?? "unbekannt"} />
            <Row
              label="Vertragsende"
              value={
                household?.contractEnd
                  ? new Date(`${household.contractEnd}T00:00:00`).toLocaleDateString("de-DE")
                  : "–"
              }
            />
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">Wärmepumpe</Badge>
              <Badge variant="secondary">Wallbox · {household?.evCount ?? 2} Autos</Badge>
              <Badge variant="outline">kein Smart Meter</Badge>
              <Badge variant="outline">kein Speicher</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">PV-Eigenverbrauch</span>
              <Badge variant="secondary">
                <SunMedium data-icon="inline-start" />
                angenommen
              </Badge>
            </div>
            <Separator />
            <Row
              label="Netz / Grundversorger"
              value="Stadtwerke Bad Kreuznach"
            />
            <Row
              label="Discord"
              value={status?.discord.configured ? status.discord.masked : "nicht gesetzt"}
            />
            <Row label="Rhythmus" value={`Mo 07:00 ${status?.timezone}`} />
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-col gap-4">
        <div className="flex w-full flex-wrap gap-1 rounded-lg bg-muted p-[3px]">
          {(
            [
              ["tarife", "Tarife"],
              ["quellen", "Quellen"],
              ["discord", "Discord"],
              ["vertrag", "Euer Vertrag"],
              ["verlauf", "Verlauf"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-tab={id}
              aria-pressed={tab === id}
              className={buttonVariants({
                variant: tab === id ? "default" : "ghost",
                size: "sm",
                className: "flex-1",
              })}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "tarife" ? (
          <Card>
            <CardHeader>
              <CardTitle>Gefundene und modellierte Tarife</CardTitle>
              <CardDescription>
                Sortiert nach Folgekosten ohne Neukundenbonus. Jahr-1-Preise mit
                Bonus stehen extra – bei 14.500 kWh zählen Boni kaum.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {ranked.length === 0 ? (
                <p className="text-muted-foreground">Noch keine Tarife. Bitte scannen.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Anbieter</TableHead>
                      <TableHead>Art</TableHead>
                      <TableHead className="text-right">Arbeitspreis</TableHead>
                      <TableHead className="text-right">Jahr 1</TableHead>
                      <TableHead className="text-right">Folgejahr</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ranked.map((offer) => {
                      const isRec = offer.id === report?.recommendation.offerId;
                      return (
                        <TableRow key={offer.id} className={isRec ? "bg-primary/8" : undefined}>
                          <TableCell>
                            <div className="font-medium">{offer.provider}</div>
                            <div className="text-muted-foreground">{offer.name}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {offer.green ? <Badge variant="secondary">Öko</Badge> : null}
                              {offer.estimated ? <Badge variant="outline">Schätzung</Badge> : null}
                              {isRec ? <Badge>Empfehlung</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell>{kindLabel(offer.kind)}</TableCell>
                          <TableCell className="text-right">
                            {offer.workingPriceCt != null ? formatCt(offer.workingPriceCt) : "–"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatEur(offer.firstYearCost, 0)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatEur(offer.recurringYearCost, 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            {offer.sourceUrl ? (
                              <a
                                href={offer.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={buttonVariants({ variant: "ghost", size: "icon" })}
                                aria-label="Quelle öffnen"
                              >
                                <ExternalLink />
                              </a>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === "quellen" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Abgerufene Quellen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(report?.sources ?? []).length === 0 ? (
                  <p className="text-muted-foreground">Nach dem ersten Scan erscheinen hier die Quellen.</p>
                ) : (
                  report?.sources.map((source) => (
                    <div key={source.id} className="rounded-lg border border-border/80 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{source.label}</span>
                        <Badge variant={source.ok ? "secondary" : "destructive"}>
                          {source.ok ? "ok" : "Fehler"}
                        </Badge>
                      </div>
                      {source.note ? (
                        <p className="mt-1 text-xs text-muted-foreground">{source.note}</p>
                      ) : null}
                      {source.error ? (
                        <p className="mt-1 text-xs text-destructive">{source.error}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Portale zum Gegenprüfen</CardTitle>
                <CardDescription>
                  Verivox und Check24 blocken automatisierte Abfragen. Hier die
                  direkten Links mit eurer PLZ.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(report?.portalLinks ?? status?.latest?.portalLinks ?? []).map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border/80 px-3 py-2 text-sm hover:bg-muted"
                  >
                    {link.label}
                    <ExternalLink className="size-4 text-muted-foreground" />
                  </a>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === "discord" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="size-4" />
                Discord-Berichte
              </CardTitle>
              <CardDescription>
                Wöchentlich montags 07:00 Europe/Berlin. Auf Kiara dieselben
                Hermes-Variablen wie <code>/home/kiara/.hermes/.env</code>:{" "}
                <code>DISCORD_BOT_TOKEN</code> und{" "}
                <code>DISCORD_ALLOWED_USERS</code>. Ohne{" "}
                <code>DISCORD_HOME_CHANNEL</code> geht der Bericht per DM an die
                erlaubten Nutzer. Webhook bleibt optionaler Fallback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Row
                label="Status"
                value={
                  status?.discord.configured
                    ? status.discord.mode === "bot"
                      ? "Hermes-Bot hinterlegt"
                      : "Webhook hinterlegt"
                    : "fehlt noch"
                }
              />
              {status?.discord.configured ? (
                <Row label="Ziel" value={status.discord.masked} />
              ) : status?.discord.hasBotToken ? (
                <p className="text-sm text-destructive">
                  Token ist da, aber keine User-IDs. In{" "}
                  <code>/home/kiara/.hermes/.env</code> muss{" "}
                  <code>DISCORD_ALLOWED_USERS</code> die Discord-User-ID enthalten
                  (Entwicklermodus → Rechtsklick auf den Namen → ID kopieren), oder{" "}
                  <code>DISCORD_HOME_CHANNEL</code> setzen.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Discord-Variablen kommen im Container nicht an. Nach einem Update:{" "}
                  <code>git pull && ./deploy/on-kiara.sh</code>
                </p>
              )}
              {status?.discord.mode === "bot" && (status.discord.allowedUserCount ?? 0) > 0 ? (
                <Row label="Erlaubte Nutzer" value={String(status.discord.allowedUserCount)} />
              ) : null}
              {report?.discord.posted ? (
                <p className="text-sm text-muted-foreground">Letzter Scan wurde nach Discord gesendet.</p>
              ) : report?.discord.skippedReason ? (
                <p className="text-sm text-muted-foreground">{report.discord.skippedReason}</p>
              ) : null}
              {report?.discord.error ? (
                <p className="text-sm text-destructive">{report.discord.error}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={testDiscord} disabled={testingDiscord || !status?.discord.configured}>
                  {testingDiscord ? <Loader2 className="animate-spin" /> : null}
                  Test senden
                </Button>
              </div>

              {!status?.discord.envLocked ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="webhook">
                    Discord Incoming Webhook (optional, ohne Hermes-Bot)
                  </label>
                  <Input
                    id="webhook"
                    type="password"
                    autoComplete="off"
                    placeholder="https://discord.com/api/webhooks/…"
                    value={webhook}
                    onChange={(e) => setWebhook(e.target.value)}
                  />
                  <Button onClick={saveWebhook} disabled={savingWebhook || !webhook.trim()}>
                    {savingWebhook ? <Loader2 className="animate-spin" /> : null}
                    Speichern
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Discord kommt aus der Umgebung (Hermes{" "}
                  <code>DISCORD_BOT_TOKEN</code> / <code>DISCORD_ALLOWED_USERS</code>
                  ) und ist in der Oberfläche gesperrt.
                </p>
              )}
            </CardContent>
          </Card>
        ) : null}

        {tab === "vertrag" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Aktueller Tarif</CardTitle>
                <CardDescription>
                  Lieferant ist enercity, Vertrag bis 31.12.2026. Für die Ersparnis
                  gegen euren Ist-Preis fehlen Arbeits- und Grundpreis von der letzten Rechnung.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="text-sm font-medium" htmlFor="provider">Anbieter</label>
                <Input id="provider" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="enercity AG" />
                <label className="text-sm font-medium" htmlFor="ap">Arbeitspreis ct/kWh</label>
                <Input id="ap" value={workingPrice} onChange={(e) => setWorkingPrice(e.target.value)} placeholder="z. B. 34,53" />
                <label className="text-sm font-medium" htmlFor="gp">Grundpreis €/Jahr</label>
                <Input id="gp" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="z. B. 183,64" />
                <Button onClick={saveCurrentTariff} disabled={savingHouse}>
                  {savingHouse ? <Loader2 className="animate-spin" /> : null}
                  Speichern
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Was noch fehlt</CardTitle>
                <CardDescription>
                  Für eine belastbare Empfehlung, kein Blocker für den ersten Bericht.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(report?.missingInfo ?? [
                  "Aktueller Anbieter",
                  "Arbeits- und Grundpreis",
                  "Kündigungstermin",
                  "Wärmepumpe / Wallbox / Smart Meter",
                ]).map((item) => (
                  <div key={item} className="flex gap-2 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-lg border border-border/80 px-3 py-2">
                  <span className="text-sm">Ökostrom bevorzugen</span>
                  <Switch
                    checked={Boolean(household?.preferGreen)}
                    onCheckedChange={async (checked) => {
                      await fetch("/api/household", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ preferGreen: checked }),
                      });
                      await load();
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === "verlauf" ? (
          <Card>
            <CardHeader>
              <CardTitle>Scan-Verlauf</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reports.length === 0 ? (
                <p className="text-muted-foreground">Noch leer.</p>
              ) : (
                reports.slice(0, 12).map((item) => (
                  <div key={item.id} className="flex flex-col gap-1 rounded-lg border border-border/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium">{when(item.createdAt)}</div>
                      <div className="text-sm text-muted-foreground">{item.recommendation.headline}</div>
                    </div>
                    <Badge variant={item.discord.posted ? "secondary" : "outline"}>
                      {item.discord.posted ? "Discord" : "lokal"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
