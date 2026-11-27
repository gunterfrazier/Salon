/** A simple branded HTML email around a plain-text message (links made clickable). Works in Gmail, Outlook and Apple Mail. */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function linkify(line: string): string {
  return esc(line).replace(/https:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:#3f6a84;text-decoration:underline">${u}</a>`);
}

export function brandedEmail(o: { text: string; salon: string | null; site?: string }): string {
  const site = o.site ?? "https://chairvana.app";
  const paras = o.text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${p.split("\n").map(linkify).join("<br>")}</p>`)
    .join("");
  const from = o.salon ? esc(o.salon) : "Chairvana";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${from}</title></head>
<body style="margin:0;padding:0;background:#f6f3ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2dbcf;border-radius:14px">
<tr><td style="background:#0f0f11;border-radius:14px 14px 0 0;padding:18px 24px">
<p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#f5efe6">${from}</p>
</td></tr>
<tr><td style="padding:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#171513">${paras}</td></tr>
<tr><td style="padding:0 24px 22px 24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#5c5750">
${o.salon ? `Sent for ${from} by ` : ""}<a href="${site}" style="color:#5c5750">Chairvana</a> &middot; <span style="font-style:italic">Where your schedule finds its flow.</span>
</td></tr></table>
</td></tr></table></body></html>`;
}
