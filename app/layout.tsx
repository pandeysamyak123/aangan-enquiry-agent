export const metadata = { title: 'Aangan Enquiries', description: 'Phone enquiry agent for Aangan Studio' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', background: '#f7f5f1', color: '#1f2421' }}>{children}</body>
    </html>
  );
}
