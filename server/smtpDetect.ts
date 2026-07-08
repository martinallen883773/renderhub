import dns from "dns/promises";
import net from "net";
import nodemailer from "nodemailer";

export interface SmtpCandidate {
  host: string;
  port: number;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true;
    if (p[0] === 169 && p[1] === 254) return true;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80")) return true;
    const mapped = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return false;
}

// Guard against SSRF: refuse to probe localhost / internal / private network targets.
async function isSafeHost(host: string): Promise<boolean> {
  host = host.trim().toLowerCase();
  if (!host) return false;
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

// Well-known consumer/ISP providers mapped to their SMTP submission servers.
const KNOWN_PROVIDERS: Record<string, SmtpCandidate> = {
  "gmail.com": { host: "smtp.gmail.com", port: 587 },
  "googlemail.com": { host: "smtp.gmail.com", port: 587 },
  "yahoo.com": { host: "smtp.mail.yahoo.com", port: 587 },
  "ymail.com": { host: "smtp.mail.yahoo.com", port: 587 },
  "rocketmail.com": { host: "smtp.mail.yahoo.com", port: 587 },
  "outlook.com": { host: "smtp-mail.outlook.com", port: 587 },
  "hotmail.com": { host: "smtp-mail.outlook.com", port: 587 },
  "live.com": { host: "smtp-mail.outlook.com", port: 587 },
  "msn.com": { host: "smtp-mail.outlook.com", port: 587 },
  "aol.com": { host: "smtp.aol.com", port: 587 },
  "aim.com": { host: "smtp.aol.com", port: 587 },
  "comcast.net": { host: "smtp.comcast.net", port: 587 },
  "optonline.net": { host: "mail.optonline.net", port: 587 },
  "optonline.com": { host: "mail.optonline.net", port: 587 },
  "optimum.net": { host: "mail.optimum.net", port: 587 },
  "centurylink.net": { host: "smtp.centurylink.net", port: 587 },
  "embarqmail.com": { host: "smtp.centurylink.net", port: 587 },
  "earthlink.net": { host: "smtpauth.earthlink.net", port: 587 },
  "verizon.net": { host: "smtp.verizon.net", port: 587 },
  "att.net": { host: "smtp.mail.att.net", port: 465 },
  "sbcglobal.net": { host: "smtp.mail.att.net", port: 465 },
  "bellsouth.net": { host: "smtp.mail.att.net", port: 465 },
  "icloud.com": { host: "smtp.mail.me.com", port: 587 },
  "me.com": { host: "smtp.mail.me.com", port: 587 },
  "mac.com": { host: "smtp.mail.me.com", port: 587 },
  "zoho.com": { host: "smtp.zoho.com", port: 587 },
  "gmx.com": { host: "mail.gmx.com", port: 587 },
  "gmx.net": { host: "mail.gmx.net", port: 587 },
  "mail.com": { host: "smtp.mail.com", port: 587 },
  "yandex.com": { host: "smtp.yandex.com", port: 465 },
  "cox.net": { host: "smtp.cox.net", port: 587 },
  "charter.net": { host: "mail.charter.net", port: 587 },
  "spectrum.net": { host: "mail.twc.com", port: 587 },
  "roadrunner.com": { host: "mail.twc.com", port: 587 },
  "frontier.com": { host: "smtp.frontier.com", port: 587 },
  "windstream.net": { host: "smtp.windstream.net", port: 587 },
  "juno.com": { host: "smtp.juno.com", port: 587 },
  "netzero.net": { host: "smtp.netzero.net", port: 587 },
};

// Map a domain's MX target substring to the correct submission host.
const MX_PROVIDER_MAP: { match: string; host: string; port: number }[] = [
  { match: "google", host: "smtp.gmail.com", port: 587 },
  { match: "outlook", host: "smtp.office365.com", port: 587 },
  { match: "office365", host: "smtp.office365.com", port: 587 },
  { match: "protection.outlook", host: "smtp.office365.com", port: 587 },
  { match: "zoho", host: "smtp.zoho.com", port: 587 },
  { match: "secureserver.net", host: "smtpout.secureserver.net", port: 587 },
  { match: "yandex", host: "smtp.yandex.com", port: 465 },
  { match: "yahoodns", host: "smtp.mail.yahoo.com", port: 587 },
];

function addCandidate(list: SmtpCandidate[], seen: Set<string>, host: string, port: number) {
  host = host.trim().toLowerCase();
  if (!host) return;
  const key = `${host}:${port}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({ host, port });
}

async function fetchAutoconfig(domain: string): Promise<SmtpCandidate | null> {
  const urls = [
    `https://autoconfig.thunderbird.net/v1.1/${domain}`,
    `https://autoconfig.${domain}/mail/config-v1.1.xml?emailaddress=user@${domain}`,
  ];
  for (const url of urls) {
    try {
      const targetHost = new URL(url).hostname;
      if (!(await isSafeHost(targetHost))) continue;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const xml = await resp.text();
      const block = xml.match(/<outgoingServer[^>]*>[\s\S]*?<\/outgoingServer>/i)?.[0];
      if (!block) continue;
      const host = block.match(/<hostname>\s*([^<]+?)\s*<\/hostname>/i)?.[1];
      const port = block.match(/<port>\s*(\d+)\s*<\/port>/i)?.[1];
      if (host && port) {
        return { host: host.trim(), port: parseInt(port, 10) };
      }
    } catch {
      // ignore and try next URL
    }
  }
  return null;
}

