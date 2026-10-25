import React from 'react';
import Publications from '../components/Publications';
import { portfolioData } from '../data/portfolioData';

const PublicationsPage = () => {
  return (
    <div className="pt-20 min-h-screen">
      <Publications publications={portfolioData.publications} />
    </div>
  );
};

export default PublicationsPage;
