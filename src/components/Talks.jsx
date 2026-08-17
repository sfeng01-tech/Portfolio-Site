import React from 'react';
import { Mic, MapPin, Calendar, FileText, Video, ExternalLink } from 'lucide-react';

const Talks = ({ talks }) => {
  const formatDate = (dateString) => {
    const [year, month] = dateString.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <section id="talks" className="section-padding">
      <div className="container-width">
        <h2 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
          Talks & Presentations
        </h2>
        <div className="w-20 h-1 bg-dark-border mb-12"></div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {talks.map((talk, index) => (
            <div
              key={index}
              className="bg-dark-surface border border-dark-border rounded-lg p-6 hover:border-dark-text-muted transition-all hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <Mic className="text-dark-text-primary" size={24} />
                <span className="text-xs text-dark-text-muted bg-dark-bg px-3 py-1 rounded-full border border-dark-border">
                  {talk.type}
                </span>
              </div>

              <h3 className="text-xl font-bold text-dark-text-primary mb-3">
                {talk.title}
              </h3>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center text-dark-text-secondary">
                  <Calendar size={16} className="mr-2 text-dark-text-muted" />
                  <span>{formatDate(talk.date)}</span>
                </div>

                <div className="flex items-center text-dark-text-secondary">
                  <MapPin size={16} className="mr-2 text-dark-text-muted" />
                  <span>{talk.event} • {talk.location}</span>
                </div>
              </div>

              <p className="text-dark-text-secondary mb-4 leading-relaxed">
                {talk.description}
              </p>

              <div className="flex gap-3 pt-4 border-t border-dark-border">
                {talk.slides && (
                  <a
                    href={talk.slides}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-sm text-dark-text-secondary hover:text-dark-text-primary transition-colors"
                  >
                    <FileText size={16} className="mr-1" />
                    Slides
                  </a>
                )}
                {talk.video && (
                  <a
                    href={talk.video}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-sm text-dark-text-secondary hover:text-dark-text-primary transition-colors"
                  >
                    <Video size={16} className="mr-1" />
                    Video
                  </a>
                )}
                {talk.post && (
                  <a
                    href={talk.post}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-sm text-dark-text-secondary hover:text-dark-text-primary transition-colors"
                  >
                    <ExternalLink size={16} className="mr-1" />
                    Event post
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Talks;
