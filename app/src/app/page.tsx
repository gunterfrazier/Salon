import { redirect } from "next/navigation";

/** chairvana.app: the marketing page will live here. For now, open the app. */
export default function Home() {
  redirect("/app");
}
