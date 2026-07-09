import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import githubService from '../../services/githubService';
import AdminLayout from '../../components/admin/AdminLayout';
import Input from '../../components/admin/forms/Input';
import Textarea from '../../components/admin/forms/Textarea';
import ArrayInput from '../../components/admin/forms/ArrayInput';
import CategorySelector from '../../components/admin/forms/CategorySelector';
import { validateRequired, validateURL } from '../../utils/validation';
import { Plus, Edit2, Trash2, Save, X, FileText, ExternalLink } from 'lucide-react';

const PapersAdmin = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    authors: '',
    venue: '',
    journal: '',
    year: new Date().getFullYear().toString(),
    pdf: '',
    summary: '',
    keyTakeaways: [],
    tags: []
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
      authors: '',
      venue: '',
      journal: '',
      year: new Date().getFullYear().toString(),
      pdf: '',
      summary: '',
      keyTakeaways: [],
      tags: []
    });
    setErrors({});
    setEditingIndex(null);
    setShowForm(false);
  };

  const handleEdit = (index) => {
    const paper = data.researchPapers[index];
    setFormData({ ...paper });
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleDelete = async (index) => {
    if (!confirm('Are you sure you want to delete this paper?')) return;

    try {
      setSaving(true);
      const updatedPapers = data.researchPapers.filter((_, i) => i !== index);
      const updatedData = { ...data, researchPapers: updatedPapers };

      await githubService.updatePortfolioData(
        updatedData,
        `Delete research paper: ${data.researchPapers[index].title}`
      );

      setData(updatedData);
      toast.success('Paper deleted successfully!');
    } catch (err) {
      toast.error('Failed to delete paper: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const titleError = validateRequired(formData.title, 'Title');
    if (titleError) newErrors.title = titleError;

    const authorsError = validateRequired(formData.authors, 'Authors');
    if (authorsError) newErrors.authors = authorsError;

    if (!formData.venue && !formData.journal) {
      newErrors.venue = 'Either venue or journal is required';
    }

    if (formData.pdf) {
      const pdfError = validateURL(formData.pdf);
      if (pdfError) newErrors.pdf = pdfError;
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
      let updatedPapers;
      let commitMessage;

      if (editingIndex !== null) {
        updatedPapers = [...data.researchPapers];
        updatedPapers[editingIndex] = formData;
        commitMessage = `Update research paper: ${formData.title}`;
      } else {
        updatedPapers = [...data.researchPapers, formData];
        commitMessage = `Add research paper: ${formData.title}`;
      }

      const updatedData = { ...data, researchPapers: updatedPapers };
      await githubService.updatePortfolioData(updatedData, commitMessage);

      setData(updatedData);
      toast.success(editingIndex !== null ? 'Paper updated!' : 'Paper added!');
      resetForm();
    } catch (err) {
      toast.error('Failed to save paper: ' + err.message);
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
            <p className="text-dark-text-secondary">Loading papers...</p>
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
            <h1 className="text-3xl font-bold text-dark-text-primary mb-2">Research Papers</h1>
            <p className="text-dark-text-secondary">
              Manage your paper reading list ({data?.researchPapers?.length || 0} total)
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
            >
              <Plus size={20} />
              Add Paper
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-dark-text-primary">
                {editingIndex !== null ? 'Edit Paper' : 'Add New Paper'}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="text-dark-text-muted hover:text-dark-text-primary"
              >
                <X size={24} />
              </button>
            </div>

            <Input
              label="Title"
              name="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              error={errors.title}
              required
              placeholder="e.g., Attention Is All You Need"
            />

            <Input
              label="Authors"
              name="authors"
              value={formData.authors}
              onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
              error={errors.authors}
              required
              placeholder="e.g., Vaswani et al."
              helpText="Format: Last name et al. or comma-separated names"
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Venue"
                name="venue"
                value={formData.venue}
                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                error={errors.venue}
                placeholder="e.g., NeurIPS 2017"
                helpText="Conference name"
              />

              <Input
                label="Journal"
                name="journal"
                value={formData.journal}
                onChange={(e) => setFormData({ ...formData, journal: e.target.value })}
                placeholder="e.g., Nature"
                helpText="Or journal name"
              />

              <Input
                label="Year"
                name="year"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                placeholder="YYYY"
              />
            </div>

            <Input
              label="PDF Link"
              name="pdf"
              type="url"
              value={formData.pdf}
              onChange={(e) => setFormData({ ...formData, pdf: e.target.value })}
              error={errors.pdf}
              placeholder="https://arxiv.org/abs/..."
            />

            <Textarea
              label="Summary"
              name="summary"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              rows={4}
              placeholder="Brief summary of the paper's contribution..."
            />

            <ArrayInput
              label="Key Takeaways"
              name="keyTakeaways"
              value={formData.keyTakeaways}
              onChange={(keyTakeaways) => setFormData({ ...formData, keyTakeaways })}
              placeholder="e.g., Self-attention mechanism eliminates need for recurrence"
              helpText="Main insights from the paper"
            />

            <CategorySelector
              label="Tags/Categories"
              name="tags"
              value={formData.tags}
              onChange={(tags) => setFormData({ ...formData, tags })}
              helpText="Select relevant categories for this paper"
            />

            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors disabled:opacity-50"
              >
                <Save size={20} />
                {saving ? 'Saving...' : (editingIndex !== null ? 'Update Paper' : 'Add Paper')}
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

        {/* Papers List */}
        <div className="space-y-4">
          {data?.researchPapers?.map((paper, index) => (
            <div
              key={index}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="text-dark-text-muted flex-shrink-0" size={18} />
                    <h3 className="text-lg font-bold text-dark-text-primary">
                      {paper.title}
                    </h3>
                  </div>

                  <p className="text-sm text-dark-text-secondary mb-2">
                    {paper.authors}
                  </p>

                  <p className="text-sm text-dark-text-muted mb-3">
                    {paper.venue || paper.journal} • {paper.year}
                  </p>

                  {paper.summary && (
                    <p className="text-sm text-dark-text-secondary mb-3">
                      {paper.summary}
                    </p>
                  )}

                  {/* Tags */}
                  {paper.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {paper.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-xs bg-dark-bg text-dark-text-muted px-2 py-1 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {paper.pdf && (
                    <a
                      href={paper.pdf}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink size={14} />
                      View PDF
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(index)}
                    className="p-2 text-dark-text-secondary hover:text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit2 size={18} />
                  </button>
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

              {/* Key Takeaways */}
              {paper.keyTakeaways?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-dark-border">
                  <h4 className="text-sm font-semibold text-dark-text-primary mb-2">
                    Key Takeaways:
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-dark-text-secondary">
                    {paper.keyTakeaways.map((takeaway, idx) => (
                      <li key={idx}>{takeaway}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {(!data?.researchPapers || data.researchPapers.length === 0) && !showForm && (
            <div className="text-center py-12 text-dark-text-muted">
              <p className="mb-4">No research papers added yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
              >
                <Plus size={20} />
                Add Paper
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default PapersAdmin;
