import { redirect } from 'next/navigation'

export default async function Home() {
  // Let client-side routing handle /welcome (for magic link redirects)
  // For all other users, redirect to login
  redirect('/login')
}