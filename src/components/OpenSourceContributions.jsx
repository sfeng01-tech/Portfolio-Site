import React from 'react';
import { ExternalLink, FileText, GitPullRequest, Github, Tag } from 'lucide-react';

const OpenSourceContributions = ({ contributions }) => {
  return (
    <section className="section-padding" aria-labelledby="open-source-heading">
      <div className="container-width">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-12">
          <div>
            <h2 id="open-source-heading" className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
              Open Source Contributions
            </h2>
            <p className="text-dark-text-secondary max-w-2xl leading-relaxed">
              {contributions.summary}
            </p>
          </div>
          <a
            href={contributions.profile}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-dark-text-secondary hover:text-dark-text-primary transition-colors"
          >
            <Github size={18} />
            View @sa-faizal
            <ExternalLink size={15} />
          </a>
        </div>

        <div className="mt-16 mb-16">
          <div className="flex items-center gap-3 mb-3">
            <Tag size={22} className="text-dark-text-primary" />
            <h3 className="text-2xl font-bold text-dark-text-primary">Release Engineering</h3>
          </div>
          <p className="text-dark-text-secondary mb-6 max-w-3xl">
            Owned release cutovers across an AI/ML compiler and inference stack: maintained version branches, authored release notes, updated release metadata, and coordinated CI, packaging, and compatibility validation. Ensured software quality by validating build artifacts and installation paths, reviewing regression coverage, verifying compiler and runtime compatibility against GPU-backed inference workflows, and triaging release-blocking issues before publication.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {contributions.releaseWork.map((release) => (
              <article key={release.version} className="bg-dark-surface border border-dark-border rounded-lg p-6">
                <h4 className="text-xl font-bold text-dark-text-primary">Release {release.version}</h4>
                <p className="text-sm text-dark-text-muted mt-1 mb-5">{release.date}</p>
                <div className="space-y-4">
                  {release.releases.map((item) => (
                    <div key={item.repository} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-dark-text-secondary">{item.repository}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <a href={item.releaseUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.repository} ${release.version} ${item.releaseLabel || 'release notes'}`} className="text-dark-text-secondary hover:text-dark-text-primary transition-colors" title={item.releaseLabel || 'Release notes'}>
                          <FileText size={18} />
                        </a>
                        {item.bumpUrl && (
                          <a href={item.bumpUrl} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.repository} ${release.version} version bump pull request`} className="text-dark-text-secondary hover:text-dark-text-primary transition-colors" title="Version-bump pull request">
                            <GitPullRequest size={18} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <GitPullRequest size={22} className="text-dark-text-primary" />
          <h3 className="text-2xl font-bold text-dark-text-primary">Selected Merged Contributions</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {contributions.contributions.map((contribution) => (
            <article
              key={contribution.url}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <GitPullRequest className="text-dark-text-primary" size={28} />
                <span className="text-xs text-dark-text-muted border border-dark-border rounded-full px-2 py-1">
                  Merged
                </span>
              </div>
              <p className="text-sm text-dark-text-muted mb-2">{contribution.repository}</p>
              <h3 className="text-xl font-bold text-dark-text-primary mb-3">
                {contribution.title}
              </h3>
              <p className="text-dark-text-secondary leading-relaxed mb-5 flex-grow">
                {contribution.description}
              </p>
              <div className="pt-4 border-t border-dark-border flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-dark-text-muted">{contribution.date}</p>
                  <p className="text-xs text-dark-text-muted mt-1">{contribution.changes}</p>
                </div>
                <a
                  href={contribution.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${contribution.title} pull request`}
                  className="text-dark-text-secondary hover:text-dark-text-primary transition-colors"
                >
                  <ExternalLink size={20} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default OpenSourceContributions;
