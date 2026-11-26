"use client";

export default function PrintButton() {
  return (
    <>
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-black px-4 py-2 font-semibold text-white">Print</button>
      <button type="button" onClick={() => history.back()} className="rounded-lg border border-black px-4 py-2">Back</button>
    </>
  );
}
