import { notFound } from "next/navigation";
import ImportClients from "@/app/clients/import/ImportClients";

/** Development-only preview of the import screen (404 in production). */
export default function DevImport() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ImportClients existing={[{ phone: null, email: "dee@example.com" }]} />;
}
