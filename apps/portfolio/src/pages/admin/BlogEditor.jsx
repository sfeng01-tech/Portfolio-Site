import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import slugify from 'slugify';
import githubService from '../../services/githubService';
import AdminLayout from '../../components/admin/AdminLayout';
import Input from '../../components/admin/forms/Input';
import Textarea from '../../components/admin/forms/Textarea';
import ArrayInput from '../../components/admin/forms/ArrayInput';
import CategorySelector from '../../components/admin/forms/CategorySelector';
import MarkdownEditor from '../../components/admin/forms/MarkdownEditor';
import { validateRequired, validateSlug } from '../../utils/validation';
import { Save, ArrowLeft } from 'lucide-react';

const BlogEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    date: new Date().toISOString().slice(0, 7), // YYYY-MM
    categories: [],
    keywords: [],
    summary: '',
    content: '',
    readTime: '',
    image: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const portfolioData = await githubService.fetchPortfolioData();
      setData(portfolioData);

      // If editing existing post
      if (id !== 'new') {
        const postIndex = parseInt(id);
        const post = portfolioData.blogPosts[postIndex];
        if (post) {
          setFormData({
            ...post,
            categories: post.categories || [post.category || '']
          });
        }
      }
    } catch (err) {
      toast.error('Failed to load data: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTitleChange = (e) => {
    const title = e.target.value;
    const autoSlug = slugify(title, { lower: true, strict: true });
    setFormData({ ...formData, title, slug: autoSlug });
  };

  const validateForm = () => {
    const newErrors = {};

    const titleError = validateRequired(formData.title, 'Title');
    if (titleError) newErrors.title = titleError;

    const slugError = validateSlug(formData.slug);
    if (slugError) newErrors.slug = slugError;

    const summaryError = validateRequired(formData.summary, 'Summary');
    if (summaryError) newErrors.summary = summaryError;

    const contentError = validateRequired(formData.content, 'Content');
    if (contentError) newErrors.content = contentError;

    if (formData.categories.length === 0) {
      newErrors.categories = 'Please select at least one category';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors in the form');
      return;
    }

    try {
      setSaving(true);
      let updatedPosts;
      let commitMessage;

      const postData = { ...formData };

      if (id !== 'new') {
        updatedPosts = [...data.blogPosts];
        updatedPosts[parseInt(id)] = postData;
        commitMessage = `Update blog post: ${formData.title}`;
      } else {
        updatedPosts = [...data.blogPosts, postData];
        commitMessage = `Add blog post: ${formData.title}`;
      }

      const updatedData = { ...data, blogPosts: updatedPosts };
      await githubService.updatePortfolioData(updatedData, commitMessage);

      toast.success(id !== 'new' ? 'Post updated!' : 'Post published!');
      navigate('/admin/blog');
    } catch (err) {
      toast.error('Failed to save post: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-dark-text-primary mx-auto mb-4"></div>
            <p className="text-dark-text-secondary">Loading...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <Toaster position="top-right" />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/admin/blog')}
            className="p-2 text-dark-text-secondary hover:text-dark-text-primary transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-dark-text-primary">
              {id === 'new' ? 'New Blog Post' : 'Edit Blog Post'}
            </h1>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-lg p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content (2/3) */}
            <div className="lg:col-span-2 space-y-6">
              <Input
                label="Title"
                name="title"
                value={formData.title}
                onChange={handleTitleChange}
                error={errors.title}
                required
                placeholder="Your blog post title..."
              />

              <Input
                label="Slug"
                name="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                error={errors.slug}
                required
                helpText="URL-friendly version (auto-generated from title)"
                placeholder="your-blog-post-slug"
              />

              <Textarea
                label="Summary"
                name="summary"
                value={formData.summary}
                onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                error={errors.summary}
                required
                rows={3}
                placeholder="Brief summary of your post..."
              />

              <MarkdownEditor
                label="Content"
                name="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                error={errors.content}
                required
                rows={20}
              />
            </div>

            {/* Sidebar (1/3) */}
            <div className="space-y-6">
              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-dark-text-primary mb-4">
                  Post Settings
                </h3>

                <Input
                  label="Publish Date"
                  name="date"
                  type="text"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  placeholder="YYYY-MM"
                  helpText="Format: YYYY-MM"
                />

                <Input
                  label="Read Time"
                  name="readTime"
                  value={formData.readTime}
                  onChange={(e) => setFormData({ ...formData, readTime: e.target.value })}
                  placeholder="e.g., 10 min"
                />

                <Input
                  label="Cover Image URL"
                  name="image"
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  placeholder="https://..."
                />
              </div>

              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <CategorySelector
                  label="Categories"
                  name="categories"
                  value={formData.categories}
                  onChange={(categories) => setFormData({ ...formData, categories })}
                  error={errors.categories}
                  required
                />
              </div>

              <div className="bg-dark-bg border border-dark-border rounded-lg p-4">
                <ArrayInput
                  label="Keywords"
                  name="keywords"
                  value={formData.keywords}
                  onChange={(keywords) => setFormData({ ...formData, keywords })}
                  placeholder="Add keyword..."
                  helpText="Tags for search and organization"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors disabled:opacity-50"
              >
                <Save size={20} />
                {saving ? 'Saving...' : (id === 'new' ? 'Publish Post' : 'Update Post')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default BlogEditor;
