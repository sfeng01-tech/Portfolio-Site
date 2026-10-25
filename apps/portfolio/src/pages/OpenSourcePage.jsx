import React from 'react';
import OpenSourceContributions from '../components/OpenSourceContributions';
import { portfolioData } from '../data/portfolioData';

const OpenSourcePage = () => (
  <div className="pt-20 min-h-screen">
    <OpenSourceContributions contributions={portfolioData.openSourceContributions} />
  </div>
);

export default OpenSourcePage;
