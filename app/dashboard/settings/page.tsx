import { db } from '@/lib/db.ts';
import { PageHead, inr } from '../ui.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings · Aangan CRM' };

const Check = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
  <tr>
    <td><b>{label}</b><div className="muted" style={{ fontSize: 13 }}>{hint}</div></td>
    <td>{ok ? <span className="status" style={{ color: 'var(--good-text)' }}>✓ Connected</span> : <span className="status" style={{ color: 'var(--serious)' }}>○ Not set up</span>}</td>
  </tr>
);

export default async function Settings() {
  const e = process.env;
  const { data: costRows } = await db().from('calls').select('cost_paise, duration_sec');
  const totalInr = (costRows ?? []).reduce((s, c) => s + (c.cost_paise ?? 0), 0) / 100;
  const totalMin = (costRows ?? []).reduce((s, c) => s + Math.ceil((c.duration_sec ?? 0) / 60), 0);
  const rate = Number(e.VAANI_PAISE_PER_MIN ?? 240) / 100;

  return (
    <>
      <PageHead eyebrow="How the system is wired" title="Settings" />
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Integrations</h2>
          <table className="data"><tbody>
            <Check ok={!!e.VAANI_WEBHOOK_SECRET && !!e.VAANI_API_KEY} label="Vaani AI (voice agent)" hint={`Agent ${e.VAANI_AGENT_ID ? e.VAANI_AGENT_ID.slice(0, 8) + '…' : 'not set'} · webhook + call details API`} />
            <Check ok={!!e.SUPABASE_SERVICE_ROLE_KEY} label="Supabase (database)" hint="Calls, leads, emails, designers" />
            <Check ok={!!e.RESEND_API_KEY} label="Resend (email)" hint={`From ${e.EMAIL_FROM ?? '—'}`} />
            <Check ok={!!e.HUBSPOT_TOKEN && !!e.HUBSPOT_PIPELINE_ID} label="HubSpot (CRM sync)" hint="Contacts, deals in “Aangan Enquiries”, call logs, tasks" />
            <Check ok={!!e.CALENDLY_TOKEN} label="Calendly (booking links)" hint="Single-use booking link for qualified callers" />
            <Check ok={!!e.CRON_SECRET} label="Scheduled jobs" hint="Overdue reminders, retries, 9pm digest" />
          </tbody></table>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Rules Meera follows</h2>
          <dl className="kv">
            <dt>Studio hours</dt><dd>Mon–Sat, 10am–7pm IST</dd>
            <dt>Qualified, in hours</dt><dd>Designer calls within 1 hour</dd>
            <dt>Qualified, after hours</dt><dd>Designer calls by 11am next working day</dd>
            <dt>Existing-client issue</dt><dd>Senior callback within 15 min (by 10:30am if after hours)</dd>
            <dt>Dropped / missed</dt><dd>Call back within 30 min (by 10:30am if after hours)</dd>
            <dt>Pricing</dt><dd><b>Never quoted.</b> Deflected to the consultation; asking never disqualifies.</dd>
            <dt>Timeline floor</dt><dd>Under ~8 weeks → nurture with a later start</dd>
          </dl>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Cost</h2>
          <dl className="kv">
            <dt>Voice rate</dt><dd>{inr(rate, 2)} per minute (billed per started minute)</dd>
            <dt>Minutes used (all time)</dt><dd>{totalMin}</dd>
            <dt>Total spent (all time)</dt><dd><b>{inr(totalInr, 2)}</b></dd>
            <dt>Email, database, hosting</dt><dd>₹0 on free tiers at this volume</dd>
          </dl>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Links</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            <li><a href="https://app.vaanivoice.ai" target="_blank" rel="noreferrer">Vaani AI dashboard ↗</a> (agent, test calls, phone numbers)</li>
            <li><a href="https://app.hubspot.com" target="_blank" rel="noreferrer">HubSpot ↗</a></li>
            <li><a href="https://resend.com/emails" target="_blank" rel="noreferrer">Resend email log ↗</a></li>
            <li><a href="https://github.com/pandeysamyak123/aangan-enquiry-agent" target="_blank" rel="noreferrer">Source code ↗</a></li>
            <li><a href="/">Public front page</a></li>
          </ul>
        </section>
      </div>
    </>
  );
}
