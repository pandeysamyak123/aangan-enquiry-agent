'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/dashboard', label: 'Home', ico: '◧', c: 'var(--o-dashboard)' },
  { href: '/dashboard/calls', label: 'Calls', ico: '☎', c: 'var(--o-call)' },
  { href: '/dashboard/leads', label: 'Leads', ico: '★', c: 'var(--o-lead)' },
  { href: '/dashboard/emails', label: 'Emails', ico: '✉', c: 'var(--o-email)' },
  { href: '/dashboard/designers', label: 'Designers', ico: '☺', c: 'var(--o-contact)' },
  { href: '/dashboard/settings', label: 'Setup', ico: '⚙', c: 'var(--o-setup)' },
];

export default function SideNav({ overdue }: { overdue: number }) {
  const path = usePathname();
  return (
    <>
      <div className="side-label">Aangan Sales</div>
      {ITEMS.map((i) => {
        const active = i.href === '/dashboard' ? path === '/dashboard' : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className="side-link" aria-current={active ? 'page' : undefined}>
            <span className="obj-icon sm" style={{ background: i.c }} aria-hidden>{i.ico}</span>{i.label}
            {i.href === '/dashboard/leads' && overdue > 0 && <span className="count" title={`${overdue} overdue`}>{overdue}</span>}
          </Link>
        );
      })}
    </>
  );
}
