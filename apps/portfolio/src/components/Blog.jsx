import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Calendar, Clock, Tag } from 'lucide-react';

const Blog = ({ blogPosts }) => {
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Extract unique categories from all blog posts (now using categories array)
  const allCategories = blogPosts.flatMap(post => post.categories || [post.category || []]);
  const categories = ['All', ...new Set(allCategories)];

  // Filter posts by category (OR logic - show post if it has any selected category)
  const filteredPosts = selectedCategory === 'All'
    ? blogPosts
    : blogPosts.filter(post => {
        const postCategories = post.categories || [post.category];
        return postCategories.includes(selectedCategory);
      });

  const formatDate = (dateString) => {
    const [year, month] = dateString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <section id="blog" className="section-padding bg-dark-surface">
      <div className="container-width">
        <h2 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
          Blog
        </h2>
        <div className="w-20 h-1 bg-dark-border mb-8"></div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-3 mb-12">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedCategory === category
                  ? 'bg-dark-text-primary text-dark-bg'
                  : 'bg-dark-bg text-dark-text-secondary border border-dark-border hover:border-dark-text-muted'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Blog Posts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredPosts.map((post, index) => {
            const CardWrapper = post.externalUrl ? 'a' : Link;
            const linkProps = post.externalUrl
              ? { href: post.externalUrl, target: '_blank', rel: 'noopener noreferrer' }
              : { to: `/blog/${post.slug}` };

            return (
              <CardWrapper
                key={index}
                {...linkProps}
                className="block bg-dark-bg border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition hover:-translate-y-1"
              >
                {post.image && (
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-48 object-cover rounded-lg mb-4 border border-dark-border"
                  />
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="flex flex-wrap gap-2">
                    {(post.categories || [post.category]).slice(0, 2).map((cat, idx) => (
                      <span
                        key={idx}
                        className="text-xs text-dark-text-primary bg-dark-surface px-3 py-1 rounded-full border border-dark-border"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                  <BookOpen className="text-dark-text-muted" size={20} />
                </div>

                <h3 className="text-xl font-bold text-dark-text-primary mb-3">
                  {post.title}
                </h3>

                <p className="text-dark-text-secondary mb-4 leading-relaxed">
                  {post.summary}
                </p>

                <div className="flex items-center gap-4 mb-4 text-sm text-dark-text-muted">
                  <div className="flex items-center">
                    <Calendar size={14} className="mr-1.5" />
                    {formatDate(post.date)}
                  </div>
                  <div className="flex items-center">
                    <Clock size={14} className="mr-1.5" />
                    {post.readTime}
                  </div>
                </div>

                {/* Keywords */}
                <div className="flex items-start gap-2 pt-4 border-t border-dark-border">
                  <Tag size={14} className="text-dark-text-muted mt-1 flex-shrink-0" />
                  <div className="flex flex-wrap gap-2">
                    {post.keywords.map((keyword, idx) => (
                      <span
                        key={idx}
                        className="text-xs text-dark-text-muted bg-dark-surface px-2 py-1 rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              </CardWrapper>
            );
          })}
        </div>

        {filteredPosts.length === 0 && (
          <div className="text-center text-dark-text-muted py-12">
            No posts found in this category.
          </div>
        )}
      </div>
    </section>
  );
};

export default Blog;
