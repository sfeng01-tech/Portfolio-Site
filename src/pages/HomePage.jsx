import React from 'react';
import Hero from '../components/Hero';
import { portfolioData } from '../data/portfolioData';

const HomePage = () => {
  return (
    <div className="pt-20">
      <Hero
        profile={portfolioData.profile}
        skills={portfolioData.skills}
        achievements={portfolioData.achievements}
      />
    </div>
  );
};

export default HomePage;
