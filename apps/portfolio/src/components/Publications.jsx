import React from 'react';
import { FileText, MapPin, Calendar, ExternalLink } from 'lucide-react';

const Publications = ({ publications }) => {
  return (
    <section id="publications" className="section-padding bg-dark-surface">
      <div className="container-width">
        <h2 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
          Publications
        </h2>
        <div className="w-20 h-1 bg-dark-border mb-12"></div>

        <div className="space-y-6">
          {publications.map((pub, index) => (
            <div
              key={index}
              className="bg-dark-bg border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-dark-text-primary mb-2">
                    {pub.title}
                  </h3>
                  <p className="text-dark-text-secondary text-sm mb-3">
                    {pub.authors.join(', ')}
                  </p>
                </div>
                {pub.pdf && (
                  <a
                    href={pub.pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 text-dark-text-secondary hover:text-dark-text-primary transition-colors flex-shrink-0"
                  >
                    <ExternalLink size={20} />
                  </a>
                )}
              </div>

              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                <div className="flex items-center text-dark-text-muted">
                  <FileText size={16} className="mr-2" />
                  <span className="font-semibold text-dark-text-secondary">
                    {pub.venue}
                  </span>
                  <span className="mx-2">•</span>
                  <span>{pub.type}</span>
                </div>

                <div className="flex items-center text-dark-text-muted">
                  <Calendar size={16} className="mr-2" />
                  <span>{pub.year}</span>
                </div>

                {pub.location && (
                  <div className="flex items-center text-dark-text-muted">
                    <MapPin size={16} className="mr-2" />
                    <span>{pub.location}</span>
                  </div>
                )}
              </div>

              {pub.abstract && (
                <p className="text-dark-text-secondary leading-relaxed text-sm">
                  {pub.abstract}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Publications;
