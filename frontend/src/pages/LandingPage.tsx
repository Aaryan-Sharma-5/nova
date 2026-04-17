import { ArrowRight, Lock, Fingerprint, Activity, TrendingDown, BrainCircuit, ShieldAlert, BarChart3, Users, Briefcase } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/auth";

export default function LandingPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("employee");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  
  const { login, register, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const getLandingPath = (role: UserRole) => role === "employee" ? "/your-data" : "/org-health";

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isLogin) {
        const user = await login(email, password);
        navigate(getLandingPath(user.role), { replace: true });
      } else {
        const user = await register({ email, password, full_name: fullName, role });
        navigate(getLandingPath(user.role), { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  const isGoogleConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  return (
    <div className="nova-public-landing min-h-screen bg-[#fbf9f6] text-black font-sans selection:bg-[#eab308] selection:text-black scroll-smooth">
      
      {/* GLOBAL NAV */}
      <header className="landing-nav border-b-2 border-black bg-[#fbf9f6] sticky top-0 z-50">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between p-4 px-8">
          <span className="font-[Playfair_Display] text-2xl font-black tracking-tight text-black">NOVA</span>
          <nav className="hidden md:flex gap-8 text-[0.65rem] font-black uppercase tracking-[0.2em]">
            <a href="#platform" className="hover:text-[#eab308] transition-colors">Platform</a>
            <a href="#features" className="hover:text-[#eab308] transition-colors">Features</a>
            <a href="#dashboards" className="hover:text-[#eab308] transition-colors">Views</a>
            <a href="#about" className="hover:text-[#eab308] transition-colors">About</a>
          </nav>
          <div className="flex items-center gap-4">
            <a href="#platform" onClick={() => setIsLogin(true)} className="text-[0.65rem] uppercase tracking-[0.2em] font-black hover:text-[#eab308] transition-colors cursor-pointer">Sign In</a>
            <a href="#platform" onClick={() => setIsLogin(false)} className="bg-[#eab308] border-[1.5px] border-black px-4 py-2 text-[0.65rem] uppercase tracking-[0.2em] font-black shadow-[2px_2px_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all cursor-pointer">
              Initialize
            </a>
          </div>
        </div>
      </header>

      {/* 1. HERO SECTION (LEFT + RIGHT SPLIT) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 min-h-[90vh] border-b-2 border-black" id="platform">
        {/* Left Side: Dark Monolith */}
        <div className="bg-black text-[#fbf9f6] p-8 md:p-16 lg:p-24 flex flex-col justify-center border-r-2 border-black relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#eab308]/5 via-black to-black opacity-80 z-0"></div>
          <div className="relative z-10 flex flex-col h-full justify-center">
            <h1 className="font-[Playfair_Display] text-[clamp(2.5rem,5.5vw,5rem)] font-black leading-[0.9] text-[#eab308] mb-6 uppercase">
              THE WORKFORCE<br/>INTELLIGENCE<br/>MONOLITH.
            </h1>
            <p className="text-xl md:text-2xl font-medium text-white/90 max-w-md mb-16">
              Detect burnout. Predict attrition. Act before it's too late.
            </p>
            
            <div className="mt-auto pt-8 border-t border-white/20 grid grid-cols-3 gap-6">
              <div>
                <p className="text-[#eab308]/80 text-[0.6rem] font-black uppercase tracking-[0.2em] mb-2">Burnout Index</p>
                <strong className="text-[#eab308] text-4xl block font-black">61</strong>
              </div>
              <div>
                <p className="text-[#eab308]/80 text-[0.6rem] font-black uppercase tracking-[0.2em] mb-2">Attrition Risk Score</p>
                <strong className="text-[#eab308] text-4xl block font-black">58</strong>
              </div>
              <div>
                <p className="text-[#eab308]/80 text-[0.6rem] font-black uppercase tracking-[0.2em] mb-2">Workforce Stability</p>
                <strong className="text-[#eab308] text-4xl block font-black">82%</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Access Terminal */}
        <div className="bg-[#fbf9f6] p-8 md:p-16 flex flex-col justify-center">
          <div className="max-w-md mx-auto w-full">
            <h2 className="text-3xl lg:text-4xl font-black uppercase tracking-tight mb-2">ACCESS TERMINAL</h2>
            <p className="text-sm font-bold text-gray-500 mb-10">
              {isLogin ? "Input credentials to initialize session." : "Input details to register new credentials."}
            </p>
            
            <form className="space-y-4" onSubmit={handleAuth}>
              {error && <div className="p-3 border-2 border-red-600 bg-red-100 text-red-600 text-[0.65rem] font-bold uppercase tracking-widest animate-fade-in">{error}</div>}
              
              {!isLogin && (
                <label className="flex flex-col gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em] animate-fade-in">
                  Full Name
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Jane Doe" className="border-2 border-black bg-white py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#eab308] transition-shadow shadow-[4px_4px_0_#000]" />
                </label>
              )}

              <label className="flex flex-col gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em]">
                Identification
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="email@nova.system" className="border-2 border-black bg-white py-3 px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#eab308] transition-shadow shadow-[4px_4px_0_#000]" />
              </label>
              
              <label className="flex flex-col gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em]">
                <div className="flex justify-between w-full">
                  Security Key
                  {isLogin && <span className="text-[0.55rem] tracking-widest uppercase hover:underline cursor-pointer text-gray-500">Recovery</span>}
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••••••" className="border-2 border-black bg-white py-3 px-4 text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-[#eab308] transition-shadow shadow-[4px_4px_0_#000]" />
              </label>

              {!isLogin && (
                <label className="flex flex-col gap-2 text-[0.65rem] font-black uppercase tracking-[0.2em] animate-fade-in">
                  Authorization Level
                  <select value={role} onChange={e => setRole(e.target.value as UserRole)} className="border-2 border-black bg-white py-3 px-4 text-[0.65rem] font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-[#eab308] transition-shadow shadow-[4px_4px_0_#000] appearance-none rounded-none">
                    <option value="employee">Level 1 - Employee</option>
                    <option value="manager">Level 2 - Manager</option>
                    <option value="hr">Level 3 - Human Resources</option>
                    <option value="leadership">Level 4 - Executive Command</option>
                  </select>
                </label>
              )}
              
              <button disabled={submitting} type="submit" className="block w-full text-center text-sm py-4 border-2 border-black shadow-[4px_4px_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all bg-[#eab308] uppercase tracking-[0.2em] font-black mt-6 disabled:opacity-50">
                {submitting ? "PROCESSING..." : isLogin ? "INITIALIZE SESSION" : "REGISTER CREDENTIALS"}
              </button>
            </form>
            
            <div className="text-center mt-6 text-[0.65rem] font-bold uppercase tracking-widest text-[#4a4a4a]">
              {isLogin ? "Require Clearance? " : "Existing Credentials? "}
              <button onClick={() => setIsLogin(!isLogin)} type="button" className="text-black underline cursor-pointer">{isLogin ? "Request Access" : "Sign In"}</button>
            </div>
            
            <div className="w-full h-px bg-black my-8 opacity-20"></div>
            
            <p className="text-[0.6rem] font-black uppercase tracking-[0.2em] text-[#4a4a4a] mb-4 text-center">Alternative Authentication</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={async () => {
                  if (!isGoogleConfigured) return;
                  setOauthLoading(true);
                  try { await signInWithGoogle(); } catch (err) { setError(err instanceof Error ? err.message : "Google sign-in failed"); setOauthLoading(false); }
                }}
                disabled={!isGoogleConfigured || oauthLoading}
                className="flex items-center justify-center gap-2 border-2 border-black py-3 text-[0.6rem] font-black uppercase tracking-widest bg-white hover:bg-black hover:text-white transition-colors shadow-[2px_2px_0_#000] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] disabled:opacity-50">
                <Lock className="h-3.5 w-3.5" />
                {oauthLoading ? "..." : "SSO / Google"}
              </button>
              <button disabled className="flex items-center justify-center gap-2 border-2 border-black py-3 text-[0.6rem] font-black uppercase tracking-widest bg-white opacity-50 cursor-not-allowed transition-colors shadow-[2px_2px_0_#000]">
                <Fingerprint className="h-3.5 w-3.5" />
                Biometric
              </button>
            </div>
            {!isGoogleConfigured && (
                <p className="text-[0.55rem] uppercase tracking-widest font-bold text-center mt-3 text-red-500">
                  Google SSO not configured locally
                </p>
            )}
          </div>
        </div>
      </section>

      {/* 2. PRODUCT VALUE SECTION */}
      <section className="py-24 lg:py-32 bg-[#fbf9f6] border-b-2 border-black overflow-hidden relative">
        <div className="max-w-[1440px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          
          <div className="lg:col-span-7">
            <h2 className="font-sans text-[clamp(2.5rem,5vw,4.5rem)] font-black leading-[0.95] tracking-tight uppercase">
              WORKFORCE METRICS.<br/>
              <span className="inline-block mt-2 bg-black text-[#eab308] px-4 py-2">DEFINED.</span>
            </h2>
            <div className="mt-10 space-y-6 max-w-lg text-[#111] text-lg font-bold">
              <p className="flex gap-4 items-center border-l-4 border-[#eab308] pl-4"><ArrowRight className="h-5 w-5 text-black shrink-0"/> AI-driven risk detection</p>
              <p className="flex gap-4 items-center border-l-4 border-[#eab308] pl-4"><ArrowRight className="h-5 w-5 text-black shrink-0"/> Explainable scoring (not black box)</p>
              <p className="flex gap-4 items-center border-l-4 border-[#eab308] pl-4"><ArrowRight className="h-5 w-5 text-black shrink-0"/> Real-time workforce monitoring</p>
            </div>
          </div>

          <div className="lg:col-span-5 transform transition-transform duration-500 hover:-translate-y-2">
            <div className="bg-white border-2 border-black shadow-[16px_16px_0_#eab308] p-8 w-full">
              <div className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
                <span className="font-extrabold text-[0.65rem] uppercase tracking-widest inline-flex items-center gap-2">
                  <Activity className="h-3 w-3" />
                  SYSTEM OVERVIEW / 24
                </span>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-black"></div><div className="w-2 h-2 bg-black"></div><div className="w-2 h-2 bg-[#eab308]"></div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="border-2 border-black p-4 bg-[#fbf9f6]">
                  <p className="text-[0.55rem] uppercase tracking-widest font-black text-gray-500">Burnout Score</p>
                  <strong className="text-4xl font-black block mt-2 text-black">61</strong>
                </div>
                <div className="border-2 border-black p-4 bg-[#eab308]">
                  <p className="text-[0.55rem] uppercase tracking-widest font-black text-black">Attrition Risk</p>
                  <strong className="text-4xl font-black block mt-2 text-black">58</strong>
                </div>
              </div>
              
              <div className="border-2 border-black p-4 mb-6 flex justify-between items-end bg-[#fbf9f6]">
                <div>
                  <p className="text-[0.55rem] uppercase tracking-widest font-black text-gray-500">Headcount</p>
                  <strong className="text-2xl font-black block mt-1 text-black">246</strong>
                </div>
                <Users className="h-6 w-6 opacity-30" />
              </div>

              {/* Minimal Bar Chart */}
              <div className="h-16 flex items-end justify-between gap-1 pt-4 border-t-2 border-black">
                {[40, 65, 30, 80, 50, 90, 45, 60, 20, 70].map((h, i) => (
                  <div key={i} className={`w-full ${i===5 ? 'bg-[#eab308]' : 'bg-black'}`} style={{height: `${h}%`}}></div>
                ))}
              </div>
            </div>
          </div>
          
        </div>
      </section>

      {/* 3. FEATURES SECTION (GRID) */}
      <section className="bg-black text-[#fbf9f6] border-b-2 border-[#eab308]" id="features">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 w-full">
          {[
            { title: "Burnout Detection", desc: "Identify exhaustion patterns before critical failure.", icon: <Activity className="w-8 h-8" /> },
            { title: "Attrition Prediction", desc: "Forecast organizational departure risk with high precision.", icon: <TrendingDown className="w-8 h-8" /> },
            { title: "Explainable AI", desc: "Transparent risk scoring mechanisms—no black boxes.", icon: <BrainCircuit className="w-8 h-8" /> },
            { title: "Intervention Engine", desc: "Actionable protocols automatically recommended by AI.", icon: <ShieldAlert className="w-8 h-8" /> },
          ].map((feature, i) => (
            <div key={i} className="border-r border-b border-white/20 p-12 hover:bg-[#111] transition-colors group cursor-default">
              <div className="text-[#eab308] mb-8 opacity-70 group-hover:opacity-100 transition-opacity transform group-hover:scale-110 duration-300 w-max">
                {feature.icon}
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight mb-4">{feature.title}</h3>
              <p className="text-sm font-medium text-white/60 leading-relaxed group-hover:text-white/90 transition-colors">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. ROLE-BASED DASHBOARD SECTION */}
      <section className="py-24 lg:py-32 bg-[#fbf9f6] border-b-2 border-black" id="dashboards">
        <div className="max-w-[1440px] mx-auto px-8">
           <h2 className="text-[clamp(2.5rem,4vw,3.5rem)] font-black uppercase tracking-tight text-center mb-16 lg:mb-24">
             Command Interfaces
           </h2>
           
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {[
                { role: "HR View", target: "Org-wide risk", icon: <Users className="w-6 h-6"/>, bg: "bg-white", accent: "bg-[#eab308]" },
                { role: "Manager View", target: "Team insights", icon: <Briefcase className="w-6 h-6"/>, bg: "bg-black", accent: "bg-[#fbf9f6]", text: "text-white" },
                { role: "Leadership View", target: "Executive summary", icon: <BarChart3 className="w-6 h-6"/>, bg: "bg-[#eab308]", accent: "bg-black" },
              ].map((card, i) => (
                <div key={i} className={`${card.bg} border-2 border-black p-8 relative overflow-hidden group hover:-translate-y-2 transition-transform shadow-[8px_8px_0_#000]`}>
                  <div className={`absolute top-0 right-0 p-4 ${card.text ? 'text-white' : 'text-black'}`}>
                     {card.icon}
                  </div>
                  <div className="h-40"></div>
                  <h3 className={`text-2xl font-black uppercase tracking-tight mb-2 ${card.text || 'text-black'}`}>{card.role}</h3>
                  <div className={`w-12 h-1 mb-4 ${card.accent}`}></div>
                  <p className={`font-bold uppercase tracking-widest text-[0.65rem] ${card.text ? 'text-white/70' : 'text-black/70'}`}>
                    {card.target}
                  </p>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* 5. HOW IT WORKS (PIPELINE STYLE) */}
      <section className="py-24 lg:py-32 bg-[#eab308] border-b-2 border-black relative overflow-hidden" id="pipeline">
        <div className="absolute inset-0 border-y-[20px] border-black/5 pointer-events-none"></div>
        <div className="max-w-[1440px] mx-auto px-8 relative z-10">
          <h2 className="text-[clamp(2rem,3vw,3rem)] font-black uppercase tracking-tight text-black text-center mb-20">
            Intelligence Pipeline
          </h2>
          
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 lg:gap-8 max-w-6xl mx-auto">
            {["Employee Data", "AI Analysis", "Risk Scoring", "Recommended Actions"].map((step, i) => (
              <div key={i} className="flex flex-col md:flex-row items-center w-full lg:w-auto">
                <div className="w-full md:w-48 h-48 border-[3px] border-black bg-[#fbf9f6] flex flex-col items-center justify-center p-6 text-center shadow-[6px_6px_0_#000] relative group hover:bg-black hover:text-[#eab308] transition-colors">
                  <span className="text-[0.6rem] font-black uppercase tracking-[0.2em] mb-4 opacity-50 group-hover:opacity-100">Step {i+1}</span>
                  <p className="font-black uppercase text-sm tracking-widest leading-snug">{step}</p>
                </div>
                {i < 3 && (
                  <ArrowRight className="w-8 h-8 text-black my-8 md:my-0 mx-auto md:mx-6 shrink-0 md:-rotate-0 rotate-90" strokeWidth={3} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT SECTION */}
      <section className="py-24 lg:py-32 bg-[#fbf9f6] border-b-2 border-black" id="about">
        <div className="max-w-[1440px] mx-auto px-8 grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          <div>
            <h2 className="text-[clamp(2.5rem,4vw,3.5rem)] font-[Playfair_Display] font-black leading-none mb-8 text-black uppercase">
              Architecting Stability.<br/>Engineering Trust.
            </h2>
            <div className="space-y-6 text-lg font-medium text-[#4a4a4a]">
              <p>NOVA was forged to solve one of the most complex challenges of the modern enterprise: workforce volatility. By bridging behavioral data with transparent machine learning, we transform raw telemetry into structural insights.</p>
              <p>We believe that AI in human resources must be inherently explainable. Our models are constructed not as black boxes, but as transparent, auditable intelligence layers serving the leaders who rely on them.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:gap-6">
             <div className="border-[3px] border-black p-8 text-center bg-white shadow-[6px_6px_0_#eab308] transform transition-transform hover:-translate-y-2">
                <strong className="text-4xl lg:text-5xl font-black block mb-2">99%</strong>
                <span className="text-[0.65rem] font-black uppercase tracking-widest text-gray-500">Uptime Reliability</span>
             </div>
             <div className="border-[3px] border-black p-8 text-center bg-black text-white shadow-[6px_6px_0_#eab308] transform transition-transform hover:-translate-y-2">
                <strong className="text-4xl lg:text-5xl font-black block mb-2 text-[#eab308]">10k+</strong>
                <span className="text-[0.65rem] font-black uppercase tracking-widest opacity-70">Nodes Monitored</span>
             </div>
             <div className="border-[3px] border-black p-8 text-center bg-[#eab308] shadow-[6px_6px_0_#000] col-span-2 transform transition-transform hover:-translate-y-2">
                <strong className="text-4xl lg:text-5xl font-black block mb-2">ZERO</strong>
                <span className="text-[0.65rem] font-black uppercase tracking-widest">Black Box Assertions</span>
             </div>
          </div>
        </div>
      </section>

      {/* 6. CTA SECTION */}
      <section className="py-32 lg:py-48 bg-black text-center border-b-8 border-[#eab308]">
        <div className="max-w-4xl mx-auto px-8">
          <h2 className="text-[clamp(3.5rem,8vw,6rem)] font-black uppercase font-[Playfair_Display] leading-none mb-12 text-[#eab308]">
            DEPLOY NOVA.
          </h2>
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
              <button className="w-full sm:w-auto bg-[#eab308] text-black border-[3px] border-[#eab308] px-10 py-5 font-black uppercase tracking-[0.2em] text-[0.7rem] hover:bg-black hover:text-[#eab308] transition-colors shadow-[6px_6px_0_#fbf9f6] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px]">
                Deploy Platform
              </button>
              <button className="w-full sm:w-auto bg-transparent border-[3px] border-[#fbf9f6] text-[#fbf9f6] px-10 py-5 font-black uppercase tracking-[0.2em] text-[0.7rem] hover:bg-[#fbf9f6] hover:text-black transition-colors shadow-[6px_6px_0_#eab308] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px]">
                View Documentation
              </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#fbf9f6] text-black py-12 border-t-2 border-black">
        <div className="max-w-[1440px] mx-auto px-8 flex justify-between items-center">
            <div>
              <p className="font-[Playfair_Display] text-xl font-black tracking-tight text-black mb-1">NOVA</p>
              <span className="text-[0.55rem] uppercase tracking-widest opacity-60 font-bold">© 2026 NOVA ARCHITECTURAL SYSTEMS</span>
            </div>
        </div>
      </footer>
    </div>
  );
}