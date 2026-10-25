import React from 'react';
import Blog from '../components/Blog';
import { portfolioData } from '../data/portfolioData';

const BlogPage = () => {
  return (
    <div className="pt-20 min-h-screen">
      <Blog blogPosts={portfolioData.blogPosts} />
    </div>
  );
};

export default BlogPage;
