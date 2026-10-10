'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/dashboard', label: 'Overview', ico: '◧' },
  { href: '/dashboard/calls', label: 'Calls', ico: '☎' },
  { href: '/dashboard/leads', label: 'Leads', ico: '◎' },
  { href: '/dashboard/emails', label: 'Emails', ico: '✉' },
  { href: '/dashboard/designers', label: 'Designers', ico: '✎' },
  { href: '/dashboard/settings', label: 'Settings', ico: '⚙' },
];

export default function SideNav({ overdue }: { overdue: number }) {
  const path = usePathname();
  return (
    <>
      {ITEMS.map((i) => {
        const active = i.href === '/dashboard' ? path === '/dashboard' : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className="side-link" aria-current={active ? 'page' : undefined}>
            <span className="ico" aria-hidden>{i.ico}</span>{i.label}
            {i.href === '/dashboard/leads' && overdue > 0 && <span className="count" title={`${overdue} overdue`}>{overdue}</span>}
          </Link>
        );
      })}
    </>
  );
}
