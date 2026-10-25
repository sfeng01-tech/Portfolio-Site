import React from 'react';
import Contact from '../components/Contact';
import { portfolioData } from '../data/portfolioData';

const ContactPage = () => {
  return (
    <div className="pt-20 min-h-screen">
      <Contact profile={portfolioData.profile} />
    </div>
  );
};

export default ContactPage;
