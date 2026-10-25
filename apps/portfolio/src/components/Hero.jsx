import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Cpu, Github, Linkedin } from 'lucide-react';

function ComputeIllustration() {
  return <div className="compute-illustration" role="img" aria-label="Schematic of an AI system, connecting training and inference through a GPU compute core">
    <div className="diagram-heading"><span>THE SYSTEMS PERSPECTIVE</span><span>FIG. 01</span></div>
    <svg className="compute-lines" viewBox="0 0 440 340" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1"><path d="M0 94H100L160 154M0 246H100L160 186M280 154L340 94H440M280 186L340 246H440M220 0V110M220 230V340"/><path d="M0 110H90L150 170M0 230H90L150 170M290 170L350 110H440M290 170L350 230H440M204 0V100M236 240V340" opacity=".4"/></g>
      <g fill="var(--accent)">{[[100,94],[100,246],[340,94],[340,246],[220,60],[220,280]].map(([cx,cy])=><circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3"/>)}</g>
    </svg>
    <span className="diagram-tag tag-training">01 / TRAINING</span>
    <span className="diagram-tag tag-inference">02 / INFERENCE</span>
    <div className="compute-core"><Cpu size={34} strokeWidth={1.2}/><strong>AI</strong><span>BUILT TO SCALE</span></div>
    <div className="diagram-caption"><span className="status-dot"/>From model to machine.<span className="diagram-cross">+</span></div>
  </div>;
}

export default function Hero({ profile, skills, achievements }) {
  return <div className="home-layout container-width">
    <section id="about" className="hero-section">
      <div className="hero-copy">
        <div className="eyebrow"><span className="status-dot"/>SOFTWARE ENGINEER · AI SYSTEMS</div>
        <h1>I build the systems<br/>that make <span>AI work.</span></h1>
        <p className="hero-description">I’m {profile.name}. {profile.tagline} — from GPU kernels to production infrastructure.</p>
        <div className="hero-actions"><Link to="/open-source" className="button-primary">Explore my work <ArrowUpRight size={18}/></Link><a href={profile.github} target="_blank" rel="noopener noreferrer" className="button-quiet"><Github size={18}/> GitHub <ArrowUpRight size={14}/></a></div>
        <a className="explore-link" href="#expertise"><ArrowDown size={14}/> A little further down</a>
      </div>
      <ComputeIllustration/>
    </section>
    <section id="expertise" className="home-section expertise-section"><div className="section-heading"><div><div className="eyebrow">01 / THE TOOLKIT</div><h2>Across the AI stack.</h2></div><p>Close to the hardware.<br/>Focused on the whole system.</p></div><div className="skill-rows">{skills.map((group,index)=><div className="skill-row" key={group.category}><h3><span>0{index+1}</span>{group.category}</h3><div>{group.items.map(skill=><span key={skill}>{skill}</span>)}</div></div>)}</div></section>
    <section className="home-section"><div className="section-heading"><div><div className="eyebrow">02 / ALONG THE WAY</div><h2>A few things I’m proud of.</h2></div></div><div className="achievement-list">{achievements.map((item,index)=><div key={item}><span className="achievement-index">{String(index+1).padStart(2,'0')}</span><p>{item}</p><ArrowUpRight size={17}/></div>)}</div></section>
    <section className="home-contact"><div className="eyebrow">LET’S CONNECT</div><h2>Good systems start with<br/>a good conversation.</h2><a className="text-link" href={`mailto:${profile.email}`}>Say hello <ArrowUpRight size={22}/></a></section>
    <footer className="home-footer"><Link className="brand-mark" to="/">sf<span>.</span></Link><span>© {new Date().getFullYear()} {profile.name}</span><div><a href={profile.github} aria-label="GitHub" target="_blank" rel="noopener noreferrer"><Github size={18}/></a><a href={profile.linkedin} aria-label="LinkedIn" target="_blank" rel="noopener noreferrer"><Linkedin size={18}/></a><Link to="/orin">ORIN <ArrowUpRight size={14}/></Link><Link to="/contact">Get in touch <ArrowUpRight size={14}/></Link></div></footer>
  </div>;
}
