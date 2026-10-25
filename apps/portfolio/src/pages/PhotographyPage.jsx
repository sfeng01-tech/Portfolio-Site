import React from 'react';
import Photography from '../components/Photography';
import { portfolioData } from '../data/portfolioData';

const PhotographyPage = () => {
  return (
    <div className="pt-20 min-h-screen">
      <Photography photography={portfolioData.photography} />
    </div>
  );
};

export default PhotographyPage;
