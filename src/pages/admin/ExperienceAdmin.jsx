import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import githubService from '../../services/githubService';
import AdminLayout from '../../components/admin/AdminLayout';
import Input from '../../components/admin/forms/Input';
import Textarea from '../../components/admin/forms/Textarea';
import ArrayInput from '../../components/admin/forms/ArrayInput';
import { validateRequired } from '../../utils/validation';
import { Plus, Edit2, Trash2, Save, X, Briefcase } from 'lucide-react';

const ExperienceAdmin = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    company: '',
    position: '',
    location: '',
    startDate: '',
    endDate: '',
    description: '',
    highlights: []
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
      company: '',
      position: '',
      location: '',
      startDate: '',
      endDate: '',
      description: '',
      highlights: []
    });
    setErrors({});
    setEditingIndex(null);
    setShowForm(false);
  };

  const handleEdit = (index) => {
    const experience = data.experiences[index];
    setFormData({ ...experience });
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleDelete = async (index) => {
    if (!confirm('Are you sure you want to delete this experience?')) return;

    try {
      setSaving(true);
      const updatedExperiences = data.experiences.filter((_, i) => i !== index);
      const updatedData = { ...data, experiences: updatedExperiences };

      await githubService.updatePortfolioData(
        updatedData,
        `Delete experience: ${data.experiences[index].position} at ${data.experiences[index].company}`
      );

      setData(updatedData);
      toast.success('Experience deleted successfully!');
    } catch (err) {
      toast.error('Failed to delete experience: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const companyError = validateRequired(formData.company, 'Company');
    if (companyError) newErrors.company = companyError;

    const positionError = validateRequired(formData.position, 'Position');
    if (positionError) newErrors.position = positionError;

    const locationError = validateRequired(formData.location, 'Location');
    if (locationError) newErrors.location = locationError;

    const startDateError = validateRequired(formData.startDate, 'Start Date');
    if (startDateError) newErrors.startDate = startDateError;

    const endDateError = validateRequired(formData.endDate, 'End Date');
    if (endDateError) newErrors.endDate = endDateError;

    const descError = validateRequired(formData.description, 'Description');
    if (descError) newErrors.description = descError;

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
      let updatedExperiences;
      let commitMessage;

      if (editingIndex !== null) {
        updatedExperiences = [...data.experiences];
        updatedExperiences[editingIndex] = formData;
        commitMessage = `Update experience: ${formData.position} at ${formData.company}`;
      } else {
        updatedExperiences = [...data.experiences, formData];
        commitMessage = `Add experience: ${formData.position} at ${formData.company}`;
      }

      const updatedData = { ...data, experiences: updatedExperiences };
      await githubService.updatePortfolioData(updatedData, commitMessage);

      setData(updatedData);
      toast.success(editingIndex !== null ? 'Experience updated!' : 'Experience added!');
      resetForm();
    } catch (err) {
      toast.error('Failed to save experience: ' + err.message);
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
            <p className="text-dark-text-secondary">Loading experience...</p>
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
            <h1 className="text-3xl font-bold text-dark-text-primary mb-2">Experience</h1>
            <p className="text-dark-text-secondary">
              Manage your work experience ({data?.experiences?.length || 0} total)
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
            >
              <Plus size={20} />
              Add Experience
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-dark-text-primary">
                {editingIndex !== null ? 'Edit Experience' : 'Add New Experience'}
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
                label="Company"
                name="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                error={errors.company}
                required
                placeholder="e.g., Advanced Micro Devices (AMD)"
              />

              <Input
                label="Position"
                name="position"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                error={errors.position}
                required
                placeholder="e.g., AI Technical Program Manager"
              />

              <Input
                label="Location"
                name="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                error={errors.location}
                required
                placeholder="e.g., San Jose, CA"
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Date"
                  name="startDate"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  error={errors.startDate}
                  required
                  placeholder="YYYY-MM"
                  helpText="Format: YYYY-MM"
                />

                <Input
                  label="End Date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  error={errors.endDate}
                  required
                  placeholder="Present or YYYY-MM"
                />
              </div>
            </div>

            <Textarea
              label="Description"
              name="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              error={errors.description}
              required
              rows={3}
              placeholder="Brief overview of your role and responsibilities..."
            />

            <ArrayInput
              label="Highlights"
              name="highlights"
              value={formData.highlights}
              onChange={(highlights) => setFormData({ ...formData, highlights })}
              placeholder="e.g., Led development of 8 critical features in 10 weeks"
              helpText="Key achievements and responsibilities"
            />

            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors disabled:opacity-50"
              >
                <Save size={20} />
                {saving ? 'Saving...' : (editingIndex !== null ? 'Update Experience' : 'Add Experience')}
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

        {/* Experience List */}
        <div className="space-y-6">
          {data?.experiences?.map((exp, index) => (
            <div
              key={index}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Briefcase className="text-dark-text-muted flex-shrink-0" size={20} />
                    <h3 className="text-xl font-bold text-dark-text-primary">
                      {exp.position}
                    </h3>
                  </div>
                  <p className="text-lg text-dark-text-secondary mb-1">
                    {exp.company}
                  </p>
                  <p className="text-sm text-dark-text-muted mb-3">
                    {exp.location} • {exp.startDate} - {exp.endDate}
                  </p>
                  <p className="text-dark-text-secondary mb-4">
                    {exp.description}
                  </p>
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

              {/* Highlights */}
              {exp.highlights?.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-sm text-dark-text-secondary">
                  {exp.highlights.map((highlight, idx) => (
                    <li key={idx}>{highlight}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {(!data?.experiences || data.experiences.length === 0) && !showForm && (
            <div className="text-center py-12 text-dark-text-muted">
              <p className="mb-4">No experience added yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
              >
                <Plus size={20} />
                Add Experience
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default ExperienceAdmin;
