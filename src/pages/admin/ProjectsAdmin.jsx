import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import githubService from '../../services/githubService';
import AdminLayout from '../../components/admin/AdminLayout';
import Input from '../../components/admin/forms/Input';
import Textarea from '../../components/admin/forms/Textarea';
import ArrayInput from '../../components/admin/forms/ArrayInput';
import { validateRequired, validateURL } from '../../utils/validation';
import { Plus, Edit2, Trash2, Save, X, ExternalLink, Github } from 'lucide-react';

const ProjectsAdmin = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    technologies: [],
    github: '',
    demo: '',
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
      title: '',
      description: '',
      technologies: [],
      github: '',
      demo: '',
      highlights: []
    });
    setErrors({});
    setEditingIndex(null);
    setShowForm(false);
  };

  const handleEdit = (index) => {
    const project = data.projects[index];
    setFormData({ ...project });
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleDelete = async (index) => {
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      setSaving(true);
      const updatedProjects = data.projects.filter((_, i) => i !== index);
      const updatedData = { ...data, projects: updatedProjects };

      await githubService.updatePortfolioData(
        updatedData,
        `Delete project: ${data.projects[index].title}`
      );

      setData(updatedData);
      toast.success('Project deleted successfully!');
    } catch (err) {
      toast.error('Failed to delete project: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const titleError = validateRequired(formData.title, 'Title');
    if (titleError) newErrors.title = titleError;

    const descError = validateRequired(formData.description, 'Description');
    if (descError) newErrors.description = descError;

    if (formData.github) {
      const githubError = validateURL(formData.github);
      if (githubError) newErrors.github = githubError;
    }

    if (formData.demo) {
      const demoError = validateURL(formData.demo);
      if (demoError) newErrors.demo = demoError;
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
      let updatedProjects;
      let commitMessage;

      if (editingIndex !== null) {
        updatedProjects = [...data.projects];
        updatedProjects[editingIndex] = formData;
        commitMessage = `Update project: ${formData.title}`;
      } else {
        updatedProjects = [...data.projects, formData];
        commitMessage = `Add project: ${formData.title}`;
      }

      const updatedData = { ...data, projects: updatedProjects };
      await githubService.updatePortfolioData(updatedData, commitMessage);

      setData(updatedData);
      toast.success(editingIndex !== null ? 'Project updated!' : 'Project added!');
      resetForm();
    } catch (err) {
      toast.error('Failed to save project: ' + err.message);
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
            <p className="text-dark-text-secondary">Loading projects...</p>
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
            <h1 className="text-3xl font-bold text-dark-text-primary mb-2">Projects</h1>
            <p className="text-dark-text-secondary">
              Manage your portfolio projects ({data?.projects?.length || 0} total)
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
            >
              <Plus size={20} />
              Add Project
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-dark-text-primary">
                {editingIndex !== null ? 'Edit Project' : 'Add New Project'}
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
              placeholder="e.g., LLM Inference Optimizer"
            />

            <Textarea
              label="Description"
              name="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              error={errors.description}
              required
              rows={3}
              placeholder="Brief description of the project..."
            />

            <ArrayInput
              label="Technologies"
              name="technologies"
              value={formData.technologies}
              onChange={(technologies) => setFormData({ ...formData, technologies })}
              placeholder="e.g., Python, PyTorch, CUDA"
              helpText="Press Enter or click Add to add each technology"
            />

            <Input
              label="GitHub URL"
              name="github"
              value={formData.github}
              onChange={(e) => setFormData({ ...formData, github: e.target.value })}
              error={errors.github}
              type="url"
              placeholder="https://github.com/username/repo"
            />

            <Input
              label="Demo URL"
              name="demo"
              value={formData.demo}
              onChange={(e) => setFormData({ ...formData, demo: e.target.value })}
              error={errors.demo}
              type="url"
              placeholder="https://demo.example.com"
            />

            <ArrayInput
              label="Highlights"
              name="highlights"
              value={formData.highlights}
              onChange={(highlights) => setFormData({ ...formData, highlights })}
              placeholder="e.g., Achieved 3x speedup in inference latency"
              helpText="Key achievements or features of this project"
            />

            <div className="flex gap-3 mt-6">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors disabled:opacity-50"
              >
                <Save size={20} />
                {saving ? 'Saving...' : (editingIndex !== null ? 'Update Project' : 'Add Project')}
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

        {/* Projects List */}
        <div className="space-y-4">
          {data?.projects?.map((project, index) => (
            <div
              key={index}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-dark-text-primary mb-2">
                    {project.title}
                  </h3>
                  <p className="text-dark-text-secondary mb-3">
                    {project.description}
                  </p>

                  {/* Technologies */}
                  {project.technologies?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {project.technologies.map((tech, idx) => (
                        <span
                          key={idx}
                          className="text-xs bg-dark-bg text-dark-text-primary px-3 py-1 rounded-full border border-dark-border"
                        >
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Links */}
                  <div className="flex gap-3">
                    {project.github && (
                      <a
                        href={project.github}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-dark-text-secondary hover:text-dark-text-primary"
                      >
                        <Github size={16} />
                        GitHub
                      </a>
                    )}
                    {project.demo && (
                      <a
                        href={project.demo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm text-dark-text-secondary hover:text-dark-text-primary"
                      >
                        <ExternalLink size={16} />
                        Demo
                      </a>
                    )}
                  </div>
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
              {project.highlights?.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-sm text-dark-text-secondary">
                  {project.highlights.map((highlight, idx) => (
                    <li key={idx}>{highlight}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {(!data?.projects || data.projects.length === 0) && !showForm && (
            <div className="text-center py-12 text-dark-text-muted">
              <p className="mb-4">No projects yet. Add your first project!</p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors"
              >
                <Plus size={20} />
                Add Project
              </button>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default ProjectsAdmin;
