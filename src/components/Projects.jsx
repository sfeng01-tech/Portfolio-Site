import React from 'react';
import { Github, ExternalLink, Code } from 'lucide-react';

const Projects = ({ projects }) => {
  return (
    <section id="projects" className="section-padding">
      <div className="container-width">
        <h2 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
          Projects
        </h2>
        <div className="w-20 h-1 bg-dark-border mb-12"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project, index) => (
            <div
              key={index}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-all hover:-translate-y-1 flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <Code className="text-dark-text-primary" size={28} />
                <div className="flex space-x-3">
                  {project.github && (
                    <a
                      href={project.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dark-text-secondary hover:text-dark-text-primary transition-colors"
                    >
                      <Github size={20} />
                    </a>
                  )}
                  {project.demo && (
                    <a
                      href={project.demo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-dark-text-secondary hover:text-dark-text-primary transition-colors"
                    >
                      <ExternalLink size={20} />
                    </a>
                  )}
                </div>
              </div>

              <h3 className="text-xl font-bold text-dark-text-primary mb-3">
                {project.title}
              </h3>

              {project.date && (
                <p className="text-sm text-dark-text-muted mb-3">
                  {project.date}
                </p>
              )}

              <p className="text-dark-text-secondary mb-4 leading-relaxed">
                {project.description}
              </p>

              <div className="space-y-3 mb-4">
                {project.highlights.map((highlight, idx) => (
                  <div key={idx} className="flex items-start text-sm">
                    <span className="text-dark-text-muted mr-2 mt-0.5">•</span>
                    <p className="text-dark-text-muted">{highlight}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t border-dark-border">
                {project.technologies.map((tech, idx) => (
                  <span
                    key={idx}
                    className="text-xs text-dark-text-muted bg-dark-bg px-2 py-1 rounded border border-dark-border"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Projects;
