import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import githubService from '../../services/githubService';
import AdminLayout from '../../components/admin/AdminLayout';
import Input from '../../components/admin/forms/Input';
import Textarea from '../../components/admin/forms/Textarea';
import CategorySelector from '../../components/admin/forms/CategorySelector';
import { validateRequired, validateURL, validateNumberRange } from '../../utils/validation';
import { Plus, Edit2, Trash2, Save, X, Star, ExternalLink } from 'lucide-react';

const BooksAdmin = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    cover: '',
    rating: 5,
    dateRead: '',
    review: '',
    categories: [],
    link: ''
  });
  const [errors, setErrors] = useState({});

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

  const resetForm = () => {
    setFormData({
      title: '',
      author: '',
      cover: '',
      rating: 5,
      dateRead: '',
      review: '',
      categories: [],
      link: ''
    });
    setErrors({});
    setEditingIndex(null);
    setShowForm(false);
  };

  const handleEdit = (index) => {
    const book = data.books[index];
    setFormData({ ...book });
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleDelete = async (index) => {
    if (!confirm('Are you sure you want to delete this book?')) return;

    try {
      setSaving(true);
      const updatedBooks = data.books.filter((_, i) => i !== index);
      const updatedData = { ...data, books: updatedBooks };

      await githubService.updatePortfolioData(
        updatedData,
        `Delete book: ${data.books[index].title}`
      );

      setData(updatedData);
      toast.success('Book deleted successfully!');
    } catch (err) {
      toast.error('Failed to delete book: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const titleError = validateRequired(formData.title, 'Title');
    if (titleError) newErrors.title = titleError;

    const authorError = validateRequired(formData.author, 'Author');
    if (authorError) newErrors.author = authorError;

    const ratingError = validateNumberRange(formData.rating, 1, 5, 'Rating');
    if (ratingError) newErrors.rating = ratingError;

    if (formData.link) {
      const linkError = validateURL(formData.link);
      if (linkError) newErrors.link = linkError;
    }

    if (formData.cover) {
      const coverError = validateURL(formData.cover);
      if (coverError) newErrors.cover = coverError;
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
      let updatedBooks;
      let commitMessage;

      if (editingIndex !== null) {
        updatedBooks = [...data.books];
        updatedBooks[editingIndex] = formData;
        commitMessage = `Update book: ${formData.title}`;
      } else {
        updatedBooks = [...data.books, formData];
        commitMessage = `Add book: ${formData.title}`;
      }

      const updatedData = { ...data, books: updatedBooks };
      await githubService.updatePortfolioData(updatedData, commitMessage);

      setData(updatedData);
      toast.success(editingIndex !== null ? 'Book updated!' : 'Book added!');
      resetForm();
    } catch (err) {
      toast.error('Failed to save book: ' + err.message);
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
            <p className="text-dark-text-secondary">Loading books...</p>
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
            <h1 className="text-3xl font-bold text-dark-text-primary mb-2">Books</h1>
            <p className="text-dark-text-secondary">
              Manage your reading list ({data?.books?.length || 0} total)
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
            >
              <Plus size={20} />
              Add Book
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-dark-text-primary">
                {editingIndex !== null ? 'Edit Book' : 'Add New Book'}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="text-dark-text-muted hover:text-dark-text-primary"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Title"
                name="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                error={errors.title}
                required
                placeholder="e.g., Designing Data-Intensive Applications"
              />

              <Input
                label="Author"
                name="author"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                error={errors.author}
                required
                placeholder="e.g., Martin Kleppmann"
              />

              <Input
                label="Cover Image URL"
                name="cover"
                type="url"
                value={formData.cover}
                onChange={(e) => setFormData({ ...formData, cover: e.target.value })}
                error={errors.cover}
                placeholder="https://..."
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Rating"
                  name="rating"
                  type="number"
                  value={formData.rating}
                  onChange={(e) => setFormData({ ...formData, rating: parseInt(e.target.value) })}
                  error={errors.rating}
                  required
                  placeholder="1-5"
                  helpText="1 to 5 stars"
                />

                <Input
                  label="Date Read"
                  name="dateRead"
                  value={formData.dateRead}
                  onChange={(e) => setFormData({ ...formData, dateRead: e.target.value })}
                  placeholder="YYYY-MM"
                  helpText="Format: YYYY-MM"
                />
              </div>
            </div>

            <Textarea
              label="Review"
              name="review"
              value={formData.review}
              onChange={(e) => setFormData({ ...formData, review: e.target.value })}
              rows={3}
              placeholder="Your thoughts on the book..."
            />

            <CategorySelector
              label="Categories"
              name="categories"
              value={formData.categories}
              onChange={(categories) => setFormData({ ...formData, categories })}
            />

            <Input
              label="Book Link"
              name="link"
              type="url"
              value={formData.link}
              onChange={(e) => setFormData({ ...formData, link: e.target.value })}
              error={errors.link}
              placeholder="https://..."
              helpText="Link to the book's website or purchase page"
            />

            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors disabled:opacity-50"
              >
                <Save size={20} />
                {saving ? 'Saving...' : (editingIndex !== null ? 'Update Book' : 'Add Book')}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 bg-dark-bg text-dark-text-secondary border border-dark-border rounded-lg hover:border-dark-text-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Books Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.books?.map((book, index) => (
            <div
              key={index}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors"
            >
              {book.cover && (
                <img
                  src={book.cover}
                  alt={book.title}
                  className="w-full h-48 object-cover rounded-lg mb-4 border border-dark-border"
                />
              )}

              <h3 className="text-lg font-bold text-dark-text-primary mb-1">
                {book.title}
              </h3>
              <p className="text-sm text-dark-text-secondary mb-2">
                by {book.author}
              </p>

              {/* Rating */}
              <div className="flex items-center mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={14}
                    className={i < book.rating ? 'text-yellow-500 fill-yellow-500' : 'text-dark-border'}
                  />
                ))}
                <span className="text-xs text-dark-text-muted ml-2">
                  {book.rating}/5
                </span>
              </div>

              {book.review && (
                <p className="text-sm text-dark-text-secondary mb-3 line-clamp-3">
                  {book.review}
                </p>
              )}

              {/* Categories */}
              {book.categories?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {book.categories.slice(0, 3).map((cat, idx) => (
                    <span
                      key={idx}
                      className="text-xs bg-dark-bg text-dark-text-muted px-2 py-1 rounded"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-dark-border">
                {book.link && (
                  <a
                    href={book.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-dark-text-secondary hover:text-dark-text-primary flex items-center gap-1"
                  >
                    <ExternalLink size={14} />
                    View
                  </a>
                )}
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => handleEdit(index)}
                    className="p-1 text-dark-text-secondary hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    disabled={saving}
                    className="p-1 text-dark-text-secondary hover:text-red-400 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {(!data?.books || data.books.length === 0) && !showForm && (
            <div className="col-span-full text-center py-12 text-dark-text-muted">
              <p className="mb-4">No books added yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
              >
                <Plus size={20} />
                Add Book
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default BooksAdmin;
