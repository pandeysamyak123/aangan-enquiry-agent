import { redirect } from 'next/navigation';

// The CRM is open (no login). Old /login links go straight to the dashboard.
export default function Login() {
  redirect('/dashboard');
}
