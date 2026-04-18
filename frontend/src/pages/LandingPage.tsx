import {
  Activity,
  ArrowRight,
  Briefcase,
  BrainCircuit,
  CirclePlus,
  Info,
  Network,
  Shield,
  TrendingDown,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type RevealVariant = "fade-up" | "scale-in";

type FeatureCard = {
  title: string;
  description: string;
  icon: JSX.Element;
};

const featureCards: FeatureCard[] = [
  {
    title: "Burnout Detection",
    description: "ML scoring across 10 behavioral signals",
    icon: <Activity className="h-7 w-7" />,
  },
  {
    title: "Attrition Prediction",
    description: "6-month flight risk forecasting per employee",
    icon: <TrendingDown className="h-7 w-7" />,
  },
  {
    title: "Sentiment Intelligence",
    description: "NLP analysis with sarcasm detection",
    icon: <BrainCircuit className="h-7 w-7" />,
  },
  {
    title: "Privacy Architecture",
    description: "k-anonymity, PII vaulting, full audit logs",
    icon: <Shield className="h-7 w-7" />,
  },
  {
    title: "Explainable AI",
    description: "SHAP-style score breakdowns, no black boxes",
    icon: <Info className="h-7 w-7" />,
  },
  {
    title: "Intervention Engine",
    description: "ROI-ranked recommended HR actions",
    icon: <Zap className="h-7 w-7" />,
  },
  {
    title: "Org Network Graph",
    description: "Burnout propagation mapping across teams",
    icon: <Network className="h-7 w-7" />,
  },
  {
    title: "Talent Pipeline",
    description: "AI task matching + auto-generated job postings",
    icon: <Briefcase className="h-7 w-7" />,
  },
];

const dotPositions = [
  { left: "8%", top: "14%", size: "3px", delay: "0s", duration: "8s", opacity: 0.16 },
  { left: "16%", top: "42%", size: "2px", delay: "1s", duration: "11s", opacity: 0.12 },
  { left: "21%", top: "72%", size: "4px", delay: "2s", duration: "10s", opacity: 0.24 },
  { left: "27%", top: "28%", size: "3px", delay: "0.5s", duration: "9s", opacity: 0.15 },
  { left: "33%", top: "54%", size: "2px", delay: "1.3s", duration: "12s", opacity: 0.18 },
  { left: "39%", top: "18%", size: "3px", delay: "0.8s", duration: "9s", opacity: 0.21 },
  { left: "46%", top: "66%", size: "2px", delay: "1.8s", duration: "10s", opacity: 0.14 },
  { left: "52%", top: "34%", size: "4px", delay: "2.1s", duration: "11s", opacity: 0.28 },
  { left: "58%", top: "76%", size: "3px", delay: "0.6s", duration: "10s", opacity: 0.2 },
  { left: "63%", top: "24%", size: "2px", delay: "1.5s", duration: "9s", opacity: 0.11 },
  { left: "69%", top: "48%", size: "3px", delay: "0.4s", duration: "8s", opacity: 0.23 },
  { left: "74%", top: "14%", size: "2px", delay: "2.4s", duration: "12s", opacity: 0.16 },
  { left: "79%", top: "68%", size: "4px", delay: "1.7s", duration: "10s", opacity: 0.2 },
  { left: "84%", top: "36%", size: "3px", delay: "0.9s", duration: "11s", opacity: 0.14 },
  { left: "88%", top: "56%", size: "2px", delay: "1.1s", duration: "9s", opacity: 0.18 },
  { left: "92%", top: "22%", size: "3px", delay: "2.7s", duration: "10s", opacity: 0.13 },
  { left: "12%", top: "86%", size: "2px", delay: "1.6s", duration: "11s", opacity: 0.15 },
  { left: "41%", top: "84%", size: "3px", delay: "2.2s", duration: "12s", opacity: 0.17 },
  { left: "67%", top: "88%", size: "2px", delay: "0.3s", duration: "8s", opacity: 0.14 },
];

function useRevealOnScroll() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("nova-reveal-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function revealClass(variant: RevealVariant, delayMs = 0) {
  return `nova-reveal nova-reveal-${variant}` + (delayMs > 0 ? ` [transition-delay:${delayMs}ms]` : "");
}

function smoothScrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: "smooth" });
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [isScrolledPastHero, setIsScrolledPastHero] = useState(false);

  useRevealOnScroll();

  useEffect(() => {
    const onScroll = () => {
      const platform = document.getElementById("platform");
      if (!platform) return;
      const triggerY = platform.offsetHeight - 140;
      setIsScrolledPastHero(window.scrollY > triggerY);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.replace("#", "");
    window.setTimeout(() => smoothScrollToSection(id), 80);
  }, []);

  const navTextClass = isScrolledPastHero ? "text-[#1a1a1a]" : "text-white";

  const navItems = useMemo(
    () => [
      { label: "PLATFORM", id: "platform" },
      { label: "FEATURES", id: "features" },
      { label: "VIEWS", id: "views" },
      { label: "ABOUT", id: "about" },
    ],
    [],
  );

  return (
    <div className="bg-[#0b0b0b] text-white" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        .nova-reveal {
          opacity: 0;
          transition: opacity 0.5s ease-out, transform 0.5s ease-out;
          will-change: opacity, transform;
        }
        .nova-reveal-fade-up {
          transform: translateY(30px);
        }
        .nova-reveal-scale-in {
          transform: scale(0.95);
        }
        .nova-reveal-visible {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .nova-hero-gradient {
          background: radial-gradient(circle at 35% 25%, #0a0f1a 0%, #050505 42%, #000000 100%);
          animation: novaPulse 4s ease-in-out infinite alternate;
        }
        .nova-data-dot {
          position: absolute;
          border-radius: 9999px;
          background: #ffffff;
          animation-name: novaDrift;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          pointer-events: none;
        }
        @keyframes novaPulse {
          from { filter: brightness(0.94); }
          to { filter: brightness(1.06); }
        }
        @keyframes novaDrift {
          0% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(0, -8px, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }
      `}</style>

      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          isScrolledPastHero
            ? "bg-white border-b border-[#e5e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-20 max-w-[1320px] items-center justify-between px-6 lg:px-10">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={`flex items-center gap-2 text-xl font-extrabold tracking-tight ${navTextClass}`}
          >
            <CirclePlus className="h-6 w-6 text-[#F5C518]" strokeWidth={2.3} />
            <span>NOVA</span>
          </button>

          <nav className="hidden items-center gap-7 md:flex">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => smoothScrollToSection(item.id)}
                className={`text-[0.68rem] font-bold tracking-[0.22em] transition-colors hover:text-[#F5C518] ${navTextClass}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => navigate("/login")}
            className={`text-[0.68rem] font-bold tracking-[0.22em] transition-colors hover:text-[#F5C518] ${navTextClass}`}
          >
            SIGN IN
          </button>
        </div>
      </header>

      <section id="platform" className="relative flex min-h-screen flex-col overflow-hidden border-b border-[#1f2937] nova-hero-gradient">
        <div className="absolute inset-0">
          {dotPositions.map((dot, index) => (
            <span
              key={`${dot.left}-${dot.top}-${index}`}
              className="nova-data-dot"
              style={{
                left: dot.left,
                top: dot.top,
                width: dot.size,
                height: dot.size,
                opacity: dot.opacity,
                animationDelay: dot.delay,
                animationDuration: dot.duration,
              }}
            />
          ))}
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[900px] flex-1 flex-col justify-center px-[5vw] pt-28 pb-20">
          <div data-reveal className={revealClass("fade-up")}>
            <h1
              className="font-black uppercase leading-[0.88] tracking-tight text-[#F5C518]"
              style={{ fontFamily: "Playfair Display, serif", fontSize: "clamp(2.8rem, 8vw, 6.4rem)" }}
            >
              THE WORKFORCE
              <br />
              INTELLIGENCE
              <br />
              MONOLITH.
            </h1>
          </div>

          <p
            data-reveal
            className={`${revealClass("fade-up", 90)} mt-8 max-w-[600px] text-[clamp(1.1rem,2.5vw,1.85rem)] font-medium leading-relaxed text-white/92`}
          >
            Detect burnout. Predict attrition. Act before it&apos;s too late.
          </p>

          <div data-reveal className={`${revealClass("fade-up", 180)} mt-10 flex flex-col gap-4 sm:flex-row`}>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="rounded-none border-2 border-[#F5C518] bg-[#F5C518] px-8 py-4 text-[0.72rem] font-extrabold tracking-[0.24em] text-[#1a1a1a] transition-transform hover:-translate-y-[2px]"
            >
              SIGN IN →
            </button>
            <button
              type="button"
              onClick={() => smoothScrollToSection("features")}
              className="rounded-none border-2 border-white bg-transparent px-8 py-4 text-[0.72rem] font-extrabold tracking-[0.22em] text-white transition-colors hover:bg-white hover:text-black"
            >
              EXPLORE FEATURES ↓
            </button>
          </div>
        </div>

        <div className="relative z-10 border-t border-white/20 py-5">
          <p className="px-5 text-center text-[0.62rem] font-semibold tracking-[0.22em] text-white/95 sm:text-[0.68rem]">
            AI-POWERED · EXPLAINABLE · PRIVACY-FIRST · BUILT FOR HR
          </p>
        </div>
      </section>

      <section id="features" className="border-b border-[#111827] bg-[#f7f5ef] py-24 text-[#111111] lg:py-32">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-start gap-14 px-6 lg:grid-cols-12 lg:px-10">
          <div className="lg:col-span-7">
            <h2
              data-reveal
              className={revealClass("fade-up")}
              style={{ fontFamily: "Playfair Display, serif", fontSize: "clamp(2.1rem, 4.9vw, 4.2rem)", lineHeight: 0.95, fontWeight: 900 }}
            >
              WORKFORCE METRICS.
              <br />
              <span className="mt-2 inline-block bg-black px-4 py-2 text-[#F5C518]">DEFINED.</span>
            </h2>

            <div className="mt-10 space-y-7 text-[#111111]">
              <div data-reveal className={revealClass("fade-up", 80)}>
                <p className="flex items-center gap-3 border-l-4 border-[#F5C518] pl-4 text-lg font-extrabold">
                  <ArrowRight className="h-5 w-5" />
                  AI-driven risk detection
                </p>
                <p className="mt-2 pl-12 text-sm font-medium leading-relaxed text-[#374151]">
                  Burnout, attrition, and disengagement signals detected before they escalate.
                </p>
              </div>
              <div data-reveal className={revealClass("fade-up", 150)}>
                <p className="flex items-center gap-3 border-l-4 border-[#F5C518] pl-4 text-lg font-extrabold">
                  <ArrowRight className="h-5 w-5" />
                  Explainable scoring (not black box)
                </p>
                <p className="mt-2 pl-12 text-sm font-medium leading-relaxed text-[#374151]">
                  Every score comes with a plain-English breakdown of contributing factors.
                </p>
              </div>
              <div data-reveal className={revealClass("fade-up", 220)}>
                <p className="flex items-center gap-3 border-l-4 border-[#F5C518] pl-4 text-lg font-extrabold">
                  <ArrowRight className="h-5 w-5" />
                  Real-time workforce monitoring
                </p>
                <p className="mt-2 pl-12 text-sm font-medium leading-relaxed text-[#374151]">
                  Continuous pulse on sentiment, performance, and collaboration health.
                </p>
              </div>
            </div>
          </div>

          <div data-reveal className={`${revealClass("scale-in", 110)} lg:col-span-5`}>
            <div className="w-full border-2 border-black bg-white p-7 shadow-[14px_14px_0_#F5C518]">
              <div className="mb-6 flex items-center justify-between border-b-2 border-black pb-4">
                <span className="inline-flex items-center gap-2 text-[0.65rem] font-black tracking-[0.18em] text-black">
                  <Activity className="h-3 w-3" />
                  SYSTEM OVERVIEW / 24
                </span>
                <div className="flex gap-1">
                  <span className="h-2 w-2 bg-black" />
                  <span className="h-2 w-2 bg-black" />
                  <span className="h-2 w-2 bg-[#F5C518]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border-2 border-black bg-[#f8f6f1] p-4">
                  <p className="text-[0.55rem] font-black tracking-[0.16em] text-[#6b7280]">BURNOUT SCORE</p>
                  <p className="mt-2 text-2xl font-black text-black">MONITORED</p>
                  <p className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">Continuous scoring</p>
                </div>
                <div className="border-2 border-black bg-[#F5C518] p-4">
                  <p className="text-[0.55rem] font-black tracking-[0.16em] text-black">ATTRITION RISK</p>
                  <p className="mt-2 text-2xl font-black text-black">PREDICTED</p>
                  <p className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-black/70">ML-powered forecasting</p>
                </div>
              </div>

              <div className="mt-4 border-2 border-black bg-[#f8f6f1] p-4">
                <p className="text-[0.55rem] font-black tracking-[0.16em] text-[#6b7280]">HEADCOUNT</p>
                <p className="mt-2 text-2xl font-black text-black">TRACKED</p>
                <p className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[#6b7280]">Full org coverage</p>
              </div>

              <div className="mt-5 h-16 border-t-2 border-black pt-4">
                <div className="flex h-full items-end justify-between gap-1">
                  {[40, 65, 30, 80, 50, 90, 45, 60, 20, 70].map((height, index) => (
                    <div
                      key={index}
                      className={`w-full ${index === 5 ? "bg-[#F5C518]" : "bg-black"}`}
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[10px] font-medium text-[#6b7280]">Illustrative org health distribution</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#374151] bg-[#1a1a1a] py-20" aria-label="Feature Grid">
        <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
          <h3
            data-reveal
            className={`${revealClass("fade-up")} mb-8 text-center text-[clamp(1.8rem,4vw,2.8rem)] font-black tracking-tight text-white`}
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            FEATURES
          </h3>
          <div className="grid grid-cols-1 border border-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {featureCards.map((feature, index) => (
              <article
                key={feature.title}
                data-reveal
                className={`${revealClass("fade-up", 40 * index)} border-b border-r border-white/10 p-7 transition-colors hover:bg-[#111827]`}
              >
                <div className="mb-4 text-[#F5C518]">{feature.icon}</div>
                <h4 className="text-lg font-extrabold text-white">{feature.title}</h4>
                <p className="mt-2 text-sm font-medium leading-relaxed text-white/75">{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="views" className="border-b border-[#374151] bg-[#0f172a] py-24 text-white lg:py-28">
        <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
          <h3
            data-reveal
            className={`${revealClass("fade-up")} text-center text-[clamp(2rem,4vw,3.2rem)] font-black tracking-tight text-[#F5C518]`}
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            BUILT FOR EVERY ROLE.
          </h3>
          <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {[
              { title: "C-SUITE VIEW", body: "Org-wide health at a glance" },
              { title: "HR MANAGER VIEW", body: "Deep analytics + interventions" },
              { title: "EMPLOYEE VIEW", body: "Your personal wellness dashboard" },
            ].map((card, idx) => (
              <div
                key={card.title}
                data-reveal
                className={`${revealClass("scale-in", 90 * idx)} border border-[#374151] bg-[#111827] p-7`}
              >
                <div className="mb-5 h-1 w-full bg-[#F5C518]" />
                <h4 className="text-sm font-black tracking-[0.18em] text-[#F5C518]">{card.title}</h4>
                <p className="mt-3 text-lg font-semibold text-white">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-black bg-[#f7f5ef] py-24 text-black lg:py-28">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-start gap-12 px-6 lg:grid-cols-12 lg:px-10">
          <div className="lg:col-span-7">
            <h2
              data-reveal
              className={revealClass("fade-up")}
              style={{ fontFamily: "Playfair Display, serif", fontSize: "clamp(2.3rem,4.5vw,3.7rem)", lineHeight: 1, fontWeight: 900 }}
            >
              Architecting Stability.
              <br />
              Engineering Trust.
            </h2>
            <div className="mt-7 space-y-5 text-lg font-medium leading-relaxed text-[#4a4a4a]">
              <p data-reveal className={revealClass("fade-up", 80)}>
                NOVA was forged to solve one of the most complex challenges of the modern enterprise: workforce volatility. By bridging behavioral data with transparent machine learning, we transform raw telemetry into structural insights.
              </p>
              <p data-reveal className={revealClass("fade-up", 150)}>
                We believe that AI in human resources must be inherently explainable. Our models are constructed not as black boxes, but as transparent, auditable intelligence layers serving the leaders who rely on them.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-5">
            {[
              { value: "100%", subtitle: "EXPLAINABLE DECISIONS", tone: "bg-white text-black border-black shadow-[6px_6px_0_#F5C518]" },
              { value: "3", subtitle: "INTEGRATED DATA SOURCES", tone: "bg-black text-[#F5C518] border-black shadow-[6px_6px_0_#F5C518]" },
              { value: "ZERO", subtitle: "OPAQUE AI DECISIONS", tone: "bg-[#F5C518] text-black border-black shadow-[6px_6px_0_#000]" },
              { value: "4", subtitle: "RBAC ACCESS LEVELS", tone: "bg-white text-black border-[#F5C518] shadow-[6px_6px_0_#F5C518]" },
            ].map((card, idx) => (
              <div
                key={card.subtitle}
                data-reveal
                className={`${revealClass("scale-in", 80 * idx)} border-[3px] p-7 text-center ${card.tone}`}
              >
                <p className="text-5xl font-black">{card.value}</p>
                <p className="mt-2 text-[0.65rem] font-black tracking-[0.14em]">{card.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="border-b border-[#374151] bg-[#f7f5ef] py-24 text-black lg:py-28">
        <div className="mx-auto max-w-[980px] px-6 text-center lg:px-10">
          <h3
            data-reveal
            className={`${revealClass("fade-up")} text-[clamp(2rem,4vw,3rem)] font-black`}
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            WHAT IS NOVA?
          </h3>
          <p data-reveal className={`${revealClass("fade-up", 100)} mt-8 text-lg font-medium leading-relaxed text-[#374151]`}>
            NOVA (Next-Gen Organizational Vitality Analytics) is an AI-powered HR intelligence platform that shifts workforce management from reactive to predictive. It identifies employee burnout, flight risk, and disengagement before they escalate - enabling organizations to intervene early. NOVA combines sentiment analysis, ML risk scoring, peer network analysis, and explainable AI into a unified platform accessible through role-based dashboards for C-suite, HR managers, and employees.
          </p>
        </div>
      </section>

      <section className="border-b-8 border-[#F5C518] bg-black py-28 text-center lg:py-36">
        <div className="mx-auto max-w-4xl px-6 lg:px-10">
          <h3
            data-reveal
            className={`${revealClass("fade-up")} text-[clamp(3rem,8vw,6rem)] font-black uppercase leading-none text-[#F5C518]`}
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            TRY NOVA.
          </h3>
          <div data-reveal className={`${revealClass("fade-up", 120)} mt-10 flex flex-col items-center justify-center gap-5 sm:flex-row`}>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full border-[3px] border-[#F5C518] bg-[#F5C518] px-10 py-4 text-[0.7rem] font-black tracking-[0.2em] text-black transition-colors hover:bg-black hover:text-[#F5C518] sm:w-auto"
            >
              TRY PLATFORM
            </button>
            <button
              type="button"
              onClick={() => navigate("/hr-api")}
              className="w-full border-[3px] border-white bg-transparent px-10 py-4 text-[0.7rem] font-black tracking-[0.2em] text-white transition-colors hover:bg-white hover:text-black sm:w-auto"
            >
              VIEW DOCUMENTATION
            </button>
          </div>
        </div>
      </section>

      <footer className="bg-[#1a1a1a] text-white">
        <div className="h-1 w-full bg-[#F5C518]" />
        <div className="border-t border-[#374151]">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 px-6 py-14 lg:grid-cols-3 lg:px-10">
            <div>
              <div className="flex items-center gap-2 text-xl font-black tracking-tight">
                <CirclePlus className="h-6 w-6 text-[#F5C518]" strokeWidth={2.3} />
                <span>NOVA</span>
              </div>
              <p className="mt-4 text-sm font-semibold text-[#9ca3af]">NOVA · AI Workforce Pulse</p>
              <p className="mt-2 text-sm text-[#9ca3af]">Next-Gen Organizational Vitality Analytics</p>
              <p className="mt-4 text-xs text-[#9ca3af]">© 2026 NOVA · Built for the modern enterprise</p>
            </div>

            <div>
              <h4 className="text-sm font-black tracking-[0.16em] text-white">PLATFORM</h4>
              <ul className="mt-4 space-y-2 text-sm text-[#9ca3af]">
                <li>· Org Intelligence</li>
                <li>· Predictive Risk Engine</li>
                <li>· Intervention Recommendations</li>
                <li>· Appraisal Cycle Management</li>
                <li>· Talent Pipeline</li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-black tracking-[0.16em] text-white">ABOUT NOVA</h4>
              <p className="mt-4 text-sm leading-relaxed text-[#9ca3af]">
                NOVA is an AI-powered HR analytics platform that detects burnout, predicts attrition, and surfaces actionable workforce insights - all powered by explainable machine learning. Built to shift HR from reactive administration to proactive strategy.
              </p>
              <p className="mt-4 text-xs text-[#9ca3af]">Built with: Python · FastAPI · React · Groq LLM · Supabase</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
