import React from 'react';
import Talks from '../components/Talks';
import { portfolioData } from '../data/portfolioData';

const TalksPage = () => {
  return (
    <div className="pt-20 min-h-screen">
      <Talks talks={portfolioData.talks} />
    </div>
  );
};

export default TalksPage;
