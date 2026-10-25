import React, { useState } from 'react';
import { Plus, X, GripVertical } from 'lucide-react';

/**
 * ArrayInput Component for managing array of strings
 */
const ArrayInput = ({
  label,
  name,
  value = [],
  onChange,
  placeholder = 'Add item...',
  error = null,
  required = false,
  helpText = null,
  className = ''
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onChange([...value, inputValue.trim()]);
      setInputValue('');
    }
  };

  const handleRemove = (index) => {
    const newValue = value.filter((_, i) => i !== index);
    onChange(newValue);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-dark-text-primary mb-2">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      {/* Existing Items */}
      {value.length > 0 && (
        <div className="space-y-2 mb-3">
          {value.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 group"
            >
              <GripVertical size={16} className="text-dark-text-muted flex-shrink-0" />
              <span className="flex-1 text-sm text-dark-text-primary">{item}</span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="text-dark-text-muted hover:text-red-400 transition-colors"
                aria-label={`Remove ${item}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-dark-text-primary placeholder-dark-text-muted focus:outline-none focus:ring-2 focus:ring-dark-text-primary/50 transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 bg-dark-text-primary text-dark-bg rounded-lg hover:bg-dark-text-secondary transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          Add
        </button>
      </div>

      {helpText && !error && (
        <p className="mt-1 text-xs text-dark-text-muted">{helpText}</p>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
};

export default ArrayInput;
