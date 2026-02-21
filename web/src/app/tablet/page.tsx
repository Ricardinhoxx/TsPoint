import { Suspense } from "react";
import TabletClient from "./TabletClient";

export default function TabletPage() {
  return (
    <Suspense fallback={<div className="containerWide"><div className="card">Carregando...</div></div>}>
      <TabletClient />
    </Suspense>
  );
}
