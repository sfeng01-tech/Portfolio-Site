import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import githubService from '../../services/githubService';
import AdminLayout from '../../components/admin/AdminLayout';
import { Plus, Edit2, Trash2, Calendar, Eye } from 'lucide-react';

const BlogAdmin = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const portfolioData = await githubService.fetchPortfolioData();
      setData(portfolioData);
    } catch (err) {
      toast.error('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (index) => {
    const post = data.blogPosts[index];
    if (!confirm(`Are you sure you want to delete "${post.title}"?`)) return;

    try {
      setSaving(true);
      const updatedPosts = data.blogPosts.filter((_, i) => i !== index);
      const updatedData = { ...data, blogPosts: updatedPosts };

      await githubService.updatePortfolioData(
        updatedData,
        `Delete blog post: ${post.title}`
      );

      setData(updatedData);
      toast.success('Blog post deleted successfully!');
    } catch (err) {
      toast.error('Failed to delete post: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString) => {
    const [year, month] = dateString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dark-text-primary mx-auto mb-4"></div>
            <p className="text-dark-text-secondary">Loading blog posts...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-dark-text-primary mb-2">Blog Posts</h1>
            <p className="text-dark-text-secondary">
              Manage your blog content ({data?.blogPosts?.length || 0} total)
            </p>
          </div>
          <Link
            to="/admin/blog/new"
            className="flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
          >
            <Plus size={20} />
            New Post
          </Link>
        </div>

        {/* Posts Grid */}
        <div className="grid grid-cols-1 gap-4">
          {data?.blogPosts?.map((post, index) => (
            <div
              key={index}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-dark-text-primary mb-2">
                    {post.title}
                  </h3>

                  <p className="text-dark-text-secondary mb-3 line-clamp-2">
                    {post.summary}
                  </p>

                  <div className="flex flex-wrap gap-3 text-sm text-dark-text-muted mb-3">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      {formatDate(post.date)}
                    </div>
                    <span>•</span>
                    <span>{post.readTime}</span>
                  </div>

                  {/* Categories */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(post.categories || [post.category]).map((cat, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-dark-bg text-dark-text-primary px-3 py-1 rounded-full border border-dark-border"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>

                  {/* Keywords */}
                  <div className="flex flex-wrap gap-2">
                    {post.keywords?.slice(0, 4).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="text-xs text-dark-text-muted bg-dark-surface px-2 py-1 rounded"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-4">
                  <Link
                    to={`/blog/${post.slug}`}
                    target="_blank"
                    className="p-2 text-dark-text-secondary hover:text-green-400 transition-colors"
                    title="View"
                  >
                    <Eye size={18} />
                  </Link>
                  <Link
                    to={`/admin/blog/${index}`}
                    className="p-2 text-dark-text-secondary hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </Link>
                  <button
                    onClick={() => handleDelete(index)}
                    disabled={saving}
                    className="p-2 text-dark-text-secondary hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {(!data?.blogPosts || data.blogPosts.length === 0) && (
            <div className="text-center py-12 text-dark-text-muted">
              <p className="mb-4">No blog posts yet. Write your first post!</p>
              <Link
                to="/admin/blog/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
              >
                <Plus size={20} />
                New Post
              </Link>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default BlogAdmin;
