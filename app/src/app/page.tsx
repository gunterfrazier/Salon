import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">SalonOS</h1>
      <p className="text-muted mt-1">Working title. Early build.</p>
      <ul className="mt-6 list-disc pl-5">
        <li><Link className="underline" href="/legend">Color chart</Link></li>
        <li><Link className="underline" href="/settings/payments">Settings › Payments</Link></li>
      </ul>
    </main>
  );
}
