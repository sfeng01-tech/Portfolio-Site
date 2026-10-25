import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Eye, EyeOff, Code } from 'lucide-react';

/**
 * MarkdownEditor Component with live preview
 */
const MarkdownEditor = ({
  label,
  name,
  value,
  onChange,
  error = null,
  required = false,
  helpText = null,
  rows = 15,
  className = ''
}) => {
  const [showPreview, setShowPreview] = useState(true);

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-dark-text-primary">
            {label}
            {required && <span className="text-red-400 ml-1">*</span>}
          </label>

          {/* Preview Toggle */}
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 px-3 py-1 text-xs text-dark-text-secondary hover:text-dark-text-primary border border-dark-border rounded-lg transition-colors"
          >
            {showPreview ? (
              <>
                <EyeOff size={14} />
                Hide Preview
              </>
            ) : (
              <>
                <Eye size={14} />
                Show Preview
              </>
            )}
          </button>
        </div>
      )}

      <div className={`grid ${showPreview ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'} gap-4`}>
        {/* Editor */}
        <div>
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-dark-surface border-b border-dark-border rounded-t-lg">
            <Code size={14} className="text-dark-text-muted" />
            <span className="text-xs text-dark-text-muted font-medium">Markdown</span>
          </div>
          <textarea
            id={name}
            name={name}
            value={value}
            onChange={onChange}
            rows={rows}
            className={`w-full px-4 py-3 bg-dark-bg border rounded-b-lg text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-2 transition-colors resize-y font-mono text-sm ${
              error
                ? 'border-red-500 focus:ring-red-500/50'
                : 'border-dark-border focus:ring-dark-text-primary/50'
            }`}
            placeholder="Write your markdown content here..."
          />
        </div>

        {/* Preview */}
        {showPreview && (
          <div>
            <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-dark-surface border-b border-dark-border rounded-t-lg">
              <Eye size={14} className="text-dark-text-muted" />
              <span className="text-xs text-dark-text-muted font-medium">Preview</span>
            </div>
            <div className={`px-4 py-3 bg-dark-bg border border-dark-border rounded-b-lg overflow-y-auto`}
                 style={{ height: `${rows * 24 + 24}px` }}>
              <div className="prose prose-invert prose-sm max-w-none">
                {value ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                  >
                    {value}
                  </ReactMarkdown>
                ) : (
                  <p className="text-dark-text-muted italic">Preview will appear here...</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {helpText && !error && (
        <p className="mt-2 text-xs text-dark-text-muted">{helpText}</p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}

      {/* Markdown Quick Reference */}
      <details className="mt-3">
        <summary className="text-xs text-dark-text-muted cursor-pointer hover:text-dark-text-primary">
          Markdown Quick Reference
        </summary>
        <div className="mt-2 p-3 bg-dark-surface border border-dark-border rounded-lg text-xs text-dark-text-muted space-y-1 font-mono">
          <div># Heading 1</div>
          <div>## Heading 2</div>
          <div>**bold** or __bold__</div>
          <div>*italic* or _italic_</div>
          <div>`code`</div>
          <div>```language</div>
          <div>code block</div>
          <div>```</div>
          <div>[link text](url)</div>
          <div>![alt text](image-url)</div>
          <div>- list item</div>
          <div>1. numbered list</div>
          <div>&gt; blockquote</div>
        </div>
      </details>
    </div>
  );
};

export default MarkdownEditor;
