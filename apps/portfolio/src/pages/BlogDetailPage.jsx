import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, Clock, Tag, User, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { portfolioData } from '../data/portfolioData';
import 'highlight.js/styles/atom-one-dark.css';

const BlogDetailPage = () => {
  const { slug } = useParams();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState({ name: '', comment: '' });

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

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (newComment.name && newComment.comment) {
      setComments([
        ...comments,
        {
          ...newComment,
          date: new Date().toISOString(),
          id: Date.now()
        }
      ]);
      setNewComment({ name: '', comment: '' });
    }
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
              rehypePlugins={[rehypeHighlight]}
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

          {/* Comments Section */}
          <div className="border-t border-dark-border pt-12">
            <h3 className="text-2xl font-bold text-dark-text-primary mb-6 flex items-center">
              <MessageCircle className="mr-3" size={24} />
              Comments ({comments.length})
            </h3>

            {/* Comment Form */}
            <form onSubmit={handleCommentSubmit} className="mb-8 p-6 bg-dark-surface border border-dark-border rounded-lg">
              <div className="mb-4">
                <label htmlFor="name" className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={newComment.name}
                  onChange={(e) => setNewComment({ ...newComment, name: e.target.value })}
                  required
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-dark-text-primary focus:outline-none focus:border-dark-text-muted transition-colors"
                  placeholder="Your name"
                />
              </div>
              <div className="mb-4">
                <label htmlFor="comment" className="block text-sm font-medium text-dark-text-secondary mb-2">
                  Comment
                </label>
                <textarea
                  id="comment"
                  value={newComment.comment}
                  onChange={(e) => setNewComment({ ...newComment, comment: e.target.value })}
                  required
                  rows={4}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-4 py-2 text-dark-text-primary focus:outline-none focus:border-dark-text-muted transition-colors resize-none"
                  placeholder="Share your thoughts..."
                />
              </div>
              <button
                type="submit"
                className="bg-dark-text-primary text-dark-bg font-medium py-2 px-6 rounded-lg hover:bg-white transition-colors"
              >
                Post Comment
              </button>
            </form>

            {/* Comments List */}
            <div className="space-y-4">
              {comments.length === 0 ? (
                <p className="text-dark-text-muted text-center py-8">No comments yet. Be the first to comment!</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="p-6 bg-dark-surface border border-dark-border rounded-lg">
                    <div className="flex items-center mb-3">
                      <User size={16} className="text-dark-text-muted mr-2" />
                      <span className="font-semibold text-dark-text-primary">{comment.name}</span>
                      <span className="text-dark-text-muted text-sm ml-4">
                        {new Date(comment.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-dark-text-secondary">{comment.comment}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
};

export default BlogDetailPage;