// Build an ordered list of candidate SMTP servers for an email domain.
export async function detectCandidates(domain: string): Promise<SmtpCandidate[]> {
  domain = domain.trim().toLowerCase();
  const candidates: SmtpCandidate[] = [];
  const seen = new Set<string>();

  if (KNOWN_PROVIDERS[domain]) {
    const p = KNOWN_PROVIDERS[domain];
    addCandidate(candidates, seen, p.host, p.port);
  }

  const auto = await fetchAutoconfig(domain);
  if (auto) {
    addCandidate(candidates, seen, auto.host, auto.port);
  }

  try {
    const mx = await dns.resolveMx(domain);
    const mxHosts = mx
      .sort((a, b) => a.priority - b.priority)
      .map((m) => m.exchange.toLowerCase());
    for (const entry of MX_PROVIDER_MAP) {
      if (mxHosts.some((h) => h.includes(entry.match))) {
        addCandidate(candidates, seen, entry.host, entry.port);
      }
    }
  } catch {
    // no MX records or lookup failed
  }

  for (const prefix of ["mail", "smtp", "smtp.mail", "secure", "mx"]) {
    addCandidate(candidates, seen, `${prefix}.${domain}`, 587);
  }
  addCandidate(candidates, seen, domain, 587);
  addCandidate(candidates, seen, `mail.${domain}`, 465);
  addCandidate(candidates, seen, `smtp.${domain}`, 465);
  addCandidate(candidates, seen, `mail.${domain}`, 25);

  return candidates;
}

// Attempt to verify a candidate with the given credentials.
export async function verifyCandidate(
  candidate: SmtpCandidate,
  user: string,
  pass: string,
  timeout = 8000,
): Promise<boolean> {
  if (!(await isSafeHost(candidate.host))) return false;
  const transporter = nodemailer.createTransport({
    host: candidate.host,
    port: candidate.port,
    secure: candidate.port === 465,
    requireTLS: candidate.port !== 465,
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    tls: { rejectUnauthorized: false },
    auth: { user, pass },
  } as any);
  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  } finally {
    try {
      transporter.close();
    } catch {
      // ignore
    }
  }
}

export interface DetectResult {
  email: string;
  success: boolean;
  verified: boolean;
  host: string | null;
  port: number | null;
  message: string;
}

// Detect (and optionally verify) the working SMTP server for one webmail account.
export async function detectAccount(
  email: string,
  password: string,
  verify: boolean,
): Promise<DetectResult> {
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) {
    return { email, success: false, verified: false, host: null, port: null, message: "Invalid email address" };
  }

  let candidates: SmtpCandidate[];
  try {
    candidates = await detectCandidates(domain);
  } catch (err: any) {
    return { email, success: false, verified: false, host: null, port: null, message: `Detection failed: ${err.message}` };
  }

  if (candidates.length === 0) {
    return { email, success: false, verified: false, host: null, port: null, message: "No SMTP server could be determined for this domain" };
  }

  if (!verify) {
    const best = candidates[0];
    return { email, success: true, verified: false, host: best.host, port: best.port, message: "Detected (not verified)" };
  }

  for (const candidate of candidates) {
    const ok = await verifyCandidate(candidate, email, password);
    if (ok) {
      return { email, success: true, verified: true, host: candidate.host, port: candidate.port, message: "Verified successfully" };
    }
  }

  const best = candidates[0];
  return {
    email,
    success: false,
    verified: false,
    host: best.host,
    port: best.port,
    message: "Could not authenticate with any detected server",
  };
}
