import React, { lazy, Suspense, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { portfolioData } from '../data/portfolioData';

// The markdown renderer and syntax highlighter are the heaviest part of the
// blog. Only local posts need them; external posts leave the site immediately.
const LocalBlogPost = lazy(() => import('./BlogDetailPage'));

const BlogPostFallback = () => (
  <div className="pt-20 min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-dark-text-primary" />
      <p className="mt-4 text-dark-text-muted">Loading post…</p>
    </div>
  </div>
);

export default function BlogPostPage() {
  const { slug } = useParams();
  const post = portfolioData.blogPosts.find(candidate => candidate.slug === slug);

  useEffect(() => {
    if (post?.externalUrl) window.location.replace(post.externalUrl);
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
          <a href={post.externalUrl} className="text-dark-text-secondary hover:text-dark-text-primary">
            Open the article
          </a>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<BlogPostFallback />}>
      <LocalBlogPost />
    </Suspense>
  );
}
