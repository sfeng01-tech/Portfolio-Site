import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { publicSections } from '../config/publicSections';

const navLinks = [
  ['About', '/'],
  ...(publicSections.experience ? [['Experience', '/experience']] : []),
  ...(publicSections.projects ? [['Projects', '/projects']] : []),
  ['Open Source', '/open-source'], ['Publications', '/publications'],
  ['Talks', '/talks'], ['Blog', '/blog'],
];

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const toggle = useRef(null);
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <header className="site-header">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <nav className="nav-shell" aria-label="Main navigation">
        <Link to="/" className="brand" aria-label="Sahil Faizal home"><span className="brand-mark">sf<span>.</span></span><span className="brand-name">Sahil Faizal</span></Link>
        <div className="desktop-links">
          {navLinks.map(([name, path]) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>{name}</NavLink>)}
        </div>
        <Link className="nav-contact" to="/contact">Let’s talk <ArrowUpRight size={15} /></Link>
        <ThemeToggle />
        <button ref={toggle} className="menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
        {open && <div className="mobile-links" id="mobile-navigation">{[...navLinks, ['Contact', '/contact']].map(([name, path]) => <NavLink key={path} end={path === '/'} to={path} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>{name}</NavLink>)}</div>}
      </nav>
    </header>
  );
}
