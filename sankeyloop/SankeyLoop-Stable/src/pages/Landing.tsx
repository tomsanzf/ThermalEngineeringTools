import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, useInView } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Linkedin, Mail } from 'lucide-react';
import { cn } from '../lib/utils';

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({ children, delay = 0, className }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const controls = useAnimation();

  useEffect(() => {
    if (isInView) {
      controls.start('visible');
    }
  }, [isInView, controls]);

  return (
    <motion.div
      ref={ref}
      variants={{
        hidden: { opacity: 0, y: 28 },
        visible: { opacity: 1, y: 0 },
      }}
      initial="hidden"
      animate={controls}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const EXAMPLES: any = {
  steam: {
    config:{orientation:"h",highVal:200,hotHighCol:"#FF0000",hotLowCol:"#FFFF00",midVal:45,coldHighCol:"#0000FF",coldLowCol:"#800080",lowVal:0,nodeAlignment:"center",nodeArrangement:"snap",vMargin:100,hMargin:50,nodeSpacing:50,nodeThickness:10,linkOpacity:0.7,arrowSize:15,labelSize:13,labelColor:"#1e293b",defaultNodeColor:"#808080",figWidth:1200,figHeight:800,valueUnit:"kW",gradUnit:"°C",gradGap:20,theme:"light",bgColor:"#ffffff"},
    flows:[
      {Source:"Gas",Target:"Boiler",Value:"78",Color:"Black"},
      {Source:"Boiler",Target:"Steam",Value:"67",Color:"200"},
      {Source:"Boiler",Target:"Purge",Value:"1",Color:"170"},
      {Source:"Boiler",Target:"Stack",Value:"10",Color:"Black"},
      {Source:"Steam",Target:"Deaerator",Value:"6",Color:"200"},
      {Source:"Deaerator",Target:"Boiler",Value:"2",Color:"105"},
      {Source:"Feedwater",Target:"Deaerator",Value:"-4",Color:"20"},
      {Source:"Steam",Target:"Process",Value:"60",Color:"200"},
      {Source:"Process",Target:"Condensate Return",Value:"0",Color:"90"},
      {Source:"Process",Target:"Cndnste Not Returned",Value:"0",Color:"Black"},
      {Source:"Condensate Return",Target:"Deaerator",Value:"0",Color:"90"},
      {Source:"Process",Target:"Chilled Water",Value:"60",Color:"20"},
      {Source:"Chilled Water",Target:"Chiller",Value:"60",Color:"10"},
      {Source:"Elec",Target:"Chiller",Value:"20",Color:"Elec"},
      {Source:"Chiller",Target:"HP",Value:"80",Color:"30"},
      {Source:"Elec",Target:"HP",Value:"27",Color:"Elec"},
      {Source:"HP",Target:"Process",Value:"107",Color:"90"},
    ]
  },
  building: {
    config:{orientation:"h",highVal:80,hotHighCol:"#FF4500",hotLowCol:"#FFA500",midVal:20,coldHighCol:"#00BFFF",coldLowCol:"#8A2BE2",lowVal:0,nodeAlignment:"center",nodeArrangement:"snap",vMargin:80,hMargin:50,nodeSpacing:40,nodeThickness:10,linkOpacity:0.7,arrowSize:15,labelSize:13,labelColor:"#1e293b",defaultNodeColor:"#808080",figWidth:1200,figHeight:700,valueUnit:"kW",gradUnit:"°C",gradGap:20,theme:"light",bgColor:"#ffffff"},
    flows:[
      {Source:"Grid",Target:"Building",Value:"120",Color:"Elec"},
      {Source:"Gas Boiler",Target:"Building",Value:"80",Color:"70"},
      {Source:"Building",Target:"Heating",Value:"60",Color:"55"},
      {Source:"Building",Target:"Cooling",Value:"40",Color:"10"},
      {Source:"Building",Target:"Lighting",Value:"25",Color:"Elec"},
      {Source:"Building",Target:"Equipment",Value:"35",Color:"Elec"},
      {Source:"Building",Target:"Losses",Value:"40",Color:"Black"},
      {Source:"Heating",Target:"Occupied Spaces",Value:"50",Color:"50"},
      {Source:"Heating",Target:"Heat Loss",Value:"10",Color:"Black"},
      {Source:"Cooling",Target:"Occupied Spaces",Value:"35",Color:"12"},
      {Source:"Cooling",Target:"Rejected Heat",Value:"5",Color:"Black"},
    ]
  },
  grid: {
    config:{orientation:"h",highVal:100,hotHighCol:"#FF6B00",hotLowCol:"#FFD700",midVal:50,coldHighCol:"#00CED1",coldLowCol:"#4169E1",lowVal:0,nodeAlignment:"center",nodeArrangement:"snap",vMargin:80,hMargin:50,nodeSpacing:40,nodeThickness:10,linkOpacity:0.7,arrowSize:15,labelSize:13,labelColor:"#1e293b",defaultNodeColor:"#808080",figWidth:1200,figHeight:700,valueUnit:"GWh",gradUnit:"",gradGap:20,theme:"light",bgColor:"#ffffff"},
    flows:[
      {Source:"Solar",Target:"Grid",Value:"45",Color:"Elec"},
      {Source:"Wind",Target:"Grid",Value:"38",Color:"Elec"},
      {Source:"Hydro",Target:"Grid",Value:"20",Color:"Elec"},
      {Source:"Gas",Target:"Grid",Value:"60",Color:"Black"},
      {Source:"Grid",Target:"Residential",Value:"62",Color:"Elec"},
      {Source:"Grid",Target:"Industrial",Value:"70",Color:"Elec"},
      {Source:"Grid",Target:"Commercial",Value:"25",Color:"Elec"},
      {Source:"Grid",Target:"Transmission Loss",Value:"6",Color:"Black"},
    ]
  }
};

export default function Landing() {
  const navigate = useNavigate();
  const [showDonationModal, setShowDonationModal] = useState(false);

  const loadExample = (key: string) => {
    const data = EXAMPLES[key];
    if (!data) return;
    try {
      localStorage.setItem('sankeyloop_load_example', JSON.stringify(data));
      navigate('/app');
    } catch(e) {
      navigate('/app');
    }
  };

  const openDonationPopup = () => {
    const width = 500;
    const height = 650;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    window.open(
      'https://revolut.me/tsanzdesantamaria',
      'RevolutDonation',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
  };

  return (
    <div className="bg-[#0c0c0b] text-[#f0ede8] font-sans selection:bg-[#e8541a] selection:text-white">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center gap-8 h-[60px] px-6 md:px-12 bg-[#0c0c0b]/85 backdrop-blur-xl border-b border-[#272521]">
        <a href="/" className="text-[17px] font-semibold tracking-tight text-[#f0ede8] no-underline">
          Sankey<span className="text-[#e8541a]">Loop</span>
        </a>
        <div className="hidden md:flex flex-1 gap-7">
          <a href="#what" className="text-[13px] font-medium text-[#a09d98] no-underline hover:text-[#f0ede8] transition-colors">What is it?</a>
          <a href="#examples" className="text-[13px] font-medium text-[#a09d98] no-underline hover:text-[#f0ede8] transition-colors">Examples</a>
          <a href="#features" className="text-[13px] font-medium text-[#a09d98] no-underline hover:text-[#f0ede8] transition-colors">Features</a>
          <a href="mailto:tomsanzf@gmail.com" className="text-[13px] font-medium text-[#a09d98] no-underline hover:text-[#f0ede8] transition-colors">Contact</a>
        </div>
        <button 
          onClick={() => setShowDonationModal(true)}
          className="ml-auto bg-transparent border border-[#ff813f] text-[#ff813f] hover:bg-[#ff813f] hover:text-white px-[14px] py-[6px] rounded-md text-[12px] font-semibold transition-all whitespace-nowrap cursor-pointer"
        >
          ☕ Buy me a coffee
        </button>
        <button 
          onClick={() => navigate('/app')}
          className="bg-[#e8541a] text-white px-[18px] py-[7px] rounded-md text-[13px] font-semibold hover:opacity-90 transition-opacity whitespace-nowrap cursor-pointer"
        >
          Open App →
        </button>
      </nav>

      {/* HERO */}
      <div className="relative min-h-screen grid lg:grid-cols-2 items-center gap-12 px-6 md:px-12 pt-[100px] pb-20 overflow-hidden">
        {/* Gradients */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[50%] right-[30%] w-[60%] h-[50%] bg-[radial-gradient(ellipse,rgba(232,84,26,0.07)_0%,transparent_70%)] translate-x-[50%] translate-y-[-50%]" />
          <div className="absolute bottom-[20%] left-[20%] w-[40%] h-[60%] bg-[radial-gradient(ellipse,rgba(59,127,212,0.06)_0%,transparent_60%)] translate-x-[-50%] translate-y-[50%]" />
        </div>

        <div className="relative z-10">
          <Reveal>
            <div className="inline-flex items-center gap-2 mb-6 text-[11px] font-semibold tracking-[0.12em] uppercase text-[#e8541a]">
              <span className="w-6 h-px bg-[#e8541a]" />
              Flow visualization tool
            </div>
            <h1 className="font-serif text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight mb-6">
              Where <em className="italic text-[#e8541a] pr-1">flows</em><br />find their shape
            </h1>
            <p className="max-w-[420px] mb-10 text-[17px] leading-relaxed text-[#a09d98] font-light">
              SankeyLoop turns complex energy, steam, water, CO2 and other flows into clear, interactive diagrams.
              No login. No installation. Just drag, drop, and share.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button 
                onClick={() => navigate('/app')}
                className="inline-flex items-center gap-2 bg-[#e8541a] text-white px-7 py-3 rounded-md text-sm font-semibold hover:opacity-90 transition-all hover:-translate-y-[1px]"
              >
                <ArrowRight size={16} />
                Open the App
              </button>
              <a href="#examples" className="text-sm font-medium text-[#a09d98] hover:text-[#f0ede8] transition-colors no-underline">See examples ↓</a>
            </div>
            <div className="flex flex-wrap gap-5 mt-10">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#5a5754]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e8541a]" /> Thermal gradients
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#5a5754]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3b7fd4]" /> Temperature-coded flows
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#5a5754]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" /> Free forever
              </div>
            </div>
          </Reveal>
        </div>

        <div className="relative flex items-center justify-center lg:order-last order-first">
          <Reveal delay={0.15} className="w-full max-w-[520px]">
             {/* Animated illustrative Sankey */}
            <div className="relative p-1 bg-[#1a1917] rounded-xl border border-[#272521] shadow-2xl overflow-hidden">
               <svg viewBox="0 0 520 340" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto drop-shadow-[0_0_40px_rgba(232,84,26,0.12)]">
                <style>{`
                  @keyframes flowDash {
                    from { stroke-dashoffset: 200; }
                    to   { stroke-dashoffset: 0; }
                  }
                  .flow-animated {
                    stroke-dasharray: 6 4;
                    animation: flowDash 2.5s linear infinite;
                  }
                  @keyframes nodePulse {
                    0%, 100% { opacity: 0.8; transform: translateY(0); }
                    50%      { opacity: 1; transform: translateY(-2px); }
                  }
                `}</style>

                <rect width="520" height="340" fill="#131311" rx="12"/>

                {/* --- FLOWS (Back layer) --- */}

                {/* HP -> Process (Orange Loopback) */}
                <path d="M 426 137.5 C 460 137.5, 490 120, 490 80 C 490 40, 440 40, 400 40 L 260 40 C 210 40, 180 40, 180 80 C 180 120, 200 137.5, 210 137.5" fill="none" stroke="#f59e0b" strokeWidth="15" strokeOpacity="0.7"/>
                <path d="M 426 137.5 C 460 137.5, 490 120, 490 80 C 490 40, 440 40, 400 40 L 260 40 C 210 40, 180 40, 180 80 C 180 120, 200 137.5, 210 137.5" fill="none" stroke="#fbbf24" strokeWidth="13" strokeOpacity="0.4" className="flow-animated"/>

                {/* Gas -> Boiler (Gray) */}
                <path d="M 36 160 L 90 160" fill="none" stroke="#57534e" strokeWidth="40" strokeOpacity="0.6"/>
                <path d="M 36 160 L 90 160" fill="none" stroke="#78716c" strokeWidth="38" strokeOpacity="0.3" className="flow-animated"/>

                {/* Boiler -> Steam (Red) */}
                <path d="M 96 160 L 150 160" fill="none" stroke="#ef4444" strokeWidth="30" strokeOpacity="0.6"/>
                <path d="M 96 160 L 150 160" fill="none" stroke="#f87171" strokeWidth="28" strokeOpacity="0.3" className="flow-animated"/>

                {/* Boiler -> Stack Loss (Dark Gray) */}
                <path d="M 96 178 C 150 178, 150 272, 280 272" fill="none" stroke="#444240" strokeWidth="4" strokeOpacity="0.8"/>

                {/* Steam -> Process (Red/Orange) */}
                <path d="M 156 160 C 180 160, 180 155, 210 155" fill="none" stroke="#ef4444" strokeWidth="30" strokeOpacity="0.6"/>
                <path d="M 156 160 C 180 160, 180 155, 210 155" fill="none" stroke="#f87171" strokeWidth="28" strokeOpacity="0.3" className="flow-animated"/>

                {/* Process -> Chilled Water (Purple) */}
                <path d="M 216 150 L 280 150" fill="none" stroke="#8b5cf6" strokeWidth="25" strokeOpacity="0.6"/>
                <path d="M 216 150 L 280 150" fill="none" stroke="#a78bfa" strokeWidth="23" strokeOpacity="0.3" className="flow-animated"/>

                {/* Chilled Water -> Chiller (Purple) */}
                <path d="M 286 150 L 350 150" fill="none" stroke="#8b5cf6" strokeWidth="25" strokeOpacity="0.6"/>
                <path d="M 286 150 L 350 150" fill="none" stroke="#a78bfa" strokeWidth="23" strokeOpacity="0.3" className="flow-animated"/>

                {/* Chiller -> HP (Purple) */}
                <path d="M 356 150 L 420 150" fill="none" stroke="#8b5cf6" strokeWidth="25" strokeOpacity="0.6"/>
                <path d="M 356 150 L 420 150" fill="none" stroke="#a78bfa" strokeWidth="23" strokeOpacity="0.3" className="flow-animated"/>

                {/* Elec -> Chiller (Green) */}
                <path d="M 286 225 C 320 225, 320 165, 350 165" fill="none" stroke="#22c55e" strokeWidth="10" strokeOpacity="0.7"/>
                <path d="M 286 225 C 320 225, 320 165, 350 165" fill="none" stroke="#4ade80" strokeWidth="8" strokeOpacity="0.3" className="flow-animated"/>

                {/* Elec -> HP (Green) */}
                <path d="M 286 235 C 350 235, 350 165, 420 165" fill="none" stroke="#22c55e" strokeWidth="10" strokeOpacity="0.7"/>
                <path d="M 286 235 C 350 235, 350 165, 420 165" fill="none" stroke="#4ade80" strokeWidth="8" strokeOpacity="0.3" className="flow-animated"/>

                {/* --- NODES --- */}
                {/* Gas */}
                <rect x="30" y="140" width="6" height="40" rx="2" fill="#78716c"/>
                {/* Boiler */}
                <rect x="90" y="140" width="6" height="40" rx="2" fill="#78716c"/>
                {/* Steam */}
                <rect x="150" y="145" width="6" height="30" rx="2" fill="#78716c"/>
                {/* Process */}
                <rect x="210" y="130" width="6" height="50" rx="2" fill="#78716c"/>
                {/* Chilled Water */}
                <rect x="280" y="137.5" width="6" height="25" rx="2" fill="#78716c"/>
                {/* Chiller */}
                <rect x="350" y="137.5" width="6" height="32.5" rx="2" fill="#78716c"/>
                {/* HP */}
                <rect x="420" y="130" width="6" height="40" rx="2" fill="#78716c"/>
                
                {/* Elec */}
                <rect x="280" y="220" width="6" height="20" rx="2" fill="#78716c"/>
                {/* Stack */}
                <rect x="280" y="270" width="6" height="4" rx="2" fill="#78716c"/>

                {/* LABELS */}
                <g fill="#a8a29e" fontSize="10" fontFamily="sans-serif">
                  <text x="26" y="160" textAnchor="end" dominantBaseline="middle">Gas</text>
                  <text x="93" y="133" textAnchor="middle">Boiler</text>
                  <text x="153" y="138" textAnchor="middle">Steam</text>
                  <text x="213" y="123" textAnchor="middle">Process</text>
                  <text x="283" y="130" textAnchor="middle">Chilled Water</text>
                  <text x="353" y="130" textAnchor="middle">Chiller</text>
                  <text x="430" y="160" textAnchor="start" dominantBaseline="middle">HP</text>
                  
                  <text x="276" y="230" textAnchor="end" dominantBaseline="middle">Elec</text>
                  <text x="288" y="272" textAnchor="start" dominantBaseline="middle" fill="#5a5754">Stack Loss</text>
                </g>
              </svg>

              {/* floating stat chips */}
              <div 
                className="absolute top-[12%] left-[45%] bg-[#f59e0b]/15 border border-[#f59e0b]/30 rounded-md px-3 py-1 text-[10px] font-mono text-[#fbbf24]"
                style={{ animation: 'nodePulse 3s ease-in-out infinite' }}
              >
                167 kW Heat Recovery
              </div>
              <div 
                className="absolute bottom-[20%] right-[12%] bg-[#22c55e]/15 border border-[#22c55e]/30 rounded-md px-3 py-1 text-[10px] font-mono text-[#4ade80]"
                style={{ animation: 'nodePulse 3.5s ease-in-out infinite both' }}
              >
                Elec 47 kW
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* WHAT IS A SANKEY */}
      <section className="bg-[#131311] border-y border-[#272521] py-24 px-6 md:px-12" id="what">
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#e8541a] mb-4">About</p>
            <h2 className="font-serif text-3xl md:text-5xl font-semibold leading-tight mb-8">What is a Sankey diagram?</h2>
          </Reveal>
          <div className="grid lg:grid-cols-2 gap-16 items-center mt-16">
            <Reveal className="text-[#a09d98] leading-relaxed font-light text-base space-y-4">
              <p>
                A <span className="text-[#f0ede8] font-medium">Sankey diagram</span> is a flow visualization where the width of each arrow is proportional to the quantity it represents — making it immediately obvious where the big flows are, where energy is lost, and where efficiencies can be found.
              </p>
              <p>
                First used by Irish engineer Matthew Sankey in 1898 to visualize steam engine efficiency, they are now the go-to tool for engineers, sustainability analysts, and process designers working with <span className="text-[#f0ede8] font-medium">energy balances, material flows, supply chains, and carbon accounts</span>.
              </p>
              <p>
                SankeyLoop adds a thermal gradient layer: flow colors encode temperature, so hot and cold streams are visually distinct at a glance — no legend required.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="bg-[#1a1917] border border-[#272521] rounded-xl p-8 flex items-center justify-center">
              <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[320px]">
                <rect x="10" y="40" width="8" height="100" rx="2" fill="#57534e"/>
                <text x="5" y="36" fontFamily="sans-serif" fontSize="9" fill="#9b9894">100 kW</text>
                <rect x="302" y="40" width="8" height="60" rx="2" fill="#57534e"/>
                <text x="280" y="36" fontFamily="sans-serif" fontSize="9" fill="#9b9894">60 kW</text>
                <rect x="302" y="120" width="8" height="40" rx="2" fill="#57534e"/>
                <text x="278" y="116" fontFamily="sans-serif" fontSize="9" fill="#5a5754">40 kW</text>
                <path d="M18 55 C160 55, 160 55, 302 55" fill="none" stroke="#e8541a" strokeWidth="28" strokeOpacity="0.3"/>
                <path d="M162 42 C230 42, 230 55, 302 55" fill="none" stroke="#e8541a" strokeWidth="24" strokeOpacity="0.4"/>
                <path d="M162 115 C230 115, 230 130, 302 130" fill="none" stroke="#444240" strokeWidth="16" strokeOpacity="0.5"/>
                <line x1="60" y1="38" x2="60" y2="72" stroke="#333128" strokeWidth="1" strokeDasharray="3 2"/>
                <text x="63" y="58" fontFamily="sans-serif" fontSize="9" fill="#5a5754">width ∝ flow</text>
              </svg>
            </Reveal>
          </div>
        </div>
      </section>

      {/* EXAMPLES and other sections would follow but for brevity let's implement the core flow */}
      <section id="examples" className="max-w-[1200px] mx-auto py-24 px-6 md:px-12">
        <Reveal>
          <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#e8541a] mb-4">Examples</p>
          <h2 className="font-serif text-3xl md:text-5xl font-semibold leading-tight mb-4">Start from a template</h2>
          <p className="text-[#a09d98] font-light text-base mb-14">Click any example to open it directly in the app.</p>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
           {/* Example Card 1 */}
           <ExampleCard 
             title="Steam & Heat System"
             tag="Energy"
             desc="Industrial boiler, steam distribution, condensate return, and heat recovery."
             previewGradient="from-[#1a100a] to-[#2a1206]"
             onClick={() => loadExample('steam')}
           />
           {/* Example Card 2 */}
           <ExampleCard 
             title="Building Energy Balance"
             tag="Buildings"
             desc="Heating, cooling, ventilation, lighting, and plug loads in a building."
             previewGradient="from-[#080e14] to-[#0a1826]"
             onClick={() => loadExample('building')}
           />
           {/* Example Card 3 */}
           <ExampleCard 
             title="Electricity Grid Mix"
             tag="Power"
             desc="Solar, wind, gas, and hydro generation flowing to demand centers."
             previewGradient="from-[#080e0a] to-[#081408]"
             onClick={() => loadExample('grid')}
           />
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-[#131311] border-y border-[#272521] py-24 px-6 md:px-12" id="features">
        <div className="max-w-[1200px] mx-auto">
          <Reveal>
            <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#e8541a] mb-4">Features</p>
            <h2 className="font-serif text-3xl md:text-5xl font-semibold leading-tight mb-16">Everything you need,<br />nothing you don't</h2>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              icon="🌡️" 
              title="Thermal gradient colors" 
              desc="Assign temperatures to each flow. Hot streams glow red, cold streams turn blue — automatically." 
            />
            <FeatureCard 
              icon="🆚" 
              title="Before & After scenarios" 
              desc="Design and compare two states of your system. Switch between them instantly to see the delta." 
              delay={0.05}
            />
            <FeatureCard 
              icon="🔄" 
              title="Synchronized layout views" 
              desc="Sync node structures between scenarios. Dragging a node in one scenario mirrors its position in the other." 
              delay={0.1}
            />
            <FeatureCard 
              icon="🎬" 
              title="Transition GIF animation" 
              desc="Calculate intermediate steps (25%, 50%, 75%) and export high-fidelity transition GIFs." 
              delay={0.15}
            />
            <FeatureCard 
              icon="📐" 
              title="Preserve Input Order" 
              desc="Order nodes and links strictly by the flow table sequence, generating clean, crossing-free layouts." 
              delay={0.2}
            />
            <FeatureCard 
              icon="🖱️" 
              title="Drag & drop custom layout" 
              desc="Drag any node to place it. Change colors, opacity, or fonts — your custom positions are preserved." 
              delay={0.25}
            />
            <FeatureCard 
              icon="📋" 
              title="Paste from Excel" 
              desc="Copy a range of cells directly from Excel or Google Sheets and paste them instantly into the flow table." 
              delay={0.3}
            />
            <FeatureCard 
              icon="💾" 
              title="Save & Load configurations" 
              desc="Save your complete work — including custom layouts, colors, and flows — to a single local JSON file." 
              delay={0.35}
            />
            <FeatureCard 
              icon="👻" 
              title="Ghost flow lines" 
              desc="Zero-value flows render as faint hairlines, keeping the diagram complete even when no flow is active." 
              delay={0.4}
            />
            <FeatureCard 
              icon="🔁" 
              title="Negative value support" 
              desc="Enter a negative value to reverse flow directions automatically — perfect for return loops." 
              delay={0.45}
            />
            <FeatureCard 
              icon="🌙" 
              title="Light & dark UI themes" 
              desc="Switch between a clean white layout and a dark engineering-style canvas with one click." 
              delay={0.5}
            />
            <FeatureCard 
              icon="🔒" 
              title="Private & local-first" 
              desc="Runs entirely in your browser. Your data never leaves your machine. No logins or accounts required." 
              delay={0.55}
            />
          </div>
        </div>
      </section>

      {/* CTA BAND */}
      <div className="bg-[#131311] border-y border-[#272521] text-center py-24 px-6 md:px-12">
        <Reveal>
          <h2 className="font-serif text-4xl md:text-6xl font-semibold mb-4 leading-tight">Ready to map your flows?</h2>
          <p className="text-[#a09d98] text-lg mb-10 font-light">Free, instant, no setup required.</p>
          <button 
            onClick={() => navigate('/app')}
            className="inline-flex items-center gap-2 bg-[#e8541a] text-white px-9 py-4 rounded-md text-base font-semibold hover:opacity-90 transition-all"
          >
            <ArrowRight size={18} />
            Open SankeyLoop
          </button>
        </Reveal>
      </div>

      {/* FOOTER */}
      <footer className="max-w-[1200px] mx-auto py-12 px-6 md:px-12 flex flex-wrap items-center justify-between gap-4 border-t border-[#272521]">
        <div className="text-sm font-semibold text-[#a09d98]">Sankey<span className="text-[#e8541a]">Loop</span></div>
        <div className="flex flex-wrap gap-6">
          <button onClick={() => navigate('/app')} className="text-[13px] text-[#5a5754] hover:text-[#a09d98] transition-colors">App</button>
          <a href="#examples" className="text-[13px] text-[#5a5754] hover:text-[#a09d98] transition-colors">Examples</a>
          <a href="#what" className="text-[13px] text-[#5a5754] hover:text-[#a09d98] transition-colors">About</a>
          <a href="https://www.linkedin.com/in/tomas-sanz-de-santamaria-a34a0451/" target="_blank" rel="noopener" className="text-[13px] text-[#5a5754] hover:text-[#a09d98] transition-colors">LinkedIn</a>
          <a href="mailto:contact@sankeyloop.com" className="text-[13px] text-[#5a5754] hover:text-[#a09d98] transition-colors">contact@sankeyloop.com</a>
        </div>
        <div className="w-full text-xs text-[#5a5754] mt-4">© 2025 SankeyLoop. Built for engineers, by an engineer.</div>
      </footer>

      {showDonationModal && (
        <div 
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowDonationModal(false)}
        >
          <div 
            className="bg-[#1a1917] border border-[#272521] p-6 rounded-xl shadow-2xl max-w-sm w-full relative text-center"
            onClick={e => e.stopPropagation()}
          >
            <button 
              className="absolute top-4 right-4 text-[#5a5754] hover:text-[#f0ede8] text-lg leading-none bg-transparent border-0 cursor-pointer"
              onClick={() => setShowDonationModal(false)}
            >
              ×
            </button>
            
            <div className="text-3xl mb-3">☕</div>
            <h3 className="text-[#f0ede8] text-lg font-semibold tracking-tight mb-2">
              Thank you for supporting this website!
            </h3>
            <p className="text-[#a09d98] text-[12px] leading-relaxed mb-6">
              Please enter the amount you want to donate in the secure Revolut payment window.
            </p>
            
            <div className="flex flex-col gap-2">
              <button 
                className="w-full py-2 rounded-md font-semibold bg-[#ff813f] hover:bg-[#ff6c24] text-white transition-colors border-0 cursor-pointer text-xs shadow-md"
                onClick={() => {
                  openDonationPopup();
                  setShowDonationModal(false);
                }}
              >
                Open Secure Payment Window
              </button>
              <button 
                className="w-full py-2 rounded-md font-medium border border-[#272521] bg-transparent text-[#a09d98] hover:bg-[#272521] hover:text-[#f0ede8] cursor-pointer transition-colors text-xs"
                onClick={() => setShowDonationModal(false)}
              >
                Cancel
              </button>
            </div>
            
            <p className="text-[#5a5754] text-[10px] mt-4 leading-normal">
              🔒 Payment processed securely by Revolut. Payment portals cannot be embedded directly inside other websites for anti-phishing protection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const ExampleCard: React.FC<{ 
  title: string; 
  tag: string; 
  desc: string; 
  previewGradient: string;
  onClick: () => void;
}> = ({ title, tag, desc, previewGradient, onClick }) => (
  <Reveal className="group bg-[#1a1917] border border-[#272521] rounded-xl overflow-hidden transition-all hover:border-[#333128] hover:-translate-y-1 cursor-pointer" onClick={onClick}>
    <div className={cn("h-[140px] flex items-center justify-center p-4 bg-gradient-to-br", previewGradient)}>
      {/* Small placeholder diagram */}
      <svg viewBox="0 0 200 100" className="w-[90%] opacity-90">
        <path d="M10 50 C50 50,50 30,90 30" fill="none" stroke="#e8541a" strokeWidth="22" strokeOpacity="0.4"/>
        <path d="M90 30 C130 30,130 20,190 20" fill="none" stroke="#f59e0b" strokeWidth="14" strokeOpacity="0.4"/>
        <path d="M90 58 C130 58,130 75,190 75" fill="none" stroke="#333" strokeWidth="8" strokeOpacity="0.6"/>
        <rect x="6" y="30" width="7" height="40" rx="2" fill="#57534e"/>
        <rect x="86" y="18" width="7" height="52" rx="2" fill="#57534e"/>
      </svg>
    </div>
    <div className="p-5 border-t border-[#272521]">
      <div className="text-[10px] font-semibold tracking-widest uppercase text-[#5a5754] mb-1.5">{tag}</div>
      <div className="text-[15px] font-semibold mb-1.5">{title}</div>
      <div className="text-sm text-[#a09d98] font-light leading-relaxed mb-4">{desc}</div>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e8541a] group-hover:gap-2.5 transition-all">
        Load example →
      </span>
    </div>
  </Reveal>
);

const FeatureCard: React.FC<{ 
  icon: string; 
  title: string; 
  desc: string; 
  delay?: number;
}> = ({ icon, title, desc, delay = 0 }) => (
  <Reveal delay={delay} className="bg-[#1a1917] border border-[#272521] rounded-xl p-7 transition-all hover:border-[#333128]">
    <div className="text-2xl mb-4 grayscale group-hover:grayscale-0 transition-all">{icon}</div>
    <div className="text-sm font-semibold mb-2 text-[#f0ede8]">{title}</div>
    <div className="text-[13px] text-[#a09d98] leading-relaxed font-light">{desc}</div>
  </Reveal>
);
