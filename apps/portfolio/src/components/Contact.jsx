import React from 'react';
import { Linkedin, Github, Twitter, Mail, ArrowUpRight } from 'lucide-react';

const socialLink = 'w-12 h-12 bg-dark-bg border border-dark-border rounded-lg flex items-center justify-center text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-text-muted transition-colors';

const Contact = ({ profile }) => {
  const emailHref = profile.email ? `mailto:${profile.email}` : '';

  return (
    <section id="contact" className="section-padding bg-dark-surface">
      <div className="container-width">
        <h2 className="text-4xl md:text-5xl font-bold text-dark-text-primary mb-4">
          Get In Touch
        </h2>
        <div className="w-20 h-1 bg-dark-border mb-12"></div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div>
            <p className="text-lg text-dark-text-secondary mb-8 leading-relaxed">
              I'm always open to discussing new opportunities, collaborations, or just having a chat about technology and AI. Feel free to reach out!
            </p>

            <div className="pt-8 border-t border-dark-border">
              <p className="text-dark-text-muted mb-4">Connect with me:</p>
              <div className="flex gap-4">
                {profile.linkedin && (
                  <a
                    href={profile.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="LinkedIn"
                    className={socialLink}
                  >
                    <Linkedin size={20} />
                  </a>
                )}
                {profile.github && (
                  <a
                    href={profile.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="GitHub"
                    className={socialLink}
                  >
                    <Github size={20} />
                  </a>
                )}
                {profile.twitter && (
                  <a
                    href={profile.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="X"
                    className={socialLink}
                  >
                    <Twitter size={20} />
                  </a>
                )}
                {emailHref && (
                  <a
                    href={emailHref}
                    aria-label={`Email ${profile.email}`}
                    className={socialLink}
                  >
                    <Mail size={20} />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Direct contact */}
          <div className="bg-dark-bg border border-dark-border rounded-lg p-8">
            <h3 className="text-xl font-bold text-dark-text-primary mb-3">Start a conversation</h3>
            <p className="text-dark-text-secondary mb-8 leading-relaxed">
              Email is the quickest way to reach me. Include a little context about what you have in mind and I'll get back to you.
            </p>

            <div className="space-y-4">
              {emailHref && (
                <a
                  href={emailHref}
                  className="flex items-center justify-between gap-4 w-full bg-dark-text-primary text-dark-bg font-medium py-3 px-6 rounded-lg hover:bg-white transition-colors"
                >
                  <span className="flex items-center min-w-0">
                    <Mail size={20} className="mr-3 shrink-0" />
                    <span className="truncate">{profile.email}</span>
                  </span>
                  <ArrowUpRight size={18} className="shrink-0" />
                </a>
              )}

              {profile.linkedin && (
                <a
                  href={profile.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-4 w-full bg-dark-surface border border-dark-border text-dark-text-primary font-medium py-3 px-6 rounded-lg hover:border-dark-text-muted transition-colors"
                >
                  <span className="flex items-center">
                    <Linkedin size={20} className="mr-3" />
                    Connect on LinkedIn
                  </span>
                  <ArrowUpRight size={18} />
                </a>
              )}
            </div>

            <p className="mt-8 text-sm text-dark-text-muted">
              I usually reply within a few days.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-dark-border text-center text-dark-text-muted text-sm">
          <p>© {new Date().getFullYear()} {profile.name}. All rights reserved.</p>
        </div>
      </div>
    </section>
  );
};

export default Contact;
