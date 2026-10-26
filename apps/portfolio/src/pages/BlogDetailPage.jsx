import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Tag } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { portfolioData } from '../data/portfolioData';
import 'highlight.js/styles/atom-one-dark.css';

// Only the grammars local posts actually use. The default rehype-highlight
// bundle registers every common language, which is a large download for a
// markdown route that almost always redirects to an external article.
const HIGHLIGHT_LANGUAGES = { bash, css, javascript, json, python, sql, typescript, xml, yaml };
const HIGHLIGHT_ALIASES = {
  bash: ['sh', 'shell'],
  javascript: ['js', 'jsx'],
  typescript: ['ts', 'tsx'],
  xml: ['html'],
  yaml: ['yml']
};

const BlogDetailPage = () => {
  const { slug } = useParams();

  // Find the blog post by slug
  const post = portfolioData.blogPosts.find(p => p.slug === slug);

  useEffect(() => {
    if (post?.externalUrl) {
      window.location.replace(post.externalUrl);
    }
  }, [post]);

  if (!post) {
    return (
      <div className="pt-20 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-dark-text-primary mb-4">Post Not Found</h1>
          <Link to="/blog" className="text-dark-text-secondary hover:text-dark-text-primary">
            ← Back to Blog
          </Link>
        </div>
      </div>
    );
  }

  if (post.externalUrl) {
    return (
      <div className="pt-20 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-dark-text-primary mb-4">Redirecting...</h1>
          <a
            href={post.externalUrl}
            className="text-dark-text-secondary hover:text-dark-text-primary"
          >
            Open article on Substack
          </a>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    const [year, month] = dateString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="pt-20 min-h-screen">
      <article className="section-padding bg-dark-bg">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <Link
            to="/blog"
            className="inline-flex items-center text-dark-text-secondary hover:text-dark-text-primary mb-8 transition-colors"
          >
            <ArrowLeft size={20} className="mr-2" />
            Back to Blog
          </Link>

          {/* Post Header */}
          <div className="mb-8">
            <div className="flex flex-wrap gap-2 mb-4">
              {(post.categories || [post.category]).filter(Boolean).map((category) => (
                <span
                  key={category}
                  className="inline-block text-sm text-dark-text-primary bg-dark-surface px-4 py-1.5 rounded-full border border-dark-border"
                >
                  {category}
                </span>
              ))}
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-6 leading-tight">
              {post.title}
            </h1>

            <div className="flex flex-wrap gap-4 text-dark-text-muted mb-6">
              <div className="flex items-center">
                <Calendar size={16} className="mr-2" />
                {formatDate(post.date)}
              </div>
              <div className="flex items-center">
                <Clock size={16} className="mr-2" />
                {post.readTime}
              </div>
            </div>

            {/* Keywords */}
            <div className="flex items-center flex-wrap gap-2 mb-8">
              <Tag size={16} className="text-dark-text-muted" />
              {post.keywords.map((keyword, idx) => (
                <span
                  key={idx}
                  className="text-sm text-dark-text-muted bg-dark-surface px-3 py-1 rounded-full border border-dark-border"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>

          {/* Featured Image */}
          {post.image && (
            <img
              src={post.image}
              alt={post.title}
              className="w-full rounded-lg mb-12 border border-dark-border"
            />
          )}

          {/* Post Content */}
          <div className="prose prose-invert prose-lg max-w-none mb-16">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[[rehypeHighlight, {
                languages: HIGHLIGHT_LANGUAGES,
                aliases: HIGHLIGHT_ALIASES,
                detect: false
              }]]}
              components={{
                h1: ({ node, ...props }) => <h1 className="text-3xl font-bold text-dark-text-primary mt-8 mb-4" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-dark-text-primary mt-6 mb-3" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-xl font-bold text-dark-text-primary mt-4 mb-2" {...props} />,
                p: ({ node, ...props }) => <p className="text-dark-text-secondary mb-4 leading-relaxed text-justify" {...props} />,
                a: ({ node, ...props }) => <a className="text-blue-400 hover:text-blue-300 underline" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc list-inside text-dark-text-secondary mb-4 space-y-2" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal list-inside text-dark-text-secondary mb-4 space-y-2" {...props} />,
                li: ({ node, ...props }) => <li className="ml-4" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote className="border-l-4 border-dark-border pl-4 italic text-dark-text-muted my-4" {...props} />
                ),
                code: ({ node, inline, ...props }) =>
                  inline ? (
                    <code className="bg-dark-surface text-blue-300 px-2 py-1 rounded text-sm font-mono border border-dark-border" {...props} />
                  ) : (
                    <code className="block bg-dark-surface p-4 rounded-lg overflow-x-auto border border-dark-border my-4" {...props} />
                  ),
                img: ({ node, ...props }) => <img className="rounded-lg my-6 border border-dark-border" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-bold text-dark-text-primary" {...props} />,
                em: ({ node, ...props }) => <em className="italic text-dark-text-secondary" {...props} />,
                hr: ({ node, ...props }) => <hr className="border-dark-border my-8" {...props} />,
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>

          {/* References */}
          {post.references && post.references.length > 0 && (
            <div className="mb-12 p-6 bg-dark-surface border border-dark-border rounded-lg">
              <h3 className="text-xl font-bold text-dark-text-primary mb-4">References</h3>
              <ol className="list-decimal list-inside space-y-2">
                {post.references.map((ref, idx) => (
                  <li key={idx} className="text-dark-text-secondary">
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline ml-2"
                    >
                      {ref.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </article>
    </div>
  );
};

export default BlogDetailPage;
