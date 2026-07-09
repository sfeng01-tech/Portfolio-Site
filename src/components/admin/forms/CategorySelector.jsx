import React from 'react';
import { CATEGORIES } from '../../../utils/constants';

/**
 * CategorySelector Component for multi-category selection
 */
const CategorySelector = ({
  label,
  name,
  value = [],
  onChange,
  error = null,
  required = false,
  helpText = null,
  className = ''
}) => {
  const toggleCategory = (category) => {
    if (value.includes(category)) {
      onChange(value.filter(c => c !== category));
    } else {
      onChange([...value, category]);
    }
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-dark-text-primary mb-3">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {CATEGORIES.map((category) => {
          const isSelected = value.includes(category);

          return (
            <button
              key={category}
              type="button"
              onClick={() => toggleCategory(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                isSelected
                  ? 'bg-dark-text-primary text-dark-bg border-dark-text-primary'
                  : 'bg-dark-bg text-dark-text-secondary border-dark-border hover:border-dark-text-muted'
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>

      {/* Selected Categories Display */}
      {value.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-dark-text-muted">Selected:</span>
          {value.map((category) => (
            <span
              key={category}
              className="text-xs bg-dark-text-primary text-dark-bg px-2 py-1 rounded-full"
            >
              {category}
            </span>
          ))}
        </div>
      )}

      {helpText && !error && (
        <p className="mt-2 text-xs text-dark-text-muted">{helpText}</p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
};

export default CategorySelector;
