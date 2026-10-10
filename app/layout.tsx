import './globals.css';

export const metadata = {
  title: 'Aangan Enquiries',
  description: 'Every phone enquiry to Aangan Studio answered day or night, qualified against Nikhil’s rules, and handed to a designer with everything already asked.',
};
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
