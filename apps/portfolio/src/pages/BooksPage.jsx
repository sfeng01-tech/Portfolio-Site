import React, { useState } from 'react';
import { Book, FileText, ExternalLink, Calendar, Star } from 'lucide-react';
import { portfolioData } from '../data/portfolioData';

const BooksPage = () => {
  const [activeTab, setActiveTab] = useState('books');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const [year, month] = dateString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Get unique categories from books and papers based on active tab
  const getCategories = () => {
    const items = activeTab === 'books' ? portfolioData.books : portfolioData.researchPapers;
    const field = activeTab === 'books' ? 'categories' : 'tags';
    const allCategories = items.flatMap(item => item[field] || []);
    return ['All', ...new Set(allCategories)];
  };

  // Filter items by category
  const getFilteredItems = () => {
    const items = activeTab === 'books' ? portfolioData.books : portfolioData.researchPapers;
    const field = activeTab === 'books' ? 'categories' : 'tags';

    if (selectedCategory === 'All') return items;

    return items.filter(item => {
      const itemCategories = item[field] || [];
      return itemCategories.includes(selectedCategory);
    });
  };

  const categories = getCategories();
  const filteredItems = getFilteredItems();

  // Reset category filter when switching tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedCategory('All');
  };

  return (
    <div className="pt-20 min-h-screen">
      <section className="section-padding">
        <div className="container-width">
          <h2 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
            Reading & Research
          </h2>
          <div className="w-20 h-1 bg-dark-border mb-12"></div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => handleTabChange('books')}
              className={`flex items-center px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'books'
                  ? 'bg-dark-text-primary text-dark-bg'
                  : 'bg-dark-surface text-dark-text-secondary border border-dark-border hover:border-dark-text-muted'
              }`}
            >
              <Book size={18} className="mr-2" />
              Books
            </button>
            <button
              onClick={() => handleTabChange('papers')}
              className={`flex items-center px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'papers'
                  ? 'bg-dark-text-primary text-dark-bg'
                  : 'bg-dark-surface text-dark-text-secondary border border-dark-border hover:border-dark-text-muted'
              }`}
            >
              <FileText size={18} className="mr-2" />
              Research Papers
            </button>
          </div>

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

          {/* Books Section */}
          {activeTab === 'books' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems && filteredItems.map((book, index) => (
                <div
                  key={index}
                  className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition hover:-translate-y-1"
                >
                  {book.cover && (
                    <img
                      src={book.cover}
                      alt={book.title}
                      className="w-full h-64 object-cover rounded-lg mb-4 border border-dark-border"
                    />
                  )}

                  <h3 className="text-xl font-bold text-dark-text-primary mb-2">
                    {book.title}
                  </h3>

                  <p className="text-dark-text-secondary mb-2">
                    by {book.author}
                  </p>

                  {book.rating && (
                    <div className="flex items-center mb-3">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={16}
                          className={i < book.rating ? 'text-yellow-500 fill-yellow-500' : 'text-dark-border'}
                        />
                      ))}
                      <span className="text-sm text-dark-text-muted ml-2">
                        {book.rating}/5
                      </span>
                    </div>
                  )}

                  <p className="text-dark-text-secondary mb-4 text-sm leading-relaxed">
                    {book.review}
                  </p>

                  <div className="flex items-center justify-between text-xs text-dark-text-muted pt-4 border-t border-dark-border">
                    {book.dateRead && (
                      <div className="flex items-center">
                        <Calendar size={12} className="mr-1" />
                        {formatDate(book.dateRead)}
                      </div>
                    )}
                    {book.link && (
                      <a
                        href={book.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        View Book
                        <ExternalLink size={12} className="ml-1" />
                      </a>
                    )}
                  </div>

                  {book.categories && book.categories.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {book.categories.map((category, idx) => (
                        <span
                          key={idx}
                          className="text-xs text-dark-text-muted bg-dark-bg px-2 py-1 rounded-full border border-dark-border"
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {(!filteredItems || filteredItems.length === 0) && (
                <div className="col-span-full text-center text-dark-text-muted py-12">
                  {selectedCategory === 'All' ? 'No books added yet.' : `No books found in "${selectedCategory}" category.`}
                </div>
              )}
            </div>
          )}

          {/* Research Papers Section */}
          {activeTab === 'papers' && (
            <div className="space-y-6">
              {filteredItems && filteredItems.map((paper, index) => (
                <div
                  key={index}
                  className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-dark-text-primary mb-2">
                        {paper.title}
                      </h3>
                      <p className="text-sm text-dark-text-secondary mb-3">
                        {paper.authors}
                      </p>
                    </div>
                    {paper.pdf && (
                      <a
                        href={paper.pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-4 text-dark-text-secondary hover:text-dark-text-primary transition-colors flex-shrink-0"
                      >
                        <ExternalLink size={20} />
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 mb-4 text-sm">
                    <div className="flex items-center text-dark-text-muted">
                      <FileText size={16} className="mr-2" />
                      <span className="font-semibold text-dark-text-secondary">
                        {paper.venue || paper.journal}
                      </span>
                      {paper.year && (
                        <>
                          <span className="mx-2">•</span>
                          <span>{paper.year}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {paper.summary && (
                    <p className="text-dark-text-secondary mb-4 leading-relaxed text-justify">
                      {paper.summary}
                    </p>
                  )}

                  {paper.keyTakeaways && paper.keyTakeaways.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-dark-text-primary mb-2">
                        Key Takeaways:
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-dark-text-secondary">
                        {paper.keyTakeaways.map((takeaway, idx) => (
                          <li key={idx} className="ml-2">{takeaway}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {paper.tags && paper.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-dark-border">
                      {paper.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-xs text-dark-text-muted bg-dark-bg px-3 py-1 rounded-full border border-dark-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {(!filteredItems || filteredItems.length === 0) && (
                <div className="text-center text-dark-text-muted py-12">
                  {selectedCategory === 'All' ? 'No research papers added yet.' : `No papers found in "${selectedCategory}" category.`}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BooksPage;
