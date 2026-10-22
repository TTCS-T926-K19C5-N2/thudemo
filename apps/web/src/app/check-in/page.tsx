import { redirect } from "next/navigation";

// The operative scanner owns selection, camera, admission and offline state.
export default function CheckInPage() {
  redirect("/scanner");
}
