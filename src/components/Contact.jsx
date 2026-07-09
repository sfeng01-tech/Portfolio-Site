import React, { useState } from 'react';
import { Linkedin, Github, Twitter, Send } from 'lucide-react';

const Contact = ({ profile }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Form submission logic would go here
    console.log('Form submitted:', formData);
    alert('Form submitted! (This is a demo - integrate with your backend)');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

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
                    className="w-12 h-12 bg-dark-bg border border-dark-border rounded-lg flex items-center justify-center text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-text-muted transition-colors"
                  >
                    <Linkedin size={20} />
                  </a>
                )}
                {profile.github && (
                  <a
                    href={profile.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 bg-dark-bg border border-dark-border rounded-lg flex items-center justify-center text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-text-muted transition-colors"
                  >
                    <Github size={20} />
                  </a>
                )}
                {profile.twitter && (
                  <a
                    href={profile.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-12 h-12 bg-dark-bg border border-dark-border rounded-lg flex items-center justify-center text-dark-text-secondary hover:text-dark-text-primary hover:border-dark-text-muted transition-colors"
                  >
                    <Twitter size={20} />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-dark-bg border border-dark-border rounded-lg p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-dark-text-secondary mb-2"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-4 py-3 text-dark-text-primary focus:outline-none focus:border-dark-text-muted transition-colors"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-dark-text-secondary mb-2"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-4 py-3 text-dark-text-primary focus:outline-none focus:border-dark-text-muted transition-colors"
                  placeholder="your.email@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-medium text-dark-text-secondary mb-2"
                >
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={6}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-4 py-3 text-dark-text-primary focus:outline-none focus:border-dark-text-muted transition-colors resize-none"
                  placeholder="Your message..."
                />
              </div>

              <button
                type="submit"
                className="w-full bg-dark-text-primary text-dark-bg font-medium py-3 px-6 rounded-lg hover:bg-white transition-colors flex items-center justify-center"
              >
                <Send size={20} className="mr-2" />
                Send Message
              </button>
            </form>
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
