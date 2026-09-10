# Stromtarif-Agent

Privater Agent für den Haushalt am **Ippesheimer Weg 24, 55545 Bad Kreuznach**. Er holt öffentlich verfügbare Strompreisdaten, rechnet sie auf den Netzbezug von **14.500 kWh** (von 22.000 kWh Gesamtverbrauch) um und schickt regelmäßig einen Bericht nach Discord.

Repo: [github.com/frabartolo/stromtarif_sammeln](https://github.com/frabartolo/stromtarif_sammeln)

Verbrauch: Haushalt + Wärmepumpe + Wallbox (2 E-Autos), PV ohne Speicher, noch kein Smart Meter. Lieferant **enercity**, Vertrag bis **31.12.2026**.

## Auf Kiara deployen

Das Dashboard und der Cron laufen in Docker auf Port **43145**. Discord nutzt denselben Hermes-Bot wie auf Kiara (`/home/kiara/.hermes/.env`: `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USERS`). Ohne `DISCORD_HOME_CHANNEL` geht der Bericht per Direktnachricht an die erlaubten Nutzer.

```bash
git clone https://github.com/frabartolo/stromtarif_sammeln.git ~/stromtarif_sammeln
cd ~/stromtarif_sammeln
chmod +x deploy/on-kiara.sh deploy/install-on-kiara.sh
./deploy/on-kiara.sh
```

Spätere Updates:

```bash
cd ~/stromtarif_sammeln && ./deploy/install-on-kiara.sh
```

Nach `./deploy/on-kiara.sh` ist das Dashboard im LAN erreichbar:

- [http://kiara:43145](http://kiara:43145) – wenn der Hostname `kiara` im Fritz-DNS steht
- sonst [http://kiara.fritz.box:43145](http://kiara.fritz.box:43145) oder [http://192.168.5.43:43145](http://192.168.5.43:43145)

Die Seite zeigt immer den **letzten gespeicherten Scan**. Neu geholt wird:

- **Montag 07:00** Europe/Berlin: Scan und Discord-Bericht
- **Dienstag–Sonntag 07:15**: stiller Scan; Discord nur, wenn ein Festpreis mindestens 50 € günstiger ist

Im Browser lädt sie nicht von allein neu – einmal öffnen oder aktualisieren genügt. Manuell geht „Jetzt prüfen“ auf der Seite.

Optional systemd (nach dem ersten Start):

```bash
sudo cp deploy/stromtarif-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stromtarif-agent.service
```

## Discord (Hermes auf Kiara)

In `/home/kiara/.hermes/.env` stehen:

```bash
DISCORD_BOT_TOKEN=...
DISCORD_ALLOWED_USERS=...   # Komma-getrennte Discord-User-IDs
# optional:
# DISCORD_HOME_CHANNEL=...  # sonst DM an ALLOWED_USERS
```

`./deploy/on-kiara.sh` kopiert genau diese Werte in die Container-Umgebung. Die URL eines Incoming Webhooks (`DISCORD_WEBHOOK_URL`) bleibt ein Fallback, wird auf Kiara aber nicht mehr benötigt.

## Was der Agent tut

- Liest die **Grundversorgung der Stadtwerke Bad Kreuznach** (Preisblatt ab 01.01.2026).
- Holt Neukunden- und Ökostromtarife für Bad Kreuznach bei StromAuskunft und rechnet auf 14.500 kWh hoch.
- Lässt dynamische Börsentarife weg, solange kein intelligentes Messsystem (iMSys) da ist.
- Erinnert an das Wechselfenster vor dem 31.12.2026 (Lieferbeginn 1.1.2027, Anstoß ca. Mitte November).
- Schreibt montags 07:00 Europe/Berlin nach Discord; an anderen Tagen 07:15 nur bei spürbarer Verbesserung.

## Lokal starten

```bash
git clone https://github.com/frabartolo/stromtarif_sammeln.git
cd stromtarif_sammeln
cp .env.example .env
npm install
npm run dev
```

Dashboard: [http://127.0.0.1:43145](http://127.0.0.1:43145)

## Haushalt

| Feld | Wert |
| --- | --- |
| Adresse | Ippesheimer Weg 24, 55545 Bad Kreuznach |
| Gesamtverbrauch | 22.000 kWh (Haus, WP, Wallbox) |
| Netzbezug | 14.500 kWh (Spanne 14.000–15.000) |
| PV / Speicher | PV ja, Speicher nein |
| Smart Meter | noch nicht |
| Lieferant | enercity, Ende 31.12.2026 |

Für die Ersparnis gegen den **Ist-Preis** fehlt noch Arbeits- und Grundpreis der letzten enercity-Rechnung (Tab **Euer Vertrag**).

Das GitHub-Repo ist öffentlich und enthält die Wohnadresse. Wenn das nicht gewollt ist: auf GitHub auf **Private** stellen.

## Hinweise

- Vor dem Wechsel Arbeitspreis, Grundpreis, Bonusdeckel und Preisgarantie mit **14.500 kWh** in Verivox/Check24 gegenprüfen.
- Dynamische Tarife ohne Smart Meter rechnen über ein Standardlastprofil – nicht über euer Nachtladen der zwei Autos. Deshalb sind sie im Vergleich ausgeblendet, bis ein iMSys da ist.
- Wärmepumpe und Wallbox sind steuerbare Verbraucher (§ 14a EnWG); ob das schon beim Netzbetreiber gemeldet ist, steht noch offen.
