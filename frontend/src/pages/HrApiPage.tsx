import { CirclePlus } from "lucide-react";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export default function HrApiPage() {
  useDocumentTitle("NOVA — HR API");

  return (
    <div className="min-h-screen bg-[#f7f5ef] px-6 py-14 text-[#111111]">
      <div className="mx-auto max-w-4xl">
        <Link to="/" className="inline-flex items-center gap-2 text-base font-black tracking-tight text-[#111111]">
          <CirclePlus className="h-5 w-5 text-[#F5C518]" strokeWidth={2.2} />
          <span>NOVA</span>
        </Link>

        <div className="mt-8 border-[3px] border-black bg-white p-8 shadow-[8px_8px_0_#000] sm:p-10">
          <h1 className="text-3xl font-black">HR API Overview</h1>
          <p className="mt-4 text-base leading-relaxed text-[#374151]">
            NOVA exposes role-scoped endpoints for workforce analytics, explainable risk scoring, interventions,
            and auditability. API access is protected through JWT auth and RBAC.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="border-2 border-black bg-[#f7f5ef] p-4">
              <h2 className="text-sm font-black tracking-[0.14em]">Core Domains</h2>
              <ul className="mt-3 space-y-2 text-sm text-[#4b5563]">
                <li>Auth and RBAC</li>
                <li>Org health and dashboards</li>
                <li>Anomalies and interventions</li>
                <li>Feedback sessions and appraisals</li>
              </ul>
            </div>
            <div className="border-2 border-black bg-[#f7f5ef] p-4">
              <h2 className="text-sm font-black tracking-[0.14em]">Privacy and Safety</h2>
              <ul className="mt-3 space-y-2 text-sm text-[#4b5563]">
                <li>Explainable ML outputs</li>
                <li>k-anonymity controls</li>
                <li>Audit logging for sensitive access</li>
                <li>Structured fallbacks on AI failure</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="http://127.0.0.1:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center border-2 border-black bg-[#F5C518] px-6 py-3 text-xs font-black tracking-[0.16em] text-black"
            >
              OPEN BACKEND DOCS
            </a>
            <Link
              to="/login"
              className="inline-flex items-center justify-center border-2 border-black bg-white px-6 py-3 text-xs font-black tracking-[0.16em] text-black"
            >
              SIGN IN
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
